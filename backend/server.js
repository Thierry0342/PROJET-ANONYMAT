require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const xlsx = require('xlsx');
const { jsPDF } = require("jspdf");
const autoTable = require('jspdf-autotable').default;
const apiPaths = require('./config/apiPaths');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error("ERREUR FATALE : La variable d'environnement JWT_SECRET n'est pas définie.");
    process.exit(1);
}

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE
}).promise();
const runMigrations = async () => {
    // Fonction utilitaire pour vérifier l'existence d'une colonne
    const columnExists = async (table, column) => {
        const [rows] = await db.query(`
            SELECT COUNT(*) as count 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
              AND TABLE_NAME = ? 
              AND COLUMN_NAME = ?
        `, [table, column]);
        return rows[0].count > 0;
    };

    // 1. Migration : motif_non_classe
    try {
        const hasMotif = await columnExists('statistiques_classement', 'motif_non_classe');
        if (!hasMotif) {
            await db.query(`
                ALTER TABLE statistiques_classement 
                ADD COLUMN motif_non_classe VARCHAR(255) NULL DEFAULT NULL
            `);
            console.log('✅ Migration OK : motif_non_classe créé');
        } else {
            console.log('⏭️  Migration skipped : motif_non_classe existe déjà');
        }
    } catch (err) {
        console.error('❌ Erreur migration statistiques_classement:', err.message);
    }

    // 2. Migration : promotion
    try {
        const hasPromotion = await columnExists('modeles_examens', 'promotion');
        if (!hasPromotion) {
            await db.query(`
                ALTER TABLE modeles_examens 
                ADD COLUMN promotion VARCHAR(50) NULL DEFAULT NULL
            `);
            console.log('✅ Migration OK : modeles_examens.promotion créé');
        } else {
            console.log('⏭️  Migration skipped : modeles_examens.promotion existe déjà');
        }
    } catch (err) {
        console.error('❌ Erreur migration modeles_examens:', err.message);
    }

    // 3. Logique de logs et contraintes (One-time)
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS migrations_log (
                id INT AUTO_INCREMENT PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // double vérification pour la suite pour éviter les crashs si la colonne n'est pas encore là
        const hasPromotionNow = await columnExists('modeles_examens', 'promotion');
        if (hasPromotionNow) {
            // ── Migration one-time : assigner les modèles existants à 79E ──
            const [[alreadyDone79E]] = await db.query(`
                SELECT id FROM migrations_log WHERE migration_name = 'assign_modeles_to_79E'
            `);
            if (!alreadyDone79E) {
                await db.query(`
                    UPDATE modeles_examens SET promotion = '79E' WHERE promotion IS NULL
                `);
                await db.query(`
                    INSERT INTO migrations_log (migration_name) VALUES ('assign_modeles_to_79E')
                `);
                console.log('✅ Migration ONE-TIME OK : modèles existants assignés à 79E');
            }

            // ── Migration one-time : contrainte unique (nom_modele + promotion) ──
            const [[alreadyDoneUnique]] = await db.query(`
                SELECT id FROM migrations_log WHERE migration_name = 'unique_modele_par_promotion'
            `);
            if (!alreadyDoneUnique) {
                try {
                    await db.query(`ALTER TABLE modeles_examens DROP INDEX nom_modele`);
                } catch (e) {
                    console.log('⚠️  Index nom_modele déjà supprimé ou inexistant.');
                }
                await db.query(`
                    ALTER TABLE modeles_examens 
                    ADD UNIQUE KEY unique_modele_par_promotion (nom_modele, promotion)
                `);
                await db.query(`
                    INSERT INTO migrations_log (migration_name) VALUES ('unique_modele_par_promotion')
                `);
                console.log('✅ Migration ONE-TIME OK : contrainte unique (nom_modele + promotion)');
            }
        }

    } catch (err) {
        console.error('❌ Erreur migration log:', err.message);
    }
    // 4. Migration : détails_parcours (heures brutes PG)
try {
    const hasDetails = await columnExists('copies', 'details_parcours');
    if (!hasDetails) {
        await db.query(`
            ALTER TABLE copies 
            ADD COLUMN details_parcours JSON NULL DEFAULT NULL,
            ADD COLUMN parcours_version VARCHAR(20) NULL DEFAULT NULL
        `);
        console.log('✅ Migration OK : copies.details_parcours créé');
    } else {
        console.log('⏭️  Migration skipped : copies.details_parcours existe déjà');
    }
} catch (err) {
    console.error('❌ Erreur migration copies.details_parcours:', err.message);
}
};
runMigrations();

const logActivity = async (userId, userName, actionType, description) => {
    try {
        const query = "INSERT INTO historique_activites (utilisateur_id, nom_utilisateur, type_action, description) VALUES (?, ?, ?, ?)";
        await db.query(query, [userId, userName, actionType, description]);
    } catch (err) {
        console.error(err);
    }
};

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ message: "Accès non autorisé : Token manquant." });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "Accès refusé : Token invalide ou expiré." });
        req.user = user;
        next();
    });
};

const checkRole = (rolesAutorises) => {
    return (req, res, next) => {
        if (!rolesAutorises.includes(req.user.role)) {
            return res.status(403).json({ message: "Accès refusé : Permissions insuffisantes." });
        }
        next();
    };
};

app.post(apiPaths.login, async (req, res) => {
    try {
        const { nom_utilisateur, password } = req.body;
        if (!nom_utilisateur || !password) {
            return res.status(400).json({ message: "Nom d'utilisateur et mot de passe requis." });
        }
        const [users] = await db.query("SELECT * FROM utilisateurs WHERE nom_utilisateur = ?", [nom_utilisateur]);
        
        if (users.length === 0 || password !== users[0].mot_de_passe) {
            return res.status(401).json({ message: "Nom d'utilisateur ou mot de passe incorrect." });
        }

        const user = users[0];
        if (user.statut !== 'approuve') {
            return res.status(403).json({ message: "Votre compte n'a pas encore été validé." });
        }

        // AJOUT : On inclut les assignations dans le Payload du Token
        const tokenPayload = { 
            id: user.id, 
            role: user.role, 
            nom_utilisateur: user.nom_utilisateur,
            // Données d'assignation
            assigned_matiere_id: user.assigned_matiere_id,
            assigned_type_examen: user.assigned_type_examen,
            assigned_promotion: user.assigned_promotion,
 assigned_population: user.assigned_population
        };
        
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

        await logActivity(user.id, user.nom_utilisateur, 'CONNEXION_REUSSIE', `Connexion réussie.`);
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Une erreur interne est survenue." });
    }
});

app.get('/api/logs/activites', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [logs] = await db.query("SELECT id, date_action, nom_utilisateur, type_action, description, statut FROM historique_activites ORDER BY date_action DESC LIMIT 500");
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: "Erreur lors de la récupération du journal d'activités." });
    }
});

app.get('/api/logs/unread', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [logs] = await db.query("SELECT id, date_action, nom_utilisateur, type_action, description, statut FROM historique_activites WHERE statut = 'non_vu' ORDER BY date_action DESC");
        res.json(logs);
    } catch (err) {
        res.status(500).json({ message: "Erreur lors de la récupération des journaux non lus." });
    }
});

app.get('/api/logs/unread-count', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [[{ count }]] = await db.query("SELECT COUNT(*) as count FROM historique_activites WHERE statut = 'non_vu'");
        res.json({ count });
    } catch (err) {
        res.status(500).json({ message: "Erreur lors du comptage des journaux non lus." });
    }
});

app.put('/api/logs/mark-as-read', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        await db.query("UPDATE historique_activites SET statut = 'vu' WHERE statut = 'non_vu'");
        res.status(200).json({ message: "Tous les journaux ont été marqués comme lus." });
    } catch (err) {
        res.status(500).json({ message: "Erreur lors de la mise à jour des journaux." });
    }
});
// Vue complète : toutes les notes (saisies par n'importe qui) + élèves sans note,
// filtrée par promotion / examen / matière, groupée par escadron puis peloton.
app.get('/api/copies/vue-saisies-groupees', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { promotion, typeExamen, matiereId } = req.query;
        const utilisateurId = req.user.id;

        if (!typeExamen || !matiereId) {
            return res.status(400).json({ message: "Le type d'examen et la matière sont requis." });
        }

        // 1. Élèves concernés (filtrés par promotion si fournie)
        let eleveQuery = `SELECT id, nom, prenom, numero_incorporation, escadron, peloton, statut FROM eleves WHERE 1=1`;
        const eleveParams = [];
        if (promotion && promotion !== 'all') {
            eleveQuery += " AND promotion = ?";
            eleveParams.push(promotion);
        }
        eleveQuery += " ORDER BY escadron, peloton, CAST(numero_incorporation AS UNSIGNED) ASC";
        const [eleves] = await db.query(eleveQuery, eleveParams);

        if (eleves.length === 0) return res.json({});

        // 2. Notes existantes pour cette matière + cet examen (tous opérateurs confondus)
        const [notes] = await db.query(`
            SELECT c.id AS copie_id, c.eleve_id, c.note, c.note_saisie_a, c.note_saisie_par_utilisateur_id,
                   c.details_parcours, c.parcours_version,
                   u.nom_utilisateur AS saisie_par
            FROM copies c
            LEFT JOIN utilisateurs u ON c.note_saisie_par_utilisateur_id = u.id
            WHERE c.matiere_id = ? AND c.type_examen = ? AND c.note IS NOT NULL AND c.eleve_id IS NOT NULL
        `, [matiereId, typeExamen]);

        const notesParEleve = new Map(notes.map(n => [n.eleve_id, n]));

        // 3. Regroupement Escadron -> Peloton -> liste d'élèves (avec ou sans note)
        const grouped = {};
        eleves.forEach(eleve => {
            const escKey = eleve.escadron ? String(eleve.escadron) : 'Sans Escadron';
            const ponKey = eleve.peloton ? String(eleve.peloton) : 'Sans Peloton';
            if (!grouped[escKey]) grouped[escKey] = {};
            if (!grouped[escKey][ponKey]) grouped[escKey][ponKey] = [];

            const n = notesParEleve.get(eleve.id);
            grouped[escKey][ponKey].push({
                eleve_id: eleve.id,
                nom: eleve.nom,
                prenom: eleve.prenom,
                numero_incorporation: eleve.numero_incorporation,
                statut: eleve.statut,
                a_une_note: !!n,
                copie_id: n?.copie_id || null,
                note: n?.note ?? null,
                date_saisie: n?.note_saisie_a || null,
                saisie_par_moi: n ? n.note_saisie_par_utilisateur_id === utilisateurId : false,
                saisie_par: n?.saisie_par || null,
                details_parcours: n?.details_parcours || null,
                parcours_version: n?.parcours_version || null
            });
        });

        res.json(grouped);
    } catch (err) {
        console.error("Erreur vue-saisies-groupees:", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { nom, prenom, matricule, service, numero_telephone, nom_utilisateur, mot_de_passe, role } = req.body;

        if (!nom || !prenom || !nom_utilisateur || !mot_de_passe || !role) {
            return res.status(400).json({ message: "Tous les champs marqués d'un * et le rôle sont requis." });
        }

        const rolesAutorises = ['admin', 'operateur_code', 'operateur_note'];
        if (!rolesAutorises.includes(role)) {
            return res.status(400).json({ message: "Le rôle sélectionné est invalide." });
        }

        const query = `
            INSERT INTO utilisateurs (nom, prenom, matricule, service, numero_telephone, nom_utilisateur, mot_de_passe, role)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.query(query, [nom, prenom, matricule, service, numero_telephone, nom_utilisateur, mot_de_passe, role]);

        res.status(201).json({ message: "Votre demande de création de compte a été envoyée. Elle est en attente de validation par un administrateur." });

    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Ce nom d'utilisateur est déjà pris." });
        }
        res.status(500).json({ error: "Une erreur interne est survenue lors de l'enregistrement." });
    }
});

app.get('/api/promotions', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query("SELECT DISTINCT promotion FROM eleves WHERE promotion IS NOT NULL AND promotion != '' ORDER BY promotion DESC");
        res.json(rows.map(r => r.promotion));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur lors de la récupération des promotions." });
    }
});
app.get(apiPaths.eleves.base, authenticateToken, async (req, res) => {
    try {
        const { promotion, escadron, peloton } = req.query;
        let query = "SELECT * FROM eleves WHERE 1=1";
        const params = [];

        if (promotion && promotion !== 'all') {
            query += " AND promotion = ?";
            params.push(promotion);
        }
        if (escadron && escadron !== 'all') {
            query += " AND escadron = ?";
            params.push(escadron);
        }
        if (peloton && peloton !== 'all') {
            query += " AND peloton = ?";
            params.push(peloton);
        }

        query += " ORDER BY escadron, peloton, nom, prenom";
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// ── CRUD élève individuel (lecture pour tous, écriture réservée admin) ─────

app.post(apiPaths.eleves.base, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { nom, prenom, numero_incorporation, sexe, escadron, peloton, promotion, statut } = req.body;
        if (!nom || !numero_incorporation) {
            return res.status(400).json({ message: "Le nom et le numéro d'incorporation sont requis." });
        }
        const query = `
            INSERT INTO eleves (nom, prenom, numero_incorporation, sexe, escadron, peloton, promotion, statut)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(query, [
            nom.trim(),
            (prenom || '').trim(),
            numero_incorporation.trim(),
            sexe || null,
            escadron || null,
            peloton || null,
            promotion || null,
            statut || 'actif'
        ]);
        const [[nouvelEleve]] = await db.query("SELECT * FROM eleves WHERE id = ?", [result.insertId]);
        await logActivity(req.user.id, req.user.nom_utilisateur, 'CREATION_ELEVE', `A créé l'élève ${nom} ${prenom || ''} (N° ${numero_incorporation}).`);
        res.status(201).json(nouvelEleve);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Un élève avec ce numéro d'incorporation existe déjà pour cette promotion." });
        }
        console.error("Erreur création élève:", err);
        res.status(500).json({ message: "Erreur lors de la création de l'élève." });
    }
});

app.put('/api/eleves/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { nom, prenom, numero_incorporation, sexe, escadron, peloton, promotion, statut } = req.body;
        if (!nom || !numero_incorporation) {
            return res.status(400).json({ message: "Le nom et le numéro d'incorporation sont requis." });
        }
        const query = `
            UPDATE eleves SET
                nom = ?, prenom = ?, numero_incorporation = ?, sexe = ?,
                escadron = ?, peloton = ?, promotion = ?, statut = ?
            WHERE id = ?
        `;
        const [result] = await db.query(query, [
            nom.trim(),
            (prenom || '').trim(),
            numero_incorporation.trim(),
            sexe || null,
            escadron || null,
            peloton || null,
            promotion || null,
            statut || 'actif',
            id
        ]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Élève non trouvé." });
        }
        await logActivity(req.user.id, req.user.nom_utilisateur, 'MODIFICATION_ELEVE', `A modifié la fiche de l'élève ID ${id} (${nom} ${prenom || ''}).`);
        res.json({ message: "Élève mis à jour avec succès." });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Un élève avec ce numéro d'incorporation existe déjà pour cette promotion." });
        }
        console.error("Erreur modification élève:", err);
        res.status(500).json({ message: "Erreur lors de la mise à jour de l'élève." });
    }
});

app.delete('/api/eleves/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const [eleves] = await db.query("SELECT nom, prenom, numero_incorporation FROM eleves WHERE id = ?", [id]);
        if (eleves.length === 0) {
            return res.status(404).json({ message: "Élève non trouvé." });
        }
        const e = eleves[0];
        await db.query("DELETE FROM eleves WHERE id = ?", [id]);
        await logActivity(req.user.id, req.user.nom_utilisateur, 'SUPPRESSION_ELEVE', `A supprimé l'élève ${e.nom} ${e.prenom} (N° ${e.numero_incorporation}).`);
        res.json({ message: "Élève supprimé avec succès." });
    } catch (err) {
        if (err.code === 'ER_ROW_IS_REFERENCED_2' || err.code === 'ER_ROW_IS_REFERENCED') {
            return res.status(409).json({ message: "Impossible de supprimer : cet élève possède déjà des notes, absences ou décisions enregistrées." });
        }
        console.error("Erreur suppression élève:", err);
        res.status(500).json({ message: "Erreur lors de la suppression de l'élève." });
    }
});


app.get(apiPaths.eleves.recherche, authenticateToken, async (req, res) => {
    try {
        const searchTerm = req.query.q;
        const promotionFiltre = req.query.promotion;
        const populationFiltre = req.query.population; // <--- RÉCUPÉRER LE PARAMÈTRE

        if (!searchTerm || searchTerm.trim() === '') return res.json([]);

        const nameSearchQuery = `%${searchTerm}%`;
        const codeSearchQuery = `${searchTerm}%`;

        let query = `
            SELECT id, prenom, nom, numero_incorporation, escadron, peloton, promotion, statut
            FROM eleves
            WHERE (
                numero_incorporation LIKE ?
                OR CONCAT(prenom, ' ', nom) LIKE ?
                OR CONCAT(nom, ' ', prenom) LIKE ?
            )
        `;

        const params = [codeSearchQuery, nameSearchQuery, nameSearchQuery];

        // Filtre de promotion existant
        if (promotionFiltre && promotionFiltre !== 'all' && promotionFiltre !== 'Toutes' && promotionFiltre !== 'undefined') {
            query += " AND promotion = ?";
            params.push(promotionFiltre);
        }

        // --- NOUVEAU : Filtre de Population ---
        if (populationFiltre === 'actif') {
            // On considère 'actif' comme ceux qui n'ont pas de statut spécial de conseil
            query += " AND (statut = 'actif' OR statut IS NULL OR statut = 'approuve')";
        } else if (populationFiltre === 'conseil') {
            // On cible les redoublants et ajournés
            query += " AND statut IN ('redoublant', 'ajourne_3m', 'ajourne_6m')";
        }

        query += " ORDER BY nom, prenom LIMIT 20";

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Erreur recherche eleves:", err);
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});
app.get('/api/eleves/:id/notes-detaillees', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;

        const [eleveRows] = await db.query("SELECT * FROM eleves WHERE id = ?", [id]);
        if (eleveRows.length === 0) {
            return res.status(404).json({ message: "Élève non trouvé." });
        }
        const eleve = eleveRows[0];

        const [notes] = await db.query(`
            SELECT c.id, c.note, c.type_examen, c.note_saisie_a,
                   m.id AS matiere_id, m.nom_matiere
            FROM copies c
            JOIN matieres m ON c.matiere_id = m.id
            WHERE c.eleve_id = ? AND c.note IS NOT NULL
            ORDER BY c.type_examen, m.nom_matiere
        `, [id]);

        const [absences] = await db.query(`
            SELECT a.matiere_id, m.nom_matiere, a.type_examen, a.motif
            FROM absences a
            JOIN matieres m ON a.matiere_id = m.id
            WHERE a.eleve_id = ?
        `, [id]);

        res.json({ eleve, notes, absences });
    } catch (err) {
        console.error("Erreur notes-detaillees:", err);
        res.status(500).json({ message: "Erreur lors de la récupération des notes de l'élève." });
    }
});
app.post('/api/eleves/importer-previsualisation', authenticateToken, checkRole(['admin']), upload.single('fichierEleves'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier n'a été envoyé." });
    const { promotion } = req.body;
    if (!promotion || promotion.trim() === '') return res.status(400).json({ message: "La promotion est requise pour prévisualiser." });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        const donneesValides = [];
        const erreurs = [];
        const numerosIncorporationVus = new Set(); // Pour vérifier les doublons DANS le fichier Excel actuel

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length === 0) continue;

            const numero_incorporation = row[0] ? String(row[0]).trim() : null;
            if (!numero_incorporation) {
                erreurs.push({ ligne: i + 1, message: "Numéro d'incorporation manquant." });
                continue;
            }
            // Vérifie si le numéro est en double à l'intérieur de la MÊME promotion (le fichier en cours)
            if (numerosIncorporationVus.has(numero_incorporation)) {
                erreurs.push({ ligne: i + 1, message: `Numéro d'incorporation en double dans ce fichier : ${numero_incorporation}` });
                continue;
            }
            numerosIncorporationVus.add(numero_incorporation);

            const nom_prenom = row[1] ? String(row[1]).trim() : '';
            const sexeRaw = row[2] ? String(row[2]).trim().toUpperCase() : null;
            let sexe = (sexeRaw === 'F' || sexeRaw === 'FEMININ') ? 'feminin' : ((sexeRaw === 'M' || sexeRaw === 'MASCULIN') ? 'masculin' : null);
            const escadron = !isNaN(parseInt(row[3], 10)) ? parseInt(row[3], 10) : null;
            const peloton = !isNaN(parseInt(row[4], 10)) ? parseInt(row[4], 10) : null;

            donneesValides.push({
                numero_incorporation,
                nom_prenom,
                sexe,
                escadron,
                peloton,
                promotion: promotion.trim()
            });
        }

        res.json({ total: donneesValides.length, donneesValides, erreurs });
    } catch (err) {
        console.error("Erreur prévisualisation élèves:", err);
        res.status(500).json({ message: "Erreur interne lors du traitement du fichier Excel." });
    }
});

app.post(apiPaths.eleves.importer, authenticateToken, checkRole(['admin']), upload.single('fichierEleves'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier n'a été envoyé." });
    const { promotion } = req.body;
    if (!promotion || promotion.trim() === '') return res.status(400).json({ message: "La promotion est requise pour l'importation." });

    const connection = await db.getConnection();
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        const elevesToInsert = [];
        const numerosIncorporationVus = new Set();

        for (const row of data.slice(1)) {
            if (!row || row.length === 0) continue;
            const numero_incorporation = row[0] ? String(row[0]).trim() : null;
            if (!numero_incorporation || numerosIncorporationVus.has(numero_incorporation)) continue;
            numerosIncorporationVus.add(numero_incorporation);

            const nom_prenom = row[1] ? String(row[1]).trim() : '';
            const sexeRaw = row[2] ? String(row[2]).trim().toUpperCase() : null;
            let nom = '', prenom = '';
            const firstSpaceIndex = nom_prenom.indexOf(' ');
            if (firstSpaceIndex > 0) {
                nom = nom_prenom.substring(0, firstSpaceIndex).trim();
                prenom = nom_prenom.substring(firstSpaceIndex + 1).trim();
            } else { nom = nom_prenom; }

            let sexe = (sexeRaw === 'F' || sexeRaw === 'FEMININ') ? 'feminin' : ((sexeRaw === 'M' || sexeRaw === 'MASCULIN') ? 'masculin' : null);
            const escadron = !isNaN(parseInt(row[3], 10)) ? parseInt(row[3], 10) : null;
            const peloton = !isNaN(parseInt(row[4], 10)) ? parseInt(row[4], 10) : null;

            elevesToInsert.push([nom, prenom, numero_incorporation, sexe, escadron, peloton, promotion.trim()]);
        }

        if (elevesToInsert.length === 0) return res.status(400).json({ message: "Le fichier ne contient aucun élève valide à importer." });

        await connection.beginTransaction();

        // Si la combinaison (numero_incorporation + promotion) existe déjà, on met à jour,
        // sinon on ajoute l'élève.
        const sql = `
            INSERT INTO eleves (nom, prenom, numero_incorporation, sexe, escadron, peloton, promotion) 
            VALUES ?
            ON DUPLICATE KEY UPDATE 
                nom = VALUES(nom),
                prenom = VALUES(prenom),
                sexe = VALUES(sexe),
                escadron = VALUES(escadron),
                peloton = VALUES(peloton)
        `;
        
        await connection.query(sql, [elevesToInsert]);
        await connection.commit();

        await logActivity(req.user.id, req.user.nom_utilisateur, 'IMPORT_ELEVES', `A ajouté ou mis à jour ${elevesToInsert.length} élèves pour la promotion '${promotion.trim()}'.`);
        res.json({ message: `Importation réussie. ${elevesToInsert.length} élèves ont été ajoutés (ou mis à jour) pour la promotion ${promotion.trim()}.` });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: "Erreur interne lors du traitement de l'importation." });
    } finally {
        connection.release();
    }
});

app.get(apiPaths.matieres.base, authenticateToken, async (req, res) => {
    try {
        const query = `SELECT id, nom_matiere, code_prefixe, coefficient_legacy FROM matieres ORDER BY nom_matiere`;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post(apiPaths.matieres.base, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { nom_matiere } = req.body;
        if (!nom_matiere || nom_matiere.trim() === '') {
            return res.status(400).json({ message: "Le nom de la matière est requis." });
        }
        const [result] = await db.query("INSERT INTO matieres (nom_matiere) VALUES (?)", [nom_matiere.trim()]);
        const nouvelId = result.insertId;
        const [[nouvelleMatiere]] = await db.query("SELECT id, nom_matiere FROM matieres WHERE id = ?", [nouvelId]);
        await logActivity(req.user.id, req.user.nom_utilisateur, 'CREATION_MATIERE', `A créé la matière '${nom_matiere.trim()}'.`);
        res.status(201).json(nouvelleMatiere);
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Cette matière existe déjà." });
        }
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/codes/verifier/:code', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { code } = req.params;
        const [rows] = await db.query("SELECT id FROM codes_anonymes_disponibles WHERE code = ?", [code]);
        if (rows.length > 0) {
            res.status(200).json({ isValid: true, message: "Code valide." });
        } else {
            res.status(404).json({ isValid: false, message: "Ce code n'existe pas dans la base." });
        }
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.post(apiPaths.codes.importer, authenticateToken, checkRole(['admin']), upload.single('fichierCodes'), async (req, res) => {
    if (!req.file) return res.status(400).json({ message: "Aucun fichier n'a été envoyé." });
    const connection = await db.getConnection();
    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
        const codesColonneA = data.slice(1).map(row => row && row[0]).filter(code => code !== null && code !== undefined && code.toString().trim() !== '');
        if (codesColonneA.length === 0) {
            return res.status(400).json({ message: "Le fichier ne contient aucun code valide dans la colonne A." });
        }
        const codesUniques = [...new Set(codesColonneA.map(code => code.toString().trim()))];
        const codesAInserer = codesUniques.map(code => [code]);
        await connection.beginTransaction();
        await connection.query("DELETE FROM codes_anonymes_disponibles");
        await connection.query("INSERT INTO codes_anonymes_disponibles (code) VALUES ?", [codesAInserer]);
        await connection.commit();
        res.status(200).json({ message: `Importation réussie. ${codesAInserer.length} codes anonymes uniques ont été enregistrés.` });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Une erreur interne est survenue lors du traitement du fichier." });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/noter-copie-anonyme', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    const { matiere_id, code_anonyme, note, type_examen } = req.body;
    const { id: utilisateurId, nom_utilisateur } = req.user;

    if (!matiere_id || !code_anonyme || note === undefined || note === '' || !type_examen) {
        return res.status(400).json({ message: "Matière, code, note et type d'examen sont requis." });
    }
    const noteNum = parseFloat(note);
    if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
         return res.status(400).json({ message: "La note doit être un nombre entre 0 et 20." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [codesDispo] = await connection.query("SELECT id FROM codes_anonymes_disponibles WHERE code = ?", [code_anonyme]);
        if (codesDispo.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Ce code anonyme n'existe pas dans la base de données générale." });
        }
        const [existingCopies] = await connection.query("SELECT note FROM copies WHERE code_anonyme = ? AND matiere_id = ?", [code_anonyme, matiere_id]);
        if (existingCopies.length > 0 && existingCopies[0].note !== null) {
            await connection.rollback();
            return res.status(409).json({ message: "Ce code a déjà une note enregistrée." });
        }

        const query = `
            INSERT INTO copies (matiere_id, code_anonyme, note, type_examen, note_saisie_par_utilisateur_id, eleve_id)
            VALUES (?, ?, ?, ?, ?, NULL)
            ON DUPLICATE KEY UPDATE
                note = VALUES(note),
                type_examen = VALUES(type_examen),
                note_saisie_par_utilisateur_id = VALUES(note_saisie_par_utilisateur_id)
        `;
        await connection.query(query, [matiere_id, code_anonyme, noteNum, type_examen, utilisateurId]);
        await connection.commit();

        await logActivity(utilisateurId, nom_utilisateur, 'SAISIE_NOTE_ANONYME', `A saisi la note ${noteNum} (type: ${type_examen}) pour le code '${code_anonyme}'.`);
        res.status(201).json({ message: `Note pour le code ${code_anonyme} enregistrée.` });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.post('/api/reclamations', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    const { matiere_id, code_anonyme, note_proposee } = req.body;
    const utilisateurId = req.user.id;

    if (!matiere_id || !code_anonyme || note_proposee === undefined) {
        return res.status(400).json({ message: "Toutes les informations sont requises pour le signalement." });
    }
    try {
        const query = `
            INSERT INTO reclamations (code_anonyme, matiere_id, note_proposee, signale_par_utilisateur_id)
            VALUES (?, ?, ?, ?)
        `;
        await db.query(query, [code_anonyme, matiere_id, note_proposee, utilisateurId]);
        res.status(201).json({ message: "L'incident a été signalé à l'administrateur. Merci." });
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur lors du signalement." });
    }
});

app.get('/api/reclamations', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const query = `
            SELECT r.id, r.code_anonyme, r.note_proposee, r.date_reclamation, r.statut,
                   m.nom_matiere, u.nom_utilisateur as signale_par
            FROM reclamations r
            JOIN matieres m ON r.matiere_id = m.id
            JOIN utilisateurs u ON r.signale_par_utilisateur_id = u.id
            WHERE r.statut = 'nouveau'
            ORDER BY r.date_reclamation DESC
        `;
        const [reclamations] = await db.query(query);
        res.json(reclamations);
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get('/api/reclamations/details/:code_anonyme/:matiereId', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { code_anonyme, matiereId } = req.params;
    try {
        const query = `
            SELECT
                c.note AS note_originale,
                c.note_saisie_a AS date_saisie_originale,
                u.nom, u.prenom, u.matricule, u.service, u.numero_telephone, u.nom_utilisateur
            FROM copies c
            JOIN utilisateurs u ON c.note_saisie_par_utilisateur_id = u.id
            WHERE c.code_anonyme = ? AND c.matiere_id = ?
        `;
        const [details] = await db.query(query, [code_anonyme, matiereId]);

        if (details.length === 0) {
            return res.status(404).json({ message: "Impossible de trouver la saisie originale correspondante." });
        }
        res.json(details[0]);

    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.put('/api/reclamations/:id/resoudre', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    try {
        await db.query("UPDATE reclamations SET statut = 'resolu' WHERE id = ?", [id]);
        res.json({ message: "Réclamation marquée comme résolue." });
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.put('/api/reclamations/corriger', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { reclamationId, code_anonyme, matiereId, nouvelle_note } = req.body;
    const adminId = req.user.id;

    if (!reclamationId || !code_anonyme || !matiereId || nouvelle_note === undefined) {
        return res.status(400).json({ message: "Toutes les informations sont requises pour la correction." });
    }

    const noteNum = parseFloat(nouvelle_note);
    if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
        return res.status(400).json({ message: "La nouvelle note doit être un nombre entre 0 et 20." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [copies] = await connection.query("SELECT id, note FROM copies WHERE code_anonyme = ? AND matiere_id = ?", [code_anonyme, matiereId]);
        if (copies.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Copie originale non trouvée." });
        }
        const copieId = copies[0].id;
        const ancienne_note = copies[0].note;
        const motif = `Correction suite à la réclamation #${reclamationId}.`;

        await connection.query(
            "INSERT INTO historique_modifications_notes (copie_id, ancienne_note, nouvelle_note, motif, modifie_par_utilisateur_id) VALUES (?, ?, ?, ?, ?)",
            [copieId, ancienne_note, noteNum, motif, adminId]
        );

        await connection.query("UPDATE copies SET note = ? WHERE id = ?", [noteNum, copieId]);
        await connection.query("UPDATE reclamations SET statut = 'resolu' WHERE id = ?", [reclamationId]);

        await connection.commit();
        res.json({ message: "La note a été corrigée et la réclamation résolue." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Erreur interne du serveur lors de la correction." });
    } finally {
        connection.release();
    }
});

app.put('/api/lier-copie', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    const { eleve_id, matiere_id, code_anonyme, type_examen } = req.body;
    const { id: utilisateurId, nom_utilisateur } = req.user;

    if (!eleve_id || !matiere_id || !code_anonyme) {
        return res.status(400).json({ message: "Élève, matière et code sont requis pour la liaison." });
    }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [copies] = await connection.query("SELECT eleve_id, matiere_id, type_examen FROM copies WHERE code_anonyme = ? FOR UPDATE", [code_anonyme]);

        if (copies.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Ce code n'existe pas ou n'a pas encore été noté." });
        }
        const copie = copies[0];

        if (copie.eleve_id !== null) {
            const [eleveExisting] = await connection.query("SELECT nom, prenom, numero_incorporation FROM eleves WHERE id = ?", [copie.eleve_id]);
            await connection.rollback();
            if (eleveExisting.length > 0) {
                const e = eleveExisting[0];
                return res.status(409).json({
                    message: `Erreur : Le code ${code_anonyme} est déjà lié à l'élève ${e.nom} ${e.prenom} (N° ${e.numero_incorporation}).`
                });
            } else {
                return res.status(409).json({ message: "Cette copie est déjà liée à un autre élève (ID inconnu)." });
            }
        }

        if (copie.matiere_id.toString() !== matiere_id.toString()) {
            await connection.rollback();
            return res.status(409).json({ message: `Conflit : Ce code a été noté pour une autre matière.` });
        }

        if (type_examen && copie.type_examen && copie.type_examen !== type_examen) {
            await connection.rollback();
            return res.status(409).json({ message: `Erreur : Ce code correspond à l'examen '${copie.type_examen}', mais vous avez sélectionné '${type_examen}'.` });
        }

        let checkQuery = "SELECT code_anonyme FROM copies WHERE eleve_id = ? AND matiere_id = ?";
        let checkParams = [eleve_id, matiere_id];

        if (copie.type_examen) {
            checkQuery += " AND type_examen = ?";
            checkParams.push(copie.type_examen);
        }

        const [existingLink] = await connection.query(checkQuery, checkParams);

        if (existingLink.length > 0) {
             await connection.rollback();
             const codeDejaLie = existingLink[0].code_anonyme;
             return res.status(409).json({
                 message: `Erreur : Cet élève possède déjà une copie pour cette matière (Code : ${codeDejaLie}).`
             });
        }

        await connection.query("UPDATE copies SET eleve_id = ?, cree_par_utilisateur_id = ? WHERE code_anonyme = ?", [eleve_id, utilisateurId, code_anonyme]);
        await connection.query("UPDATE codes_anonymes_disponibles SET est_utilise = 1 WHERE code = ?", [code_anonyme]);
        await connection.commit();

        await logActivity(utilisateurId, nom_utilisateur, 'LIAISON_COPIE', `A lié le code '${code_anonyme}' à l'élève ID ${eleve_id} pour la matière ID ${matiere_id}.`);
        res.status(200).json({ message: "Liaison effectuée avec succès." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.get(apiPaths.copies.verifier, authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) return res.status(400).json({ message: "Le code est requis." });
        const [rows] = await db.query("SELECT id FROM copies WHERE code_anonyme = ?", [code]);
        if (rows.length > 0) {
            res.status(200).json({ existe: true, message: "Code valide." });
        } else {
            res.status(404).json({ existe: false, message: "Ce code de copie n'existe pas." });
        }
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get('/api/copies/notees-non-liees', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const { matiereId, promotion, population } = req.query;
        
        let query = `
            SELECT c.id, c.code_anonyme, c.note, m.nom_matiere
            FROM copies c 
            JOIN matieres m ON c.matiere_id = m.id
            JOIN codes_anonymes_disponibles cad ON c.code_anonyme = cad.code
            WHERE c.eleve_id IS NULL 
              AND c.note IS NOT NULL
              AND cad.promotion = ?
              AND cad.population = ?
        `;
        
        const params = [promotion, population];

        if (matiereId && matiereId !== 'all') {
            query += ' AND c.matiere_id = ?';
            params.push(matiereId);
        }

        query += ' ORDER BY m.nom_matiere, c.code_anonyme';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.get('/api/copies/mes-liages', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const utilisateurId = req.user.id;
        const { matiere_id, type_examen } = req.query;

        let query = `
            SELECT c.id, c.code_anonyme, c.note, m.nom_matiere, e.nom, e.prenom, e.numero_incorporation
            FROM copies c
            JOIN matieres m ON c.matiere_id = m.id
            JOIN eleves e ON c.eleve_id = e.id
            WHERE c.cree_par_utilisateur_id = ?
        `;
        const params = [utilisateurId];

        if (matiere_id) {
            query += " AND c.matiere_id = ?";
            params.push(matiere_id);
        }
        if (type_examen) {
            query += " AND c.type_examen = ?";
            params.push(type_examen);
        }

        query += " ORDER BY c.id DESC";

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get('/api/copies/mes-saisies-notes', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const utilisateurId = req.user.id;
        const query = `
            SELECT c.id, c.code_anonyme, c.note, m.nom_matiere
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note_saisie_par_utilisateur_id = ? ORDER BY c.id DESC
        `;
        const [rows] = await db.query(query, [utilisateurId]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get(apiPaths.stats.nonLiesTotal, authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const [[{ total: totalEleves }]] = await db.query("SELECT COUNT(*) as total FROM eleves");
        const [[{ total: totalMatieres }]] = await db.query("SELECT COUNT(*) as total FROM matieres");
        const [[{ total: liaisonsEffectuees }]] = await db.query("SELECT COUNT(*) as total FROM copies WHERE eleve_id IS NOT NULL");

        const liaisonsPossibles = totalEleves * totalMatieres;
        const liaisonsRestantes = liaisonsPossibles - liaisonsEffectuees;

        res.json({ totalRestant: liaisonsRestantes >= 0 ? liaisonsRestantes : 0 });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors du calcul des statistiques globales." });
    }
});


app.get(apiPaths.stats.liaisonsUtilisateur, authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const { matiere_id, type_examen } = req.query;
        const utilisateurId = req.user.id;

        let query = "SELECT COUNT(*) as liaisonsCreees FROM copies WHERE cree_par_utilisateur_id = ?";
        const params = [utilisateurId];

        if (matiere_id) {
            query += " AND matiere_id = ?";
            params.push(matiere_id);
        }

        if (type_examen) {
            query += " AND type_examen = ?";
            params.push(type_examen);
        }

        const [[result]] = await db.query(query, params);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors du calcul des statistiques utilisateur." });
    }
});

app.get('/api/stats/notes-utilisateur', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const [[result]] = await db.query("SELECT COUNT(*) as notesSaisies FROM copies WHERE note_saisie_par_utilisateur_id = ?", [req.user.id]);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors du calcul des statistiques utilisateur." });
    }
});

app.get('/api/stats/notation/:matiereId', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { matiereId } = req.params;
        const [[{ totalEleves }]] = await db.query("SELECT COUNT(*) as totalEleves FROM eleves");
        const [[{ notesSaisies }]] = await db.query("SELECT COUNT(*) as notesSaisies FROM copies WHERE matiere_id = ? AND note IS NOT NULL", [matiereId]);
        const notesManquantes = totalEleves - notesSaisies;
        res.json({ totalEleves, notesManquantes });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors du calcul des statistiques de notation." });
    }
});

app.get(apiPaths.matieres.elevesRestants, authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const { id } = req.params;
        const { type_examen } = req.query;

        let query = `SELECT COUNT(*) as restants FROM eleves WHERE id NOT IN (SELECT eleve_id FROM copies WHERE matiere_id = ?`;
        const params = [id];

        if (type_examen) {
            query += ` AND type_examen = ?`;
            params.push(type_examen);
        }

        query += `)`;

        const [rows] = await db.query(query, params);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors du calcul des élèves restants." });
    }
});

// backend/server.js
app.get(apiPaths.resultats.base, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const query = `
            SELECT
                c.id AS copie_id, e.prenom, e.nom, e.numero_incorporation, e.escadron, e.peloton,
                e.promotion,
                m.nom_matiere, m.id as matiere_id, c.note, c.type_examen, c.code_anonyme,
                c.details_parcours, c.parcours_version,
                u_note.nom_utilisateur AS operateur_note, u_code.nom_utilisateur AS operateur_code,
                (SELECT COUNT(*) FROM historique_modifications_notes h WHERE h.copie_id = c.id) AS modifications_count
            FROM copies c
            JOIN eleves e ON c.eleve_id = e.id
            JOIN matieres m ON c.matiere_id = m.id
            LEFT JOIN utilisateurs u_note ON c.note_saisie_par_utilisateur_id = u_note.id
            LEFT JOIN utilisateurs u_code ON c.cree_par_utilisateur_id = u_code.id
            WHERE c.note IS NOT NULL
            ORDER BY m.nom_matiere, e.escadron, e.peloton, CAST(e.numero_incorporation AS UNSIGNED) ASC;
        `;
        const [rows] = await db.query(query);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/resultats/:copieId', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { copieId } = req.params;
    const { nouvelle_note, motif } = req.body;
    const utilisateurId = req.user.id;
    if (nouvelle_note === undefined || !motif) {
        return res.status(400).json({ message: "La nouvelle note et le motif sont requis." });
    }
    const noteNum = parseFloat(nouvelle_note);
    if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
        return res.status(400).json({ message: "La note doit être un nombre entre 0 et 20." });
    }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [copies] = await connection.query("SELECT note FROM copies WHERE id = ?", [copieId]);
        if (copies.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Résultat non trouvé." });
        }
        const ancienne_note = copies[0].note;
        await connection.query(
            "INSERT INTO historique_modifications_notes (copie_id, ancienne_note, nouvelle_note, motif, modifie_par_utilisateur_id) VALUES (?, ?, ?, ?, ?)",
            [copieId, ancienne_note, noteNum, motif, utilisateurId]
        );
        await connection.query("UPDATE copies SET note = ? WHERE id = ?", [noteNum, copieId]);
        await connection.commit();
        res.json({ message: "La note a été mise à jour avec succès." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.delete('/api/resultats/:copieId', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { copieId } = req.params;
    const utilisateurId = req.user.id;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [copies] = await connection.query("SELECT note FROM copies WHERE id = ?", [copieId]);
        if (copies.length === 0) {
             await connection.rollback();
             return res.status(404).json({ message: "Résultat non trouvé." });
        }
        const ancienne_note = copies[0].note;
        const motif = `Suppression de la note ${ancienne_note}.`;
        await connection.query(
            "INSERT INTO historique_modifications_notes (copie_id, ancienne_note, nouvelle_note, motif, modifie_par_utilisateur_id) VALUES (?, ?, NULL, ?, ?)",
            [copieId, ancienne_note, motif, utilisateurId]
        );
        await connection.query("UPDATE copies SET note = NULL WHERE id = ?", [copieId]);
        await connection.commit();
        res.json({ message: "La note a été supprimée et l'action archivée." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.get('/api/resultats/:copieId/historique', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { copieId } = req.params;
        const query = `
            SELECT
                h.ancienne_note, h.nouvelle_note, h.motif, h.date_modification,
                u.nom_utilisateur AS modifie_par
            FROM historique_modifications_notes h
            JOIN utilisateurs u ON h.modifie_par_utilisateur_id = u.id
            WHERE h.copie_id = ?
            ORDER BY h.date_modification DESC;
        `;
        const [historique] = await db.query(query, [copieId]);
        if (historique.length === 0) {
            return res.status(404).json({ message: "Aucun historique trouvé pour cette note." });
        }
        res.json(historique);
    } catch (err) {
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

app.get(apiPaths.resultats.exporter, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { matiereId, typeExamen, promotion } = req.query;
        if (!matiereId) {
            return res.status(400).json({ message: "Veuillez spécifier une matière pour l'exportation." });
        }

        let query = `
            SELECT e.nom, e.prenom, e.numero_incorporation, e.escadron, e.peloton, e.sexe, m.nom_matiere, c.note
            FROM copies c
            JOIN eleves e ON c.eleve_id = e.id
            JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL AND m.id = ?
        `;
        const params = [matiereId];

        if (typeExamen) {
            query += " AND c.type_examen = ?";
            params.push(typeExamen);
        }
        if (promotion) {
            query += " AND e.promotion = ?";
            params.push(promotion);
        }

        query += " ORDER BY e.escadron, e.peloton, CAST(e.numero_incorporation AS UNSIGNED) ASC;";

        const [results] = await db.query(query, params);

        if (results.length === 0) {
            return res.status(404).json({ message: "Aucun résultat à exporter pour ces critères." });
        }

        const groupedData = results.reduce((acc, result) => {
            const key = `${result.escadron || 'Sans Escadron'} - ${result.peloton || 'Sans Peloton'}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(result);
            return acc;
        }, {});

        const workbook = xlsx.utils.book_new();
        const nomMatiere = results[0].nom_matiere.toUpperCase();

        for (const groupName in groupedData) {
            const sheetData = groupedData[groupName];
            const headers = ["N° ORDRE", "NOM ET PRENOM", "N° INCORPORATION", "ESCADRON", "PELOTON", "SEXE", "NOTE / 20"];
            const body = sheetData.map((row, index) => [
                index + 1,
                `${row.nom || ''} ${row.prenom || ''}`.trim(),
                row.numero_incorporation,
                row.escadron,
                row.peloton,
                (row.sexe === 'feminin' ? 'F' : 'M'),
                row.note
            ]);
            const finalSheetData = [[`FICHE DE RECUEIL DE NOTE - ${nomMatiere}`], [], headers, ...body];
            const worksheet = xlsx.utils.aoa_to_sheet(finalSheetData);
            worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
            worksheet['!cols'] = [{ wch: 10 }, { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }];
            const sheetName = groupName.replace(/[\\/*?:]/g, '').substring(0, 31);
            xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
        }

        const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const fileName = `Fiche_Notes_${nomMatiere.replace(/ /g, '_')}${typeExamen ? '_' + typeExamen : ''}${promotion ? '_' + promotion : ''}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la génération du fichier Excel." });
    }
});

app.post('/api/resultats/generer-document-pdf', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { matiereId, typeExamen, promotion } = req.body;
        if (!matiereId) {
            return res.status(400).json({ message: "Veuillez spécifier une matière pour la génération du document." });
        }

        let query = `
            SELECT e.nom, e.prenom, e.numero_incorporation, e.escadron, e.peloton, e.sexe, m.nom_matiere, c.note
            FROM copies c JOIN eleves e ON c.eleve_id = e.id JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL AND m.id = ?
        `;
        const params = [matiereId];

        if (typeExamen) {
            query += " AND c.type_examen = ?";
            params.push(typeExamen);
        }
        if (promotion) {
            query += " AND e.promotion = ?";
            params.push(promotion);
        }

        query += " ORDER BY e.escadron, e.peloton, CAST(e.numero_incorporation AS UNSIGNED) ASC;";

        const [results] = await db.query(query, params);

        if (results.length === 0) {
            return res.status(404).json({ message: "Aucun résultat à générer pour ces critères." });
        }

        const groupedData = results.reduce((acc, result) => {
            const key = `${result.escadron || 'Sans Escadron'} - ${result.peloton || 'Sans Peloton'}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(result);
            return acc;
        }, {});

        const doc = new jsPDF({ orientation: 'portrait' });
        const nomMatiere = results[0].nom_matiere.toUpperCase();
        let firstPage = true;

        for (const groupName in groupedData) {
            if (!firstPage) {
                doc.addPage('portrait');
            }
            firstPage = false;

            const qrPageData = groupedData[groupName].map((row, index) => ({
                num: index + 1,
                nom: `${row.nom || ''} ${row.prenom || ''}`.trim(),
                inc: row.numero_incorporation,
                note: row.note
            }));
            const qrDataString = JSON.stringify(qrPageData);
            const qrCodeImage = await QRCode.toDataURL(qrDataString);
            const qrCodeSize = 25;
            const pageMargin = 10;
            const qrX = doc.internal.pageSize.getWidth() - qrCodeSize - pageMargin;
            const qrY = pageMargin;
            doc.addImage(qrCodeImage, 'PNG', qrX, qrY, qrCodeSize, qrCodeSize);

            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text(`FICHE DE RECUEIL DE NOTE - ${nomMatiere}`, doc.internal.pageSize.getWidth() / 2, 20, { align: 'center' });

            const head = [['N°', 'NOM/PRENOM', 'INCOR', 'ESC', 'PON', 'SEXE', 'NOTE / 20']];
            const body = groupedData[groupName].map((row, index) => [
                index + 1,
                `${row.nom || ''} ${row.prenom || ''}`.trim(),
                row.numero_incorporation,
                row.escadron,
                row.peloton,
                (row.sexe === 'feminin' ? 'F' : 'M'),
                parseFloat(row.note).toFixed(2)
            ]);

            autoTable(doc, {
                startY: 35,
                head: head,
                body: body,
                theme: 'grid',
                headStyles: {
                    fillColor: [255, 255, 255],
                    textColor: [0, 0, 0],
                    fontStyle: 'bold',
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1
                },
                styles: {
                    textColor: [0, 0, 0],
                    lineColor: [0, 0, 0],
                    lineWidth: 0.1
                }
            });
        }

        const pdfBuffer = doc.output('arraybuffer');
        const fileName = `Fiche_Notes_${nomMatiere.replace(/ /g, '_')}${typeExamen ? '_' + typeExamen : ''}${promotion ? '_' + promotion : ''}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.send(Buffer.from(pdfBuffer));
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la génération du fichier PDF." });
    }
});

app.get(apiPaths.utilisateurs.base, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [users] = await db.query(`
            SELECT id, nom, prenom, nom_utilisateur, role, statut,
            assigned_matiere_id, assigned_type_examen, assigned_promotion, assigned_population
            FROM utilisateurs
            ORDER BY statut, nom_utilisateur
        `);
        res.json(users);
   } catch (err) {
        console.error("Erreur utilisateurs:", err);
        res.status(500).json({ error: "Erreur lors de la récupération des utilisateurs." });
    }
});

app.put(apiPaths.utilisateurs.byId, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            nom_utilisateur, role, 
            assigned_matiere_id, assigned_type_examen, 
            assigned_promotion, assigned_population // AJOUT
        } = req.body;

        const query = `UPDATE utilisateurs SET
                     nom_utilisateur = ?, role = ?,
                     assigned_matiere_id = ?, assigned_type_examen = ?, 
                     assigned_promotion = ?, assigned_population = ?
                     WHERE id = ?`;
        
        const params = [
            nom_utilisateur, role, 
            assigned_matiere_id || null, assigned_type_examen || null, 
            assigned_promotion || null, assigned_population || 'all', id
        ];

        await db.query(query, params);
        res.json({ message: "Configuration mise à jour." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la mise à jour." });
    }
});

app.delete(apiPaths.utilisateurs.byId, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (parseInt(id, 10) === req.user.id) return res.status(403).json({ message: "Vous ne pouvez pas supprimer votre propre compte." });

        const [users] = await db.query("SELECT nom_utilisateur FROM utilisateurs WHERE id = ?", [id]);
        if (users.length === 0) return res.status(404).json({ message: "Utilisateur non trouvé." });
        const userToDelete = users[0].nom_utilisateur;

        const [result] = await db.query("DELETE FROM utilisateurs WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: "Utilisateur non trouvé." });

        await logActivity(req.user.id, req.user.nom_utilisateur, 'SUPPRESSION_UTILISATEUR', `A supprimé l'utilisateur '${userToDelete}' (ID ${id}).`);
        res.json({ message: "Utilisateur supprimé avec succès." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la suppression de l'utilisateur." });
    }
});

app.put('/api/utilisateurs/:id/approuver', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role, assigned_matiere_id, assigned_type_examen, assigned_promotion } = req.body;
        
        const [result] = await db.query(
            "UPDATE utilisateurs SET statut = 'approuve', role = ?, assigned_matiere_id = ?, assigned_type_examen = ?, assigned_promotion = ? WHERE id = ?", 
            [role, assigned_matiere_id || null, assigned_type_examen || null, assigned_promotion || null, id]
        );
        
        res.json({ message: "Utilisateur approuvé et configuré avec succès." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de l'approbation." });
    }
});

app.put('/api/utilisateurs/:id/rejeter', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const [result] = await db.query("UPDATE utilisateurs SET statut = 'rejete' WHERE id = ?", [id]);
        if (result.affectedRows === 0) return res.status(404).json({ message: "Utilisateur non trouvé." });
        res.json({ message: "Utilisateur rejeté." });
    } catch (err) {
        res.status(500).json({ error: "Erreur lors du rejet de l'utilisateur." });
    }
});

app.get('/api/stats/copies-par-matiere', authenticateToken, checkRole(['admin', 'operateur_code', 'operateur_note']), async (req, res) => {
    try {
        const { promotion, population } = req.query;

        const query = `
            SELECT 
                m.id, 
                m.nom_matiere,
                -- 1. Total des notes saisies pour ce groupe précis
                COUNT(CASE WHEN c.note IS NOT NULL THEN 1 END) AS avec_note,
                
                -- 2. Notes saisies mais pas encore liées pour ce groupe
                COUNT(CASE WHEN c.note IS NOT NULL AND c.eleve_id IS NULL THEN 1 END) AS en_attente,
                
                -- 3. Codes générés pour ce groupe mais qui n'ont pas encore de note
                (SELECT COUNT(*) FROM codes_anonymes_disponibles cad2 
                 WHERE cad2.code LIKE CONCAT(m.code_prefixe, '%') 
                 AND cad2.promotion = ? 
                 AND cad2.population = ?) - COUNT(CASE WHEN c.note IS NOT NULL THEN 1 END) AS sans_note
            FROM 
                matieres m
            LEFT JOIN codes_anonymes_disponibles cad ON cad.code LIKE CONCAT(m.code_prefixe, '%')
            LEFT JOIN copies c ON cad.code = c.code_anonyme AND c.matiere_id = m.id
            WHERE 
                cad.promotion = ? 
                AND cad.population = ?
            GROUP BY m.id, m.nom_matiere
            ORDER BY m.nom_matiere;
        `;

        // On passe les paramètres 4 fois pour remplir la requête
        const [stats] = await db.query(query, [promotion, population, promotion, population]);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: "Erreur serveur" });
    }
});

app.get('/api/copies/non-notees', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const { matiereId } = req.query;
        let query = `
            SELECT c.id, c.code_anonyme, m.nom_matiere
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.eleve_id IS NULL AND c.note IS NULL
        `;
        const params = [];
        if (matiereId && matiereId !== 'all') {
            query += ' AND c.matiere_id = ?';
            params.push(matiereId);
        }
        query += ' ORDER BY m.nom_matiere, c.code_anonyme';
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get('/api/codes/sans-note/:matiereId', authenticateToken, checkRole(['admin', 'operateur_code', 'operateur_note']), async (req, res) => {
    try {
        const { matiereId } = req.params;

        const [[matiere]] = await db.query("SELECT code_prefixe FROM matieres WHERE id = ?", [matiereId]);
        if (!matiere) {
            return res.status(404).json({ message: "Matière non trouvée." });
        }
        const prefixe = matiere.code_prefixe;

        const query = `
            SELECT cad.code
            FROM codes_anonymes_disponibles cad
            LEFT JOIN copies c ON cad.code = c.code_anonyme AND c.matiere_id = ?
            WHERE cad.code LIKE ? AND c.id IS NULL
            ORDER BY cad.code;
        `;

        const [codes] = await db.query(query, [matiereId, `${prefixe}%`]);
        res.json(codes);

    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.post('/api/absences/bulk', authenticateToken, checkRole(['admin']), async (req, res) => {
    const absencesData = req.body;
    const utilisateurId = req.user.id;

    if (!Array.isArray(absencesData) || absencesData.length === 0) {
        return res.status(400).json({ message: "Aucune donnée d'absence fournie." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const valuesToInsert = [];
        for (const absence of absencesData) {
            const eleveId = absence.eleve.id;
            const motif = absence.motif || null;
            const typeExamen = absence.type_examen || null;

            for (const matiere of absence.matieres) {
                const matiereId = matiere.id;
                valuesToInsert.push([eleveId, matiereId, utilisateurId, motif, typeExamen]);
            }
        }

        if (valuesToInsert.length === 0) {
            await connection.rollback();
            return res.status(400).json({ message: "Les données d'absence sont invalides ou vides." });
        }

        const sql = "INSERT IGNORE INTO absences (eleve_id, matiere_id, enregistre_par_utilisateur_id, motif, type_examen) VALUES ?";
        const [result] = await connection.query(sql, [valuesToInsert]);

        await connection.commit();

        res.status(201).json({
            message: `${result.affectedRows} absence(s) ont été enregistrée(s) avec succès.`
        });

    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Erreur interne lors l'enregistrement des absences." });
    } finally {
        connection.release();
    }
});
// Route utilisée par la Saisie Directe (mode série) pour enregistrer en masse
// les absences temporaires accumulées, en parallèle des notes.
app.post('/api/absences/direct-bulk', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    const { absences } = req.body;
    const utilisateurId = req.user.id;

    if (!Array.isArray(absences) || absences.length === 0) {
        return res.status(400).json({ message: "Aucune absence à enregistrer n'a été fournie." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const valuesToInsert = [];
        const dejaVus = new Set();

        for (const absence of absences) {
            if (!absence.eleve_id || !absence.matiere_id) {
                throw new Error("Une des absences est incomplète. Opération annulée.");
            }

            const key = `${absence.eleve_id}-${absence.matiere_id}-${absence.type_examen || ''}`;
            if (dejaVus.has(key)) {
                throw new Error(`Absence en double pour ${absence.eleve_nom || 'un élève'}. Opération annulée.`);
            }
            dejaVus.add(key);

            valuesToInsert.push([
                absence.eleve_id,
                absence.matiere_id,
                utilisateurId,
                absence.motif || null,
                absence.type_examen || null
            ]);
        }

        const sql = `
            INSERT IGNORE INTO absences (eleve_id, matiere_id, enregistre_par_utilisateur_id, motif, type_examen)
            VALUES ?
        `;
        const [result] = await connection.query(sql, [valuesToInsert]);

        await connection.commit();
        res.status(201).json({
            message: `${result.affectedRows} absence(s) enregistrée(s) avec succès.`
        });
    } catch (err) {
        await connection.rollback();
        res.status(409).json({ message: err.message || "Erreur lors de l'enregistrement des absences." });
    } finally {
        connection.release();
    }
});

app.get('/api/absences', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    const { promotion } = req.query;
      

    try {
        let sql = `
            SELECT 
                e.id, e.nom, e.prenom, e.numero_incorporation, e.promotion,
                a.motif, a.type_examen,
                m.id AS matiere_id, m.nom_matiere
            FROM absences a
            JOIN eleves e ON a.eleve_id = e.id
            JOIN matieres m ON a.matiere_id = m.id
        `;

        const params = [];
        if (promotion) {
            sql += ` WHERE e.promotion = ?`;
            params.push(promotion);
        }

        sql += ` ORDER BY e.nom, e.prenom`;

        const [rows] = await db.query(sql, params);

        const grouped = {};
        for (const row of rows) {
            if (!grouped[row.id]) {
                grouped[row.id] = {
                    eleve: {
                        id: row.id,
                        nom: row.nom,
                        prenom: row.prenom,
                        numero_incorporation: row.numero_incorporation,
                        promotion: row.promotion
                    },
                    motif: row.motif,
                    details: []
                };
            }
            grouped[row.id].details.push({
                matiere_id: row.matiere_id,
                nom_matiere: row.nom_matiere,
                type_examen: row.type_examen
            });
        }

        res.json(Object.values(grouped));

    } catch (err) {
        console.error("Erreur GET /api/absences", err);
        res.status(500).json({ message: "Erreur serveur." });
    }
});

app.delete('/api/absences/:eleveId', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { eleveId } = req.params;
        await db.query("DELETE FROM absences WHERE eleve_id = ?", [eleveId]);
        res.json({ message: "Absence(s) supprimée(s) avec succès." });
    } catch (err) {
        res.status(500).json({ message: "Erreur interne lors de la suppression." });
    }
});

app.put('/api/absences/:eleveId', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { eleveId } = req.params;
    const { matieres, motif } = req.body;
    const utilisateurId = req.user.id;

    if (!Array.isArray(matieres) || matieres.length === 0) {
        return res.status(400).json({ message: "Veuillez sélectionner au moins une matière." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        await connection.query("DELETE FROM absences WHERE eleve_id = ?", [eleveId]);

        const valuesToInsert = matieres.map(matiereId => [
            eleveId,
            matiereId,
            utilisateurId,
            motif || null
        ]);

        const sql = "INSERT INTO absences (eleve_id, matiere_id, enregistre_par_utilisateur_id, motif) VALUES ?";
        await connection.query(sql, [valuesToInsert]);

        await connection.commit();
        res.json({ message: "Les absences de l'élève ont été mises à jour avec succès." });

    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Erreur interne lors de la mise à jour." });
    } finally {
        connection.release();
    }
});

app.post(apiPaths.copies.noteDirecte, authenticateToken, checkRole(['admin','operateur_note']), async (req, res) => {
    const { eleve_id, matiere_id, note, type_examen } = req.body;
    const utilisateurId = req.user.id;

    if (!eleve_id || !matiere_id || note === undefined || note === '' || !type_examen) {
        return res.status(400).json({ message: "Élève, matière, note et type d'examen sont requis." });
    }
    const noteNum = parseFloat(note);
    if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
         return res.status(400).json({ message: "La note doit être un nombre valide entre 0 et 20." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [absenceCheck] = await connection.query(
            "SELECT id FROM absences WHERE eleve_id = ? AND matiere_id = ?",
            [eleve_id, matiere_id]
        );
        if (absenceCheck.length > 0) {
             await connection.rollback();
             return res.status(409).json({ message: "Impossible d'enregistrer la note : cet élève est déclaré absent pour cette matière." });
        }

        const query = `
            INSERT INTO copies (eleve_id, matiere_id, note, type_examen, note_saisie_par_utilisateur_id, code_anonyme)
            VALUES (?, ?, ?, ?, ?, NULL)
            ON DUPLICATE KEY UPDATE
                note = VALUES(note),
                note_saisie_par_utilisateur_id = VALUES(note_saisie_par_utilisateur_id);
        `;
        await connection.query(query, [eleve_id, matiere_id, noteNum, type_examen, utilisateurId]);

        await connection.commit();
        res.status(201).json({ message: "Note enregistrée avec succès." });

    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: `Cet élève a déjà une note pour cette matière et ce type d'examen.` });
        }
        res.status(500).json({ error: "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.get('/api/eleves-par-groupe', authenticateToken, checkRole(['admin','operateur_note']), async (req, res) => {
    const { matiereId, typeExamen, escadron, peloton, promotion, population } = req.query;

    if (!matiereId || !typeExamen) {
        return res.status(400).json({ message: "Matière et type d'examen requis." });
    }

    try {
        let params = [matiereId, typeExamen, matiereId];
        let queryConditions = "";

        // --- NOUVELLE LOGIQUE HARMONISÉE ---
        if (population === 'conseil') {
            // On prend tous ceux qui ont un statut de conseil
            queryConditions += " AND e.statut IN ('redoublant', 'ajourne_3m', 'ajourne_6m')";
        } else {
            // MODE ACTIF / ALL : On utilise le filtre Escadron/Peloton
            if (escadron) {
                queryConditions += " AND e.escadron = ?";
                params.push(escadron);
            }

            if (peloton && peloton !== 'all') {
                queryConditions += ' AND e.peloton = ?';
                params.push(peloton);
            }
            
            if (population === 'actif') {
                queryConditions += " AND (e.statut = 'actif' OR e.statut IS NULL OR e.statut = 'approuve')";
            }
        }
        // ----------------------------------

        if (promotion && promotion !== 'all' && promotion !== 'undefined') {
            queryConditions += ' AND e.promotion = ?';
            params.push(promotion);
        }

        const query = `
           SELECT e.id, e.nom, e.prenom, e.numero_incorporation, e.sexe, e.escadron, e.peloton, e.statut
            FROM eleves e
            LEFT JOIN copies c ON e.id = c.eleve_id AND c.matiere_id = ? AND c.type_examen = ?
            LEFT JOIN absences a ON e.id = a.eleve_id AND a.matiere_id = ?
            WHERE c.id IS NULL
              AND a.id IS NULL
              ${queryConditions}
            ORDER BY e.nom ASC, CAST(e.numero_incorporation AS UNSIGNED) ASC;
        `;

        const [eleves] = await db.query(query, params);
        res.json(eleves);
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur." });
    }
});

app.put('/api/matieres/coefficients', authenticateToken, checkRole(['admin']), async (req, res) => {
    const coefficients = req.body;
    if (!Array.isArray(coefficients) || coefficients.length === 0) {
        return res.status(400).json({ message: "Les données des coefficients sont invalides." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const promises = coefficients.map(item => {
            const coeffNum = parseFloat(item.coefficient);
            if (isNaN(coeffNum) || coeffNum < 0) {
                throw new Error(`Coefficient invalide pour la matière ID ${item.id}`);
            }
            return connection.query("UPDATE matieres SET coefficient = ? WHERE id = ?", [coeffNum, item.id]);
        });
        await Promise.all(promises);
        await connection.commit();
        res.json({ message: "Les coefficients ont été mis à jour avec succès." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message || "Erreur interne du serveur." });
    } finally {
        connection.release();
    }
});

app.get('/api/resultats/classement', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [eleves] = await db.query("SELECT id, prenom, nom, numero_incorporation FROM eleves");

        const [matieres] = await db.query("SELECT id, coefficient_legacy AS coefficient FROM matieres");
        const [notes] = await db.query("SELECT eleve_id, matiere_id, note FROM copies WHERE note IS NOT NULL");

        const notesMap = new Map();
        notes.forEach(n => {
            notesMap.set(`${n.eleve_id}-${n.matiere_id}`, n.note);
        });

        const totalCoefficients = matieres.reduce((sum, m) => sum + parseFloat(m.coefficient), 0);
        if (totalCoefficients === 0) {
             return res.json([]);
        }

        const resultatsCalcules = eleves.map(eleve => {
            let totalPoints = 0;
            let hasAtLeastOneNote = false;

            matieres.forEach(matiere => {
                const note = notesMap.get(`${eleve.id}-${matiere.id}`);
                if (note !== undefined && note !== null) {
                    totalPoints += parseFloat(note) * parseFloat(matiere.coefficient);
                    hasAtLeastOneNote = true;
                }
            });

            if (!hasAtLeastOneNote) {
                return { ...eleve, moyenne: null, statut: 'Non classé' };
            }

            const moyenne = totalPoints / totalCoefficients;
            return { ...eleve, moyenne: moyenne.toFixed(2), statut: 'Classé' };
        });

        const classes = resultatsCalcules.filter(r => r.statut === 'Classé');
        const nonClasses = resultatsCalcules.filter(r => r.statut === 'Non classé');

        classes.sort((a, b) => b.moyenne - a.moyenne);

        let rang = 0;
        let lastMoyenne = -1;
        let studentsAtCurrentRank = 1;

        const classesAvecRang = classes.map((eleve, index) => {
            if (eleve.moyenne !== lastMoyenne) {
                rang = rang + studentsAtCurrentRank;
                studentsAtCurrentRank = 1;
            } else {
                 studentsAtCurrentRank++;
            }
            lastMoyenne = eleve.moyenne;

            const isExAequo = (index > 0 && eleve.moyenne === classes[index - 1].moyenne) ||
                              (index < classes.length - 1 && eleve.moyenne === classes[index + 1].moyenne);

            return { ...eleve, rang: isExAequo ? `${rang} ex` : rang };
        });

        const classementFinal = [...classesAvecRang, ...nonClasses];
        res.json(classementFinal);

    } catch (err) {
        res.status(500).json({ error: "Erreur lors du calcul du classement." });
    }
});

const getMention = (moyenne) => {
    if (moyenne === null || isNaN(moyenne)) return 'Non classé';
    if (moyenne >= 18) return 'Excellent';
    if (moyenne >= 16) return 'Très Bien';
    if (moyenne >= 14) return 'Bien';
    if (moyenne >= 12) return 'Assez Bien';
    if (moyenne >= 10) return 'Passable';
    return 'Insuffisant';
};

async function calculerClassementDetaille(typeExamen, promotion) {
    const [modeles] = await db.query("SELECT id, nom_modele, coefficient_general FROM modeles_examens");
    const [configs] = await db.query("SELECT modele_examen_id, matiere_id, coefficient FROM examens_configurations");
    const [toutesLesMatieres] = await db.query("SELECT id, nom_matiere, code_prefixe FROM matieres ORDER BY nom_matiere");
       const modelesHorsRepechage = modeles.filter(m => 
        !m.nom_modele.toUpperCase().includes('REPECHAGE')
    );
    // Filtrer les élèves par promotion
    let eleveQuery = "SELECT id, prenom, nom, numero_incorporation, escadron, peloton, promotion FROM eleves";
    const eleveParams = [];
    if (promotion && promotion !== '') {
        eleveQuery += " WHERE promotion = ?";
        eleveParams.push(promotion);
    }
    eleveQuery += " ORDER BY nom, prenom";
    const [eleves] = await db.query(eleveQuery, eleveParams);

    const [notes] = await db.query("SELECT eleve_id, matiere_id, note, type_examen FROM copies WHERE note IS NOT NULL");

    let matieresAffiches = [];
    if (typeExamen && typeExamen !== 'General') {
        const modeleSelectionne = modeles.find(m => m.nom_modele === typeExamen);
        if (modeleSelectionne) {
            const idsMatieresDuModele = configs
                .filter(c => c.modele_examen_id === modeleSelectionne.id)
                .map(c => c.matiere_id);
            matieresAffiches = toutesLesMatieres.filter(m => idsMatieresDuModele.includes(m.id));
        }
    }

    const resultatsCalcules = eleves.map(eleve => {
        const notesEleve = notes.filter(n => n.eleve_id === eleve.id);
        const notesDetail = {};
        let moyenneFinale = null;

        if (typeExamen && typeExamen !== 'General') {
            const modele = modeles.find(m => m.nom_modele === typeExamen);
            if (modele) {
                const configsModele = configs.filter(c => c.modele_examen_id === modele.id);
                let totalPoints = 0;
                let totalCoeffs = 0;

                configsModele.forEach(config => {
                    const noteTrouvee = notesEleve.find(n => 
                        n.matiere_id === config.matiere_id && 
                        n.type_examen === typeExamen
                    );
                    if (noteTrouvee) {
                        totalPoints += parseFloat(noteTrouvee.note) * parseFloat(config.coefficient);
                        totalCoeffs += parseFloat(config.coefficient);
                        notesDetail[config.matiere_id] = parseFloat(noteTrouvee.note).toFixed(2);
                    }
                });

                if (totalCoeffs > 0) {
                    moyenneFinale = (totalPoints / totalCoeffs).toFixed(2);
                }
            }
        } else {
            // Calcul General = moyenne des moyennes pondérées par coefficient_general
            const moyennesParModele = {};

            modelesHorsRepechage.forEach(modele => {
                const configsModele = configs.filter(c => c.modele_examen_id === modele.id);
                let totalPointsModele = 0;
                let totalCoeffsModele = 0;

                configsModele.forEach(config => {
                    const noteTrouvee = notesEleve.find(n => 
                        n.matiere_id === config.matiere_id && 
                        n.type_examen === modele.nom_modele
                    );
                    if (noteTrouvee) {
                        totalPointsModele += parseFloat(noteTrouvee.note) * parseFloat(config.coefficient);
                        totalCoeffsModele += parseFloat(config.coefficient);
                    }
                });

                if (totalCoeffsModele > 0) {
                    moyennesParModele[modele.nom_modele] = totalPointsModele / totalCoeffsModele;
                }
            });

            let totalPointsGeneral = 0;
            let totalCoeffsGeneral = 0;

           modelesHorsRepechage.forEach(modele => {
                const coeffGeneral = parseFloat(modele.coefficient_general);
                if (coeffGeneral > 0) {
                    totalCoeffsGeneral += coeffGeneral;
                    if (moyennesParModele[modele.nom_modele] !== undefined) {
                        totalPointsGeneral += moyennesParModele[modele.nom_modele] * coeffGeneral;
                    }
                }
            });

            if (totalCoeffsGeneral > 0) {
                moyenneFinale = (totalPointsGeneral / totalCoeffsGeneral).toFixed(2);
            }
        }

        const statutFinal = moyenneFinale !== null ? 'Classé' : 'Non classé';
        return { 
            ...eleve, 
            moyenne: moyenneFinale, 
            statut: statutFinal, 
            notesDetail 
        };
    });

    // ✅ Séparer classés et non classés
    const classes = resultatsCalcules.filter(r => r.statut === 'Classé');
    const nonClasses = resultatsCalcules.filter(r => r.statut === 'Non classé');

    // ✅ Trier les classés par moyenne décroissante
    classes.sort((a, b) => parseFloat(b.moyenne) - parseFloat(a.moyenne));

    // ✅ Calcul des rangs avec ex aequo
    let rang = 0;
    let lastMoyenne = -1;
    let studentsAtCurrentRank = 1;

    const classesAvecRang = classes.map((eleve, index) => {
        if (eleve.moyenne !== lastMoyenne) {
            rang += studentsAtCurrentRank;
            studentsAtCurrentRank = 1;
        } else {
            studentsAtCurrentRank++;
        }
        lastMoyenne = eleve.moyenne;

        const isExAequo = 
            (index > 0 && eleve.moyenne === classes[index - 1].moyenne) || 
            (index < classes.length - 1 && eleve.moyenne === classes[index + 1].moyenne);

        return { 
            ...eleve, 
            rang: isExAequo ? `${rang} ex` : rang 
        };
    });

    // ✅ Non classés à la fin avec rang null
    const nonClassesAvecRang = nonClasses.map(eleve => ({
        ...eleve,
        rang: null
    }));

    return { 
        classement: [...classesAvecRang, ...nonClassesAvecRang], 
        matieres: matieresAffiches 
    };
}

app.get('/api/resultats/classement-details', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { typeExamen, promotion, population } = req.query;
        
        let queryBase = `
            SELECT s.eleve_id, s.rang, s.moyenne, s.motif_non_classe,
                   e.prenom, e.nom, e.numero_incorporation, e.escadron, e.peloton, e.statut
            FROM statistiques_classement s
            JOIN eleves e ON s.eleve_id = e.id
            WHERE s.type_examen = ?
        `;
        
        const params = [typeExamen || 'General'];
        if (promotion && promotion !== 'all') { 
            queryBase += " AND s.promotion = ?"; 
            params.push(promotion); 
        }
        if (population && population !== 'all') { 
            queryBase += " AND s.population = ?"; 
            params.push(population); 
        }
        queryBase += " ORDER BY CAST(s.rang AS UNSIGNED) ASC, s.rang IS NULL ASC";

        const [elevesCibles] = await db.query(queryBase, params);

        if (elevesCibles.length === 0) return res.json({ classement: [], matieres: [] });

        const ids = elevesCibles.map(e => e.eleve_id);
        const [historiqueNotes] = await db.query(`
            SELECT eleve_id, type_examen, moyenne 
            FROM statistiques_classement 
            WHERE eleve_id IN (?)
        `, [ids]);

        const classementFormate = elevesCibles.map(eleve => {
            const details = {};
            historiqueNotes
                .filter(h => h.eleve_id === eleve.eleve_id)
                .forEach(h => {
                    details[h.type_examen] = h.moyenne;
                });
            return { 
                ...eleve, 
                details,
                //  motif_non_classe déjà inclus depuis la requête
            };
        });

        const [matieres] = await db.query(`
            SELECT m.id, m.nom_matiere, m.code_prefixe
            FROM matieres m
            JOIN examens_configurations ec ON m.id = ec.matiere_id
            JOIN modeles_examens me ON ec.modele_examen_id = me.id
            WHERE me.nom_modele = ?
        `, [typeExamen || 'General']);

        res.json({ classement: classementFormate, matieres });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Erreur chargement classement détaillé" });
    }
});


app.get('/api/resultats/exporter-classement-excel', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { typeExamen, promotion } = req.query;
       const { classement, matieres } = await calculerClassementDetaille(typeExamen, promotion);

        if (!classement || classement.length === 0) {
            return res.status(404).json({ message: "Aucune donnée de classement à exporter." });
        }

        // ✅ Filtrer par promotion si spécifiée
        let classementFiltre = classement;
        if (promotion && promotion !== '') {
            classementFiltre = classement.filter(e => e.promotion === promotion);
        }

        // ✅ Séparer classés et non classés - non classés à la fin
        const classes = classementFiltre.filter(e => e.rang !== null && e.statut !== 'Non classé');
        const nonClasses = classementFiltre.filter(e => e.rang === null || e.statut === 'Non classé');
        const classementOrdonne = [...classes, ...nonClasses];

        const workbook = xlsx.utils.book_new();

        const syntheseData = [
            ['RANG', 'NOM ET PRÉNOM', 'N° INCORP.', 'ESCADRON', 'PELOTON', 'MOYENNE', 'MENTION'],
            ...classementOrdonne.map(e => [
                e.rang || 'Non classé',
                `${e.nom} ${e.prenom}`,
                e.numero_incorporation,
                e.escadron || '-',
                e.peloton || '-',
                e.moyenne !== null ? e.moyenne : '-',
                getMention(e.moyenne)
            ])
        ];
        const syntheseWorksheet = xlsx.utils.aoa_to_sheet(syntheseData);
        syntheseWorksheet['!cols'] = [{wch: 15}, {wch: 30}, {wch: 15}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}];
        xlsx.utils.book_append_sheet(workbook, syntheseWorksheet, 'Synthèse du Classement');

        if (typeExamen && typeExamen !== 'General' && matieres && matieres.length > 0) {
            const detailHeaders = ['RANG', 'NOM ET PRÉNOM', ...matieres.map(m => (m.code_prefixe || m.nom_matiere).toUpperCase()), 'MOYENNE'];
            const detailBody = classementOrdonne.map(eleve => [
                eleve.rang || 'Non classé',
                `${eleve.nom} ${eleve.prenom}`,
                ...matieres.map(m => eleve.notesDetail[m.id] || '-'),
                eleve.moyenne !== null ? eleve.moyenne : '-'
            ]);
            const detailWorksheet = xlsx.utils.aoa_to_sheet([detailHeaders, ...detailBody]);
            const cols = [{wch:10}, {wch:30}, ...matieres.map(() => ({wch: 15})), {wch:10}];
            detailWorksheet['!cols'] = cols;
            xlsx.utils.book_append_sheet(workbook, detailWorksheet, 'Détail des Notes');
        }

        const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const fileName = `Classement_${typeExamen || 'General'}${promotion ? '_' + promotion : ''}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la génération du fichier Excel." });
    }
});

app.put('/api/copies/relier/:copieId', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    const { copieId } = req.params;
    const { nouvel_eleve_id, matiere_id } = req.body;
    const utilisateurId = req.user.id;

    if (!nouvel_eleve_id || !matiere_id) {
        return res.status(400).json({ message: "Le nouvel élève et la matière sont requis." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [existingLink] = await connection.query(
            "SELECT id FROM copies WHERE eleve_id = ? AND matiere_id = ? AND id != ?",
            [nouvel_eleve_id, matiere_id, copieId]
        );
        if (existingLink.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: "Conflit : ce nouvel élève est déjà lié à une autre copie pour cette matière." });
        }

        const [absenceCheck] = await connection.query(
            "SELECT id FROM absences WHERE eleve_id = ? AND matiere_id = ?",
            [nouvel_eleve_id, matiere_id]
        );
        if (absenceCheck.length > 0) {
            await connection.rollback();
            return res.status(409).json({ message: "Modification impossible : le nouvel élève est déclaré absent pour cette matière." });
        }

        const [updateResult] = await connection.query(
            "UPDATE copies SET eleve_id = ?, cree_par_utilisateur_id = ? WHERE id = ?",
            [nouvel_eleve_id, utilisateurId, copieId]
        );

        if (updateResult.affectedRows === 0) {
            throw new Error("La copie à mettre à jour n'a pas été trouvée.");
        }

        await connection.commit();
        res.json({ message: "Le liage a été modifié avec succès." });

    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message || "Erreur interne du serveur lors de la modification." });
    } finally {
        connection.release();
    }
});

app.delete('/api/copies/delier/:copieId', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    const { copieId } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [copies] = await connection.query("SELECT code_anonyme FROM copies WHERE id = ?", [copieId]);
        if (copies.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Liage non trouvé." });
        }
        const code_anonyme = copies[0].code_anonyme;

        await connection.query(
            "UPDATE copies SET eleve_id = NULL, cree_par_utilisateur_id = NULL WHERE id = ?",
            [copieId]
        );

        if (code_anonyme) {
             await connection.query("UPDATE codes_anonymes_disponibles SET est_utilise = 0 WHERE code = ?", [code_anonyme]);
        }

        await connection.commit();
        res.json({ message: "Le liage a été supprimé avec succès. Le code est de nouveau disponible." });

    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Erreur interne du serveur lors de la suppression." });
    } finally {
        connection.release();
    }
});

app.get('/api/anomalies', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    try {
        const query = `
            SELECT
                a.id, a.motif, a.date_signalement,
                m.nom_matiere,
                u.nom_utilisateur AS signale_par
            FROM anomalies a
            JOIN matieres m ON a.matiere_id = m.id
            JOIN utilisateurs u ON a.signale_par_utilisateur_id = u.id
            ORDER BY a.date_signalement DESC;
        `;
        const [anomalies] = await db.query(query);
        res.json(anomalies);
    } catch (err) {
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

app.post('/api/anomalies', authenticateToken, checkRole(['admin', 'operateur_code']), async (req, res) => {
    const { matiere_id, motif } = req.body;
    const utilisateurId = req.user.id;

    if (!matiere_id || !motif || motif.trim() === '') {
        return res.status(400).json({ message: "La matière et le motif sont requis pour signaler une anomalie." });
    }

    try {
        const query = "INSERT INTO anomalies (matiere_id, motif, signale_par_utilisateur_id) VALUES (?, ?, ?)";
        await db.query(query, [matiere_id, motif.trim(), utilisateurId]);
        res.status(201).json({ message: "Anomalie signalée avec succès." });
    } catch (err) {
        res.status(500).json({ message: "Erreur interne lors de l'enregistrement de l'anomalie." });
    }
});

app.get('/api/resultats/sans-note/:matiereId', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { matiereId } = req.params;
        const { type_examen } = req.query;

        if (!matiereId) {
            return res.status(400).json({ message: "L'identifiant de la matière est requis." });
        }

        if (!type_examen) {
            return res.status(400).json({ message: "Le type d'examen est requis pour voir les manquants." });
        }

        const query = `
            SELECT e.id, e.nom, e.prenom, e.numero_incorporation, e.escadron, e.peloton
            FROM eleves e
            WHERE
                e.id NOT IN (
                    SELECT c.eleve_id
                    FROM copies c
                    WHERE c.matiere_id = ?
                      AND c.type_examen = ?
                      AND c.eleve_id IS NOT NULL
                      AND c.note IS NOT NULL
                )
            ORDER BY e.escadron, e.peloton, CAST(e.numero_incorporation AS UNSIGNED) ASC;
        `;

        const [eleves] = await db.query(query, [matiereId, type_examen]);
        res.json(eleves);

    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération des élèves sans note." });
    }
});

const calculerClassementComplet = async (dbConnection) => {
    const [eleves] = await dbConnection.query("SELECT id, prenom, nom, numero_incorporation FROM eleves");
    const [matieres] = await dbConnection.query("SELECT id, coefficient_legacy AS coefficient FROM matieres");
    const [notes] = await dbConnection.query("SELECT id as copie_id, eleve_id, matiere_id, note FROM copies WHERE note IS NOT NULL");

    const notesMap = new Map();
    notes.forEach(n => {
        notesMap.set(`${n.eleve_id}-${n.matiere_id}`, { note: n.note, copie_id: n.copie_id });
    });

    const totalCoefficients = matieres.reduce((sum, m) => sum + parseFloat(m.coefficient), 0);
    if (totalCoefficients === 0) return [];

    const resultatsCalcules = eleves.map(eleve => {
        let totalPoints = 0;
        let notesDetail = {};
        matieres.forEach(matiere => {
            const noteInfo = notesMap.get(`${eleve.id}-${matiere.id}`);
            if (noteInfo) {
                totalPoints += parseFloat(noteInfo.note) * parseFloat(matiere.coefficient);
                notesDetail[matiere.id] = { note: noteInfo.note, copie_id: noteInfo.copie_id };
            }
        });
        const moyenne = totalPoints / totalCoefficients;
        return { ...eleve, moyenne, notesDetail };
    });

    resultatsCalcules.sort((a, b) => b.moyenne - a.moyenne);

    let rang = 0;
    let lastMoyenne = -1;
    let studentsAtCurrentRank = 1;
    return resultatsCalcules.map((eleve, index) => {
        if (eleve.moyenne !== lastMoyenne) {
            rang += studentsAtCurrentRank;
            studentsAtCurrentRank = 1;
        } else {
            studentsAtCurrentRank++;
        }
        lastMoyenne = eleve.moyenne;
        return { ...eleve, rang };
    });
};

app.get(apiPaths.incognito.classementActuel, authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const classement = await calculerClassementComplet(db);
        res.json(classement);
    } catch (err) {
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

app.post(apiPaths.incognito.suggestionsMoyenne, authenticateToken, checkRole(['admin']), async (req, res) => {
    const { eleveCibleId, moyenneVisee, rangVise, matiereIds, typeExamen, forceExploration } = req.body;

    if (!eleveCibleId) {
        return res.status(400).json({ message: "Élève cible requis." });
    }

    try {
        const [rowsCoeffs] = await db.query("SELECT coefficient_legacy AS coefficient FROM matieres");
        const totalCoefficients = rowsCoeffs.reduce((sum, m) => sum + parseFloat(m.coefficient || 0), 0);

        const classementActuel = await calculerClassementComplet(db);
        const eleveCible = classementActuel.find(e => e.id == eleveCibleId);

        if (!eleveCible) return res.status(404).json({ message: "Élève cible non trouvé." });

        let matieresAAnalyser = [];
        if (matiereIds && matiereIds.length > 0) {
            const placeholders = matiereIds.map(() => '?').join(',');
            const [selectedMatieres] = await db.query(`SELECT id, nom_matiere, coefficient_legacy AS coefficient FROM matieres WHERE id IN (${placeholders})`, matiereIds);
            matieresAAnalyser = selectedMatieres;
        } else {
            const [toutesLesMatieres] = await db.query("SELECT id, nom_matiere, coefficient_legacy AS coefficient FROM matieres");
            matieresAAnalyser = toutesLesMatieres;
        }

        const suggestionsFinales = [];

        for (const matiere of matieresAAnalyser) {
            const coeffMatiere = parseFloat(matiere.coefficient);
            let noteActuelleCible = 0;
            let copieIdCible = null;

            if (typeExamen) {
                const [copie] = await db.query("SELECT id, note FROM copies WHERE eleve_id = ? AND matiere_id = ? AND type_examen = ?", [eleveCibleId, matiere.id, typeExamen]);
                if (copie.length > 0) {
                    noteActuelleCible = parseFloat(copie[0].note);
                    copieIdCible = copie[0].id;
                } else {
                    continue;
                }
            } else {
                if (eleveCible.notesDetail[matiere.id]) {
                    noteActuelleCible = parseFloat(eleveCible.notesDetail[matiere.id].note);
                    copieIdCible = eleveCible.notesDetail[matiere.id].copie_id;
                } else { continue; }
            }

            let queryDonneurs = `
                SELECT c.id as copie_id, e.id as eleve_id, e.nom, e.prenom, c.note
                FROM copies c JOIN eleves e ON c.eleve_id = e.id
                WHERE c.matiere_id = ?
                  AND c.eleve_id != ?
                  AND c.note > ?
                  AND c.note IS NOT NULL
            `;
            const paramsDonneurs = [matiere.id, eleveCibleId, noteActuelleCible];

            if (typeExamen) {
                queryDonneurs += ` AND c.type_examen = ?`;
                paramsDonneurs.push(typeExamen);
            }

            queryDonneurs += ` ORDER BY c.note DESC LIMIT 10`;

            const [donneursPotentiels] = await db.query(queryDonneurs, paramsDonneurs);

            for (const donneur of donneursPotentiels) {
                const gainNote = donneur.note - noteActuelleCible;
                let moyenneCible = parseFloat(eleveCible.moyenne || 0);

                const infosDonneur = classementActuel.find(e => e.id === donneur.eleve_id);
                const moyenneDonneurActuelle = parseFloat(infosDonneur ? infosDonneur.moyenne : 0);
                const rangDonneurActuel = infosDonneur ? infosDonneur.rang : 'N/A';

                let moyenneDonneurSimulee = moyenneDonneurActuelle;

                if (totalCoefficients > 0) {
                    const impact = (gainNote * coeffMatiere) / totalCoefficients;
                    moyenneCible += impact; 
                    moyenneDonneurSimulee -= impact; 
                }

                const countBetterThanDonator = classementActuel.filter(e =>
                    e.id !== donneur.eleve_id &&
                    parseFloat(e.moyenne || 0) > moyenneDonneurSimulee
                ).length;
                const rangDonneurSimule = countBetterThanDonator + 1;

                suggestionsFinales.push({
                    matiere: { id: matiere.id, nom: matiere.nom_matiere },
                    copieIdCible: copieIdCible,
                    donneur: {
                        id: donneur.eleve_id,
                        nom: donneur.nom,
                        prenom: donneur.prenom,
                        rang_actuel: rangDonneurActuel,
                        moyenneActuelle: moyenneDonneurActuelle.toFixed(2), 
                        moyenneSimulee: moyenneDonneurSimulee.toFixed(2),   
                        rangSimule: rangDonneurSimule,                      
                        copie_id: donneur.copie_id
                    },
                    noteAEchanger: donneur.note,
                    noteActuelle: noteActuelleCible,
                    gainNote: gainNote,
                    typeExamen: typeExamen,
                    coeff: coeffMatiere,
                    simulation: {
                        moyenneCible: moyenneCible.toFixed(2),
                        gainMoyenne: (moyenneCible - parseFloat(eleveCible.moyenne || 0)).toFixed(2)
                    }
                });
            }
        }

        return res.json(suggestionsFinales);

    } catch (err) {
        console.error("Erreur sur /api/incognito/suggestions-moyenne:", err);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
});

const swapCopyContent = async (connection, copieIdCible, copieIdDonneur) => {
    const [copiesData] = await connection.query(
        "SELECT id, note, code_anonyme, note_saisie_par_utilisateur_id, cree_par_utilisateur_id FROM copies WHERE id IN (?, ?) FOR UPDATE",
        [copieIdCible, copieIdDonneur]
    );

    const copieCible = copiesData.find(c => c.id == copieIdCible);
    const copieDonneur = copiesData.find(c => c.id == copieIdDonneur);

    if (!copieCible || !copieDonneur) {
        throw new Error(`Échange impossible : une des copies (ID ${copieIdCible} ou ${copieIdDonneur}) est introuvable.`);
    }

    await connection.query(
        `UPDATE copies SET
            note = ?,
            note_saisie_par_utilisateur_id = ?,
            cree_par_utilisateur_id = ?
         WHERE id = ?`,
        [
            copieCible.note,
            copieCible.note_saisie_par_utilisateur_id,
            copieCible.cree_par_utilisateur_id,
            copieDonneur.id
        ]
    );

    await connection.query(
        `UPDATE copies SET
            note = ?,
            note_saisie_par_utilisateur_id = ?,
            cree_par_utilisateur_id = ?
         WHERE id = ?`,
        [
            copieDonneur.note,
            copieDonneur.note_saisie_par_utilisateur_id,
            copieDonneur.cree_par_utilisateur_id,
            copieCible.id
        ]
    );

    const tempCodeAnonyme = `swap-${copieCible.code_anonyme}-${Date.now()}`;

    await connection.query(
        `UPDATE copies SET code_anonyme = ? WHERE id = ?`,
        [tempCodeAnonyme, copieCible.id]
    );

    await connection.query(
        `UPDATE copies SET code_anonyme = ? WHERE id = ?`,
        [copieCible.code_anonyme, copieDonneur.id]
    );

    await connection.query(
        `UPDATE copies SET code_anonyme = ? WHERE id = ?`,
        [copieDonneur.code_anonyme, copieCible.id]
    );
};

app.post(apiPaths.incognito.executerEchange, authenticateToken, checkRole(['admin']), async (req, res) => {
    const { copieIdCible, copieIdDonneur } = req.body;
    if (!copieIdCible || !copieIdDonneur) {
        return res.status(400).json({ message: "Les identifiants des deux copies sont requis." });
    }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await swapCopyContent(connection, copieIdCible, copieIdDonneur);
        await connection.commit();

        await logActivity(req.user.id, req.user.nom_utilisateur, 'ECHANGE_NOTE_UNIQUE', `A échangé le contenu des copies ID ${copieIdCible} et ID ${copieIdDonneur}.`);
        res.status(200).json({ message: "L'échange a été effectué en toute discrétion." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message || "L'échange a échoué." });
    } finally {
        connection.release();
    }
});

app.post(apiPaths.incognito.executerPlan, authenticateToken, checkRole(['admin']), async (req, res) => {
    const { plan } = req.body;
    if (!Array.isArray(plan) || plan.length === 0) {
        return res.status(400).json({ message: "Le plan d'action est invalide ou vide." });
    }
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        for (const swap of plan) {
            const copieIdCible = swap.copieIdCible;
            const copieIdDonneur = swap.donneur.copie_id;
            if (!copieIdCible || !copieIdDonneur) {
                throw new Error("Un échange dans le plan est mal formaté. Opération annulée.");
            }
            await swapCopyContent(connection, copieIdCible, copieIdDonneur);
        }
        await connection.commit();

        const planDescription = plan.map(s => `(Cible:${s.copieIdCible}<->Donneur:${s.donneur.copie_id})`).join(', ');
        await logActivity(req.user.id, req.user.nom_utilisateur, 'ECHANGE_NOTE_PLAN', `A exécuté un plan de ${plan.length} échange(s): ${planDescription}`);
        res.status(200).json({ message: "Le plan a été exécuté avec succès." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: err.message || "L'exécution du plan a échoué." });
    } finally {
        connection.release();
    }
});

app.post('/api/logs/frontend-activity', authenticateToken, async (req, res) => {
    try {
        const { description } = req.body;
        const { id, nom_utilisateur } = req.user;

        if (!description || description.trim() === '') {
            return res.status(400).send();
        }

        await logActivity(id, nom_utilisateur, 'ACTION_FRONTEND', description);

        res.status(200).send();
    } catch (err) {
        console.error("Erreur lors du logging de l'activité frontend:", err);
        res.status(500).send();
    }
});

app.post('/api/user/heartbeat', authenticateToken, async (req, res) => {
    try {
        await db.query("UPDATE utilisateurs SET last_seen = NOW() WHERE id = ?", [req.user.id]);
        res.status(200).send();
    } catch (err) {
        console.error("Erreur heartbeat:", err);
        res.status(500).send();
    }
});

app.get('/api/users/online', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const query = `
            SELECT id, nom, prenom, nom_utilisateur, last_seen,
            (SELECT date_action FROM historique_activites WHERE utilisateur_id = utilisateurs.id AND type_action = 'CONNEXION_REUSSIE' ORDER BY date_action DESC LIMIT 1) as login_time
            FROM utilisateurs
            WHERE last_seen > NOW() - INTERVAL 2 MINUTE
            ORDER BY last_seen DESC
        `;
        const [users] = await db.query(query);
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur." });
    }
});

app.get('/api/dashboard/stats-par-examen', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [[{ total_eleves }]] = await db.query("SELECT COUNT(*) as total_eleves FROM eleves");

        const query = `
            SELECT
                m.id,
                m.nom_matiere,
                COALESCE(a.nombre_absents, 0) AS nombre_absents,
                COALESCE(c.nombre_notes, 0) AS nombre_notes,
                COALESCE(c.reussite_militaire, 0) AS reussite_militaire
            FROM matieres m
            LEFT JOIN (
                SELECT matiere_id, COUNT(*) as nombre_absents
                FROM absences
                GROUP BY matiere_id
            ) a ON m.id = a.matiere_id
            LEFT JOIN (
                SELECT matiere_id,
                       COUNT(*) as nombre_notes,
                       SUM(CASE WHEN note >= 12 THEN 1 ELSE 0 END) as reussite_militaire
                FROM copies
                WHERE note IS NOT NULL AND eleve_id IS NOT NULL
                GROUP BY matiere_id
            ) c ON m.id = c.matiere_id
            ORDER BY m.nom_matiere;
        `;

        const [examens] = await db.query(query);

        const statsFinales = examens.map(examen => {
            const participants = total_eleves - examen.nombre_absents;
            const notes_manquantes = participants - examen.nombre_notes;

            return {
                ...examen,
                total_eleves: parseInt(total_eleves),
                participants: parseInt(participants),
                notes_manquantes: parseInt(notes_manquantes > 0 ? notes_manquantes : 0),
                nombre_absents: parseInt(examen.nombre_absents),
                nombre_notes: parseInt(examen.nombre_notes),
                reussite_militaire: parseInt(examen.reussite_militaire)
            };
        });

        res.json(statsFinales);

    } catch (err) {
        console.error("Erreur sur /api/dashboard/stats-par-examen :", err);
        res.status(500).json({ error: "Erreur lors de la récupération des statistiques du tableau de bord." });
    }
});

app.get('/api/dashboard/full-summary', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { promotion } = req.query;

        let whereEleve = "";
        let paramsEleve = [];
        let joinEleveCopies = ""; 
        let whereCopies = " WHERE note IS NOT NULL AND eleve_id IS NOT NULL";
        let paramsCopies = [];

        if (promotion && promotion !== 'all') {
            whereEleve = " WHERE promotion = ?";
            paramsEleve.push(promotion);
            
            joinEleveCopies = " JOIN eleves e ON copies.eleve_id = e.id ";
            whereCopies += " AND e.promotion = ?";
            paramsCopies.push(promotion);
        }

        const [[{ total_eleves }]] = await db.query(`SELECT COUNT(*) as total_eleves FROM eleves ${whereEleve}`, paramsEleve);

        const [matieres] = await db.query("SELECT id, nom_matiere, coefficient_legacy AS coefficient FROM matieres");
        
        const [notes] = await db.query(
            `SELECT copies.eleve_id, copies.matiere_id, copies.note 
             FROM copies ${joinEleveCopies} ${whereCopies}`, 
            paramsCopies
        );
        
        const [eleves_details] = await db.query(`SELECT id, nom, prenom FROM eleves ${whereEleve}`, paramsEleve);

        if (total_eleves === 0 || matieres.length === 0) {
            return res.json({ statCards: { totalEleves: 0, moyenneGenerale: "0.00", totalAdmis: 0, tauxReussite: "0.0" }, repartitionMentions: {}, repartitionNotes: {}, classementMatieres: [], elevesASuivre: [] });
        }

        const queryClassement = `
            SELECT
                m.nom_matiere,
                COUNT(c.id) as total_notes,
                SUM(CASE WHEN c.note >= 12 THEN 1 ELSE 0 END) as reussites_militaires
            FROM matieres m
            LEFT JOIN copies c ON m.id = c.matiere_id AND c.note IS NOT NULL
            LEFT JOIN eleves e ON c.eleve_id = e.id
            ${promotion && promotion !== 'all' ? 'WHERE e.promotion = ?' : ''}
            GROUP BY m.id, m.nom_matiere
            ORDER BY (reussites_militaires / NULLIF(COUNT(c.id), 0)) DESC, m.nom_matiere ASC
        `;
        const paramsClassement = (promotion && promotion !== 'all') ? [promotion] : [];
        const [classementMatieresRaw] = await db.query(queryClassement, paramsClassement);

        const classementMatieres = classementMatieresRaw.map(m => ({
            nom: m.nom_matiere,
            tauxReussite: m.total_notes > 0 ? ((m.reussites_militaires / m.total_notes) * 100).toFixed(1) : "0.0",
        }));

        const totalCoefficients = matieres.reduce((sum, m) => sum + (m.coefficient || 0), 0);
        const moyennesEleves = [];
        if (totalCoefficients > 0) {
            const notesMap = new Map();
            notes.forEach(n => {
                if (!notesMap.has(n.eleve_id)) notesMap.set(n.eleve_id, []);
                notesMap.get(n.eleve_id).push({ matiere_id: n.matiere_id, note: n.note });
            });
            eleves_details.forEach(eleve => {
                const notesDeEleve = notesMap.get(eleve.id) || [];
                if (notesDeEleve.length > 0) {
                    let totalPoints = 0;
                    notesDeEleve.forEach(noteInfo => {
                        const matiere = matieres.find(m => m.id === noteInfo.matiere_id);
                        if (matiere) totalPoints += noteInfo.note * (matiere.coefficient || 0);
                    });
                    const moyenne = totalPoints / totalCoefficients;
                    moyennesEleves.push({ ...eleve, moyenne, notesDetail: notesDeEleve });
                }
            });
        }

        moyennesEleves.sort((a, b) => a.moyenne - b.moyenne);

        const elevesASuivre = moyennesEleves.slice(0, 5).map(e => {
            const matieresFaibles = e.notesDetail
                .filter(n => n.note < 10)
                .map(n => {
                    const matiereInfo = matieres.find(m => m.id === n.matiere_id);
                    return matiereInfo ? matiereInfo.nom_matiere : 'Inconnue';
                });
            return {
                nom: `${e.prenom} ${e.nom}`,
                moyenne: e.moyenne.toFixed(2),
                matieres: matieresFaibles
            };
        });

        const moyenneGenerale = moyennesEleves.length > 0 ? moyennesEleves.reduce((sum, e) => sum + e.moyenne, 0) / moyennesEleves.length : 0;
        const totalAdmisMilitaire = moyennesEleves.filter(e => e.moyenne >= 12).length;
        const tauxReussite = moyennesEleves.length > 0 ? (totalAdmisMilitaire / moyennesEleves.length) * 100 : 0;
        const repartitionMentions = { 'Excellent': 0, 'Très Bien': 0, 'Bien': 0, 'Assez Bien': 0, 'Passable': 0, 'Insuffisant': 0 };
        moyennesEleves.forEach(e => {
            const mention = getMentionForNote(e.moyenne);
            if (repartitionMentions[mention] !== undefined) repartitionMentions[mention]++;
        });

        const [repartitionNotes] = await db.query(`
            SELECT
                SUM(CASE WHEN c.note < 10 THEN 1 ELSE 0 END) as '0-9.99',
                SUM(CASE WHEN c.note >= 10 AND c.note < 12 THEN 1 ELSE 0 END) as '10-11.99',
                SUM(CASE WHEN c.note >= 12 AND c.note < 14 THEN 1 ELSE 0 END) as '12-13.99',
                SUM(CASE WHEN c.note >= 14 AND c.note < 16 THEN 1 ELSE 0 END) as '14-15.99',
                SUM(CASE WHEN c.note >= 16 THEN 1 ELSE 0 END) as '16-20'
            FROM copies c
            JOIN eleves e ON c.eleve_id = e.id
            WHERE c.note IS NOT NULL
            ${promotion && promotion !== 'all' ? 'AND e.promotion = ?' : ''}
        `, paramsClassement);

        res.json({
            statCards: {
                totalEleves: total_eleves,
                moyenneGenerale: moyenneGenerale.toFixed(2),
                totalAdmis: totalAdmisMilitaire,
                tauxReussite: tauxReussite.toFixed(1)
            },
            repartitionMentions,
            repartitionNotes: repartitionNotes[0],
            classementMatieres,
            elevesASuivre
        });
    } catch (err) {
        console.error("Erreur sur /api/dashboard/full-summary :", err);
        res.status(500).json({ error: "Erreur lors de la récupération de la synthèse du tableau de bord." });
    }
});

const getMentionForNote = (note) => {
    if (note === null) return 'N/A';
    if (note >= 18) return 'Excellent';
    if (note >= 16) return 'Très Bien';
    if (note >= 14) return 'Bien';
    if (note >= 12) return 'Assez Bien';
    if (note >= 10) return 'Passable';
    return 'Insuffisant';
};


app.get('/api/dashboard/summary-by-exam-type', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { promotion, population } = req.query;

        // 1. Total élèves
        let eleveQuery = `SELECT COUNT(*) as total FROM eleves WHERE 1=1`;
        const eleveParams = [];
        if (promotion && promotion !== 'all') {
            eleveQuery += " AND promotion = ?";
            eleveParams.push(promotion);
        }
        const apiPop = population === 'total' ? null : population;
        if (apiPop && apiPop !== 'all') {
            if (apiPop === 'actif') {
                eleveQuery += " AND (statut = 'actif' OR statut IS NULL OR statut = 'approuve')";
            } else if (apiPop === 'conseil') {
                eleveQuery += " AND statut IN ('redoublant', 'ajourne_3m', 'ajourne_6m')";
            }
        }
        const [[{ total: totalEleves }]] = await db.query(eleveQuery, eleveParams);

        // 2. Stats depuis statistiques_classement
        let query = `
            SELECT 
                type_examen,
                AVG(CASE WHEN moyenne IS NOT NULL THEN CAST(moyenne AS DECIMAL(10,2)) END) as moyenne_globale,
                MIN(CASE WHEN moyenne IS NOT NULL THEN CAST(moyenne AS DECIMAL(10,2)) END) as moyenne_min,
                MAX(CASE WHEN moyenne IS NOT NULL THEN CAST(moyenne AS DECIMAL(10,2)) END) as moyenne_max,
                COUNT(eleve_id) as participants,
                COUNT(CASE WHEN moyenne IS NOT NULL THEN 1 END) as complets
            FROM statistiques_classement
            WHERE 1=1
        `;
        const params = [];
        if (promotion && promotion !== 'all') {
            query += " AND promotion = ?";
            params.push(promotion);
        }
        if (apiPop && apiPop !== 'all') {
            query += " AND population = ?";
            params.push(apiPop);
        }
        query += " GROUP BY type_examen";

        const [rows] = await db.query(query, params);

        // 3. Compter élèves avec au moins une note dans copies par type_examen
        let notesQuery = `
            SELECT 
                c.type_examen,
                COUNT(DISTINCT c.eleve_id) as eleves_avec_note
            FROM copies c
            JOIN eleves e ON c.eleve_id = e.id
            WHERE c.note IS NOT NULL
        `;
        const notesParams = [];
        if (promotion && promotion !== 'all') {
            notesQuery += " AND e.promotion = ?";
            notesParams.push(promotion);
        }
        if (apiPop && apiPop !== 'all') {
            if (apiPop === 'actif') {
                notesQuery += " AND (e.statut = 'actif' OR e.statut IS NULL OR e.statut = 'approuve')";
            } else if (apiPop === 'conseil') {
                notesQuery += " AND e.statut IN ('redoublant', 'ajourne_3m', 'ajourne_6m')";
            }
        }
        notesQuery += " GROUP BY c.type_examen";
        const [notesRows] = await db.query(notesQuery, notesParams);

        const notesMap = {};
        notesRows.forEach(r => {
            notesMap[r.type_examen] = parseInt(r.eleves_avec_note);
        });

        // ✅ 4. Pour General : compter les élèves qui ont au moins un examen 
        //    complet dans statistiques_classement (même si non classé au général)
        let generalExisteQuery = `
            SELECT COUNT(DISTINCT sc.eleve_id) as total_avec_examen
            FROM statistiques_classement sc
            WHERE sc.type_examen != 'General'
            AND sc.moyenne IS NOT NULL
        `;
        const generalParams = [];
        if (promotion && promotion !== 'all') {
            generalExisteQuery += " AND sc.promotion = ?";
            generalParams.push(promotion);
        }
        if (apiPop && apiPop !== 'all') {
            generalExisteQuery += " AND sc.population = ?";
            generalParams.push(apiPop);
        }
        const [[{ total_avec_examen }]] = await db.query(generalExisteQuery, generalParams);

        const finalSummary = rows.map(r => ({
            typeExamen: r.type_examen,
            stats: {
                totalEleves: parseInt(totalEleves),
                participants: parseInt(r.participants),
                complets: parseInt(r.complets),
                incomplets: parseInt(totalEleves) - parseInt(r.complets),
                // ✅ General → nombre d'élèves ayant au moins un examen complet
                // ✅ Autres → nombre d'élèves ayant au moins une note dans copies
                elevesAvecNote: r.type_examen === 'General'
                    ? parseInt(total_avec_examen)
                    : (notesMap[r.type_examen] || 0),
                moyenne: r.moyenne_globale ? parseFloat(r.moyenne_globale).toFixed(2) : '0.00',
                min: r.moyenne_min ? parseFloat(r.moyenne_min).toFixed(2) : '0.00',
                max: r.moyenne_max ? parseFloat(r.moyenne_max).toFixed(2) : '0.00'
            }
        }));

        res.json(finalSummary);
    } catch (err) {
        console.error('Erreur summary-by-exam-type:', err);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/dashboard/global-summary', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {

const [matieres] = await db.query("SELECT id, coefficient_legacy AS coefficient FROM matieres");
        const [notes] = await db.query("SELECT eleve_id, note FROM copies WHERE note IS NOT NULL AND eleve_id IS NOT NULL");

        const totalCoefficients = matieres.reduce((sum, m) => sum + (m.coefficient || 0), 0);
        let moyennesEleves = [];
        if (totalCoefficients > 0) {
            const notesMap = notes.reduce((acc, n) => {
                if (!acc[n.eleve_id]) acc[n.eleve_id] = 0;
                acc[n.eleve_id] += n.note; 
                return acc;
            }, {});
            moyennesEleves = Object.values(notesMap).map(totalPoints => totalPoints / totalCoefficients);
        }

        const repartitionMentions = { 'Excellent': 0, 'Très Bien': 0, 'Bien': 0, 'Assez Bien': 0, 'Passable': 0, 'Insuffisant': 0 };
        const getMention = (moyenne) => {
            if (moyenne >= 18) return 'Excellent'; if (moyenne >= 16) return 'Très Bien';
            if (moyenne >= 14) return 'Bien'; if (moyenne >= 12) return 'Assez Bien';
            if (moyenne >= 10) return 'Passable'; return 'Insuffisant';
        };
        moyennesEleves.forEach(moyenne => repartitionMentions[getMention(moyenne)]++);

        const [classementMatieres] = await db.query(`
            SELECT m.nom_matiere, AVG(c.note) as moyenne
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL
            GROUP BY m.id, m.nom_matiere
            ORDER BY moyenne ASC
        `);

        res.json({ repartitionMentions, classementMatieres });
    } catch (err) {
        console.error("Erreur sur /api/dashboard/global-summary :", err);
        res.status(500).json({ error: "Erreur lors de la récupération de la synthèse globale." });
    }
});

app.get('/api/dashboard/general-summary', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { promotion, population } = req.query;

        // 1. Récupération des stats globales depuis le cache
        let query = `
            SELECT s.rang, s.moyenne, e.id, e.nom, e.prenom, e.numero_incorporation, e.escadron, e.peloton, e.statut
            FROM statistiques_classement s
            JOIN eleves e ON s.eleve_id = e.id
            WHERE s.type_examen = 'General'
        `;
        const params = [];
        if (promotion && promotion !== 'all') {
            query += " AND s.promotion = ?";
            params.push(promotion);
        }
        if (population && population !== 'all') {
            query += " AND s.population = ?";
            params.push(population);
        }
        query += " ORDER BY CAST(s.rang AS UNSIGNED) ASC";

        const [classement] = await db.query(query, params);

        if (classement.length === 0) {
            return res.json({ stats: { moyennePromotion: 0 }, elevesEnDifficulte: [], statsParEscadron: [] });
        }

        // 2. Calcul des stats à partir du cache (très rapide)
        const moyennePromotion = classement.reduce((sum, e) => sum + parseFloat(e.moyenne), 0) / classement.length;
        const elevesEnDifficulte = classement.filter(e => parseFloat(e.moyenne) < 10);

        // Stats par Escadron
        const escadrons = classement.reduce((acc, e) => {
            const esc = e.escadron || 'Inconnu';
            if (!acc[esc]) acc[esc] = { nom: esc, somme: 0, count: 0 };
            acc[esc].somme += parseFloat(e.moyenne);
            acc[esc].count++;
            return acc;
        }, {});

        const statsParEscadron = Object.values(escadrons)
            .map(esc => ({ nom: esc.nom, moyenne: esc.somme / esc.count }))
            .sort((a, b) => b.moyenne - a.moyenne);

        res.json({
            stats: { moyennePromotion: moyennePromotion.toFixed(2) },
            classement, // On renvoie le classement déjà trié
            elevesEnDifficulte,
            statsParEscadron
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/copies/mes-saisies-directes-recentes', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const utilisateurId = req.user.id;
        const query = `
            SELECT
                c.id AS copie_id,
                c.note,
                c.note_saisie_a AS date_saisie,
                c.details_parcours,
                c.parcours_version,
                e.nom,
                e.prenom,
                e.numero_incorporation,
                m.nom_matiere
            FROM copies c
            JOIN eleves e ON c.eleve_id = e.id
            JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note_saisie_par_utilisateur_id = ?
              AND c.code_anonyme IS NULL 
            ORDER BY c.note_saisie_a DESC
            LIMIT 150;
        `;
        const [rows] = await db.query(query, [utilisateurId]);
        // details_parcours arrive déjà en objet JS si la colonne est de type JSON (mysql2 le parse automatiquement)
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.post('/api/copies/notes-directes-bulk', authenticateToken, checkRole(['admin','operateur_note']), async (req, res) => {
    const { notes } = req.body; 
    const utilisateurId = req.user.id;

    if (!Array.isArray(notes) || notes.length === 0) {
        return res.status(400).json({ message: "Aucune note à enregistrer n'a été fournie." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const valuesToInsert = [];
        const eleveMatierePairs = new Set(); 

        for (const note of notes) {
            if (!note.eleve_id || !note.matiere_id || note.note === undefined || !note.type_examen) {
                throw new Error("Une des saisies est incomplète. Opération annulée.");
            }
            const noteNum = parseFloat(note.note);
            if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
                throw new Error(`Note invalide (${note.note}) pour l'élève ${note.eleve_nom}. Opération annulée.`);
            }

            const key = `${note.eleve_id}-${note.matiere_id}-${note.type_examen}`;
            if (eleveMatierePairs.has(key)) {
                throw new Error(`Saisie en double pour ${note.eleve_nom} (${note.type_examen}). Opération annulée.`);
            }
            eleveMatierePairs.add(key);

            const [absenceCheck] = await connection.query(
                "SELECT id FROM absences WHERE eleve_id = ? AND matiere_id = ?",
                [note.eleve_id, note.matiere_id]
            );
            if (absenceCheck.length > 0) {
                 throw new Error(`L'élève ${note.eleve_nom} est déclaré absent pour cette matière. Opération annulée.`);
            }

            const [noteExistante] = await connection.query(
                    "SELECT id FROM copies WHERE eleve_id = ? AND matiere_id = ? AND type_examen = ? AND note IS NOT NULL",
                    [note.eleve_id, note.matiere_id, note.type_examen]
                );
            if(noteExistante.length > 0) {
                throw new Error(`L'élève ${note.eleve_nom} a déjà une note pour ce type d'examen (${note.type_examen}). Opération annulée.`);
            }

            valuesToInsert.push([
            note.eleve_id,
            note.matiere_id,
            noteNum,
            note.type_examen,
            utilisateurId,
            note.details_parcours ? JSON.stringify(note.details_parcours) : null,
            note.parcours_version || null
        ]);
        }

      if (valuesToInsert.length > 0) {
    const query = `
        INSERT INTO copies (eleve_id, matiere_id, note, type_examen, note_saisie_par_utilisateur_id, details_parcours, parcours_version)
        VALUES ?
        ON DUPLICATE KEY UPDATE
            note = VALUES(note),
            note_saisie_par_utilisateur_id = VALUES(note_saisie_par_utilisateur_id),
            details_parcours = VALUES(details_parcours),
            parcours_version = VALUES(parcours_version)
    `;
    await connection.query(query, [valuesToInsert]);
}

        await connection.commit();
        res.status(201).json({ message: `${valuesToInsert.length} note(s) enregistrée(s) avec succès.` });

    } catch (err) {
        await connection.rollback();
        res.status(409).json({ message: err.message || "Erreur lors de l'enregistrement en masse. Aucune note n'a été enregistrée." });
    } finally {
        connection.release();
    }
});

app.get('/api/copies/:copieId/parcours-details', authenticateToken, checkRole(['admin','operateur_note']), async (req, res) => {
    const { copieId } = req.params;
    const [[copie]] = await db.query(
        "SELECT details_parcours, parcours_version, note FROM copies WHERE id = ?", [copieId]
    );
    if (!copie || !copie.details_parcours) {
        return res.status(404).json({ message: "Aucune donnée de parcours pour cette copie." });
    }
    res.json(copie);
});

// APRÈS
app.get('/api/configuration/examens', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { promotion } = req.query;
        
        let query = "SELECT id, nom_modele, coefficient_general, date_debut, date_fin, promotion FROM modeles_examens WHERE 1=1";
        const params = [];
        
        if (promotion && promotion !== 'all') {
            query += " AND promotion = ?";
            params.push(promotion);
        }
        query += " ORDER BY nom_modele";
        
        const [modeles] = await db.query(query, params);
        const [configs] = await db.query("SELECT modele_examen_id, matiere_id, coefficient FROM examens_configurations");
        
        const configuration = modeles.map(modele => ({
            ...modele,
            configurations: configs.filter(c => c.modele_examen_id === modele.id)
        }));
        res.json(configuration);
    } catch (err) {
        res.status(500).json({ message: "Erreur lors de la récupération de la configuration." });
    }
});

app.put('/api/configuration/examens', authenticateToken, checkRole(['admin']), async (req, res) => {
    const fullConfiguration = req.body;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        for (const modele of fullConfiguration) {
            await connection.query(
                "UPDATE modeles_examens SET coefficient_general = ?, date_debut = ?, date_fin = ? WHERE id = ?",
                [modele.coefficient_general, modele.date_debut || null, modele.date_fin || null, modele.id]
            );

            await connection.query(
                "DELETE FROM examens_configurations WHERE modele_examen_id = ?",
                [modele.id]
            );

            if (modele.configurations && modele.configurations.length > 0) {
                const valuesToInsert = modele.configurations.map(config => [
                    modele.id, config.matiere_id, config.coefficient
                ]);
                await connection.query(
                    `INSERT INTO examens_configurations (modele_examen_id, matiere_id, coefficient) VALUES ?`,
                    [valuesToInsert]
                );
            }
        }
        await connection.commit();
        res.json({ message: "Configuration des examens mise à jour avec succès." });
    } catch (err) {
        await connection.rollback();
        console.error("Erreur sur PUT /api/configuration/examens", err);
        res.status(500).json({ message: "Erreur lors de la sauvegarde de la configuration." });
    } finally {
        connection.release();
    }
});

app.get('/api/dashboard/exam-subject-stats/:typeExamen', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { typeExamen } = req.params;
        const { promotion } = req.query; // AJOUT

        let query = `
            SELECT
                m.nom_matiere,
                AVG(c.note) as moyenne
            FROM copies c
            JOIN matieres m ON c.matiere_id = m.id
            JOIN eleves e ON c.eleve_id = e.id
            WHERE c.type_examen = ? AND c.note IS NOT NULL
        `;
        
        const params = [typeExamen];

        // AJOUT filtre promotion
        if (promotion && promotion !== 'all') {
            query += ' AND e.promotion = ?';
            params.push(promotion);
        }

        query += ' GROUP BY m.id, m.nom_matiere ORDER BY moyenne ASC';

        const [stats] = await db.query(query, params);
        res.json(stats);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/dashboard-details/general/matieres-reussite', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [matieres] = await db.query(`
            SELECT m.nom_matiere, AVG(c.note) as moyenne
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL GROUP BY m.id HAVING moyenne >= 12
            ORDER BY moyenne DESC
        `);
        res.json(matieres);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard-details/general/matieres-echec', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [matieres] = await db.query(`
            SELECT m.nom_matiere, AVG(c.note) as moyenne
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL GROUP BY m.id HAVING moyenne < 12
            ORDER BY moyenne ASC
        `);
        res.json(matieres);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard-details/examen/:typeExamen/matieres-reussite', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { typeExamen } = req.params;
        const [matieres] = await db.query(`
            SELECT m.nom_matiere, AVG(c.note) as moyenne
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL AND c.type_examen = ? GROUP BY m.id HAVING moyenne >= 12
            ORDER BY moyenne DESC
        `, [typeExamen]);
        res.json(matieres);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard-details/examen/:typeExamen/matieres-echec', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { typeExamen } = req.params;
        const [matieres] = await db.query(`
            SELECT m.nom_matiere, AVG(c.note) as moyenne
            FROM copies c JOIN matieres m ON c.matiere_id = m.id
            WHERE c.note IS NOT NULL AND c.type_examen = ? GROUP BY m.id HAVING moyenne < 12
            ORDER BY moyenne ASC
        `, [typeExamen]);
        res.json(matieres);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/dashboard-details/general/eleves-par-mention/:mention', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { mention } = req.params;
        const [matieres] = await db.query("SELECT id, coefficient_legacy AS coefficient FROM matieres");
        const [notes] = await db.query("SELECT eleve_id, note FROM copies WHERE note IS NOT NULL AND eleve_id IS NOT NULL");
        const [eleves] = await db.query("SELECT id, nom, prenom, numero_incorporation FROM eleves");
        const totalCoefficients = matieres.reduce((sum, m) => sum + (parseFloat(m.coefficient) || 0), 0);
        if (totalCoefficients === 0) return res.json([]);

        const notesMap = new Map();
        notes.forEach(n => {
            if (!notesMap.has(n.eleve_id)) notesMap.set(n.eleve_id, []);
            notesMap.get(n.eleve_id).push(n);
        });

        const getMention = (moyenne) => {
            if (moyenne === null) return 'Non classé';
            if (moyenne >= 18) return 'Excellent'; if (moyenne >= 16) return 'Très Bien';
            if (moyenne >= 14) return 'Bien'; if (moyenne >= 12) return 'Assez Bien';
            if (moyenne >= 10) return 'Passable'; return 'Insuffisant';
        };

        const elevesFiltres = eleves.map(eleve => {
            const notesDeEleve = notesMap.get(eleve.id) || [];
            if (notesDeEleve.length === 0) return null;
            let totalPoints = 0;
            notesDeEleve.forEach(noteInfo => {
                const matiere = matieres.find(m => m.id === noteInfo.matiere_id);
                if(matiere) totalPoints += noteInfo.note * (matiere.coefficient || 0);
            });
            const moyenne = totalPoints / totalCoefficients;
            const mentionCalculee = getMention(moyenne);

            if (mentionCalculee.replace(' ', '_') === mention.replace(' ', '_')) {
                return { nom: `${eleve.prenom} ${eleve.nom}`, numero_incorporation: eleve.numero_incorporation, moyenne: moyenne.toFixed(2) };
            }
            return null;
        }).filter(Boolean);

        res.json(elevesFiltres);

    } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/examens', authenticateToken, checkRole(['admin', 'operateur_note', 'operateur_code']), async (req, res) => {
    try {
        const { promotion } = req.query;
        let query = "SELECT id, nom_modele, promotion FROM modeles_examens WHERE 1=1";
        const params = [];
        if (promotion && promotion !== 'all') {
            query += " AND promotion = ?";
            params.push(promotion);
        }
        query += " ORDER BY nom_modele";
        const [examens] = await db.query(query, params);
        res.json(examens);
    } catch (err) {
        res.status(500).json({ message: "Erreur lors de la récupération des types d'examen." });
    }
});
app.post('/api/codes/generer', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { matiereId, nombreCodes } = req.body;

    if (!matiereId || !nombreCodes || nombreCodes <= 0) {
        return res.status(400).json({ message: "ID de matière et nombre de codes valide sont requis." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const [[matiere]] = await connection.query("SELECT code_prefixe FROM matieres WHERE id = ?", [matiereId]);
        if (!matiere || !matiere.code_prefixe) {
            await connection.rollback();
            return res.status(404).json({ message: "Matière non trouvée ou sans préfixe défini." });
        }
        const { code_prefixe } = matiere;

        const [[{ last_code_num }]] = await connection.query(
            `SELECT MAX(CAST(SUBSTRING(code, LENGTH(?) + 1) AS UNSIGNED)) as last_code_num
             FROM codes_anonymes_disponibles
             WHERE code LIKE ?`,
            [code_prefixe, `${code_prefixe}%`]
        );

        const codesAInserer = [];
        const STEP = 2; 
        let currentNum = (last_code_num || 0) + STEP;

        for (let i = 0; i < nombreCodes; i++) {
            const numeroFormatte = String(currentNum).padStart(5, '0');
            const nouveauCode = `${code_prefixe}${numeroFormatte}`;
            codesAInserer.push([nouveauCode]);
            currentNum += STEP;
        }

        if (codesAInserer.length > 0) {
            await connection.query("INSERT INTO codes_anonymes_disponibles (code) VALUES ?", [codesAInserer]);
        }

        await connection.commit();

        res.status(201).json({
            message: `${codesAInserer.length} code(s) ont été générés et ajoutés avec succès.`,
            codes: codesAInserer.map(c => c[0])
        });

    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
             return res.status(409).json({ message: "Erreur de duplication. Un des codes générés existe déjà. Veuillez réessayer." });
        }
        console.error("Erreur sur POST /api/codes/generer", err);
        res.status(500).json({ message: "Erreur interne du serveur lors de la génération des codes." });
    } finally {
        connection.release();
    }
});

app.post('/api/codes/previsualiser', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { matiereId, nombreCodes } = req.body;
    if (!matiereId || !nombreCodes || nombreCodes <= 0) {
        return res.status(400).json({ message: "ID de matière et nombre de codes valide sont requis." });
    }

    try {
        const [[matiere]] = await db.query("SELECT code_prefixe FROM matieres WHERE id = ?", [matiereId]);
        if (!matiere || !matiere.code_prefixe) {
            return res.status(404).json({ message: "Matière non trouvée ou sans préfixe défini." });
        }
        const { code_prefixe } = matiere;

        const [[{ last_code_num }]] = await db.query(
            `SELECT MAX(CAST(SUBSTRING(code, LENGTH(?) + 1) AS UNSIGNED)) as last_code_num
             FROM codes_anonymes_disponibles
             WHERE code LIKE ?`,
            [code_prefixe, `${code_prefixe}%`]
        );

        const codesGeneres = [];
        const MIN_JUMP = 5;
        const MAX_JUMP = 25; 
        let currentNum = last_code_num || 0;

        for (let i = 0; i < nombreCodes; i++) {
            const jump = Math.floor(Math.random() * (MAX_JUMP - MIN_JUMP + 1)) + MIN_JUMP;
            currentNum += jump;
            const numeroFormatte = String(currentNum).padStart(5, '0');
            codesGeneres.push(`${code_prefixe}${numeroFormatte}`);
        }

        res.json({ codes: codesGeneres });

    } catch (err) {
        console.error("Erreur sur POST /api/codes/previsualiser", err);
        res.status(500).json({ message: "Erreur interne du serveur lors de la prévisualisation." });
    }
});


app.delete('/api/codes/lot/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        const [[lot]] = await connection.query("SELECT codes_json FROM lots_codes_generes WHERE id = ? FOR UPDATE", [id]);
        if (!lot) {
            await connection.rollback();
            return res.status(404).json({ message: "Lot non trouvé." });
        }
        const codesASupprimer = JSON.parse(lot.codes_json);

        if (codesASupprimer.length > 0) {
            await connection.query("DELETE FROM codes_anonymes_disponibles WHERE code IN (?)", [codesASupprimer]);
        }

        await connection.query("DELETE FROM lots_codes_generes WHERE id = ?", [id]);

        await connection.commit();
        res.status(200).json({ message: "Le lot et tous les codes associés ont été supprimés avec succès." });

    } catch (err) {
        await connection.rollback();
        console.error("Erreur sur DELETE /api/codes/lot/:id", err);
        res.status(500).json({ message: "Erreur interne lors de la suppression du lot." });
    } finally {
        connection.release();
    }
});

app.post('/api/codes/sauvegarder', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { matiereId, typeExamen, codes, promotion, population } = req.body; // Ajout population
    const utilisateurId = req.user.id;

    if (!matiereId || !typeExamen || !promotion || !Array.isArray(codes) || codes.length === 0) {
        return res.status(400).json({ message: "Données invalides pour la sauvegarde." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[matiere]] = await connection.query("SELECT nom_matiere FROM matieres WHERE id = ?", [matiereId]);

        // Insertion des codes individuels
        // On ajoute 'population' dans le mapping et dans la requête SQL
const codesAInserer = codes.map(code => [code, promotion, population || 'all']);
await connection.query("INSERT INTO codes_anonymes_disponibles (code, promotion, population) VALUES ?", [codesAInserer]);

        // Insertion du lot avec la population (8 colonnes / 8 ?)
        const queryLot = `
            INSERT INTO lots_codes_generes 
            (matiere_id, nom_matiere, type_examen, promotion, population, nombre_codes, codes_json, genere_par_utilisateur_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        await connection.query(queryLot, [
            matiereId, matiere.nom_matiere, typeExamen, promotion, 
            population || 'all', codes.length, JSON.stringify(codes), utilisateurId
        ]);

        await connection.commit();
        res.status(201).json({ message: "Lot de codes enregistré avec succès." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ message: "Erreur lors de la sauvegarde." });
    } finally {
        connection.release();
    }
});

app.get('/api/codes/lots', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const [lots] = await db.query(
            "SELECT id, nom_matiere, type_examen, promotion, population, nombre_codes, date_generation FROM lots_codes_generes ORDER BY date_generation DESC"
        ); // Ajout de 'population' dans le SELECT
        res.json(lots);
    } catch (err) {
        res.status(500).json({ message: "Erreur serveur." });
    }
});

app.get('/api/codes/lot/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const [[lot]] = await db.query("SELECT codes_json FROM lots_codes_generes WHERE id = ?", [id]);
        if (!lot) {
            return res.status(404).json({ message: "Lot non trouvé." });
        }
        res.json({ codes: JSON.parse(lot.codes_json) });
    } catch (err) {
        console.error("Erreur sur GET /api/codes/lot/:id", err);
        res.status(500).json({ message: "Erreur lors de la récupération du lot." });
    }
});

app.post('/api/notes/importer-previsualisation', authenticateToken, checkRole(['admin','operateur_note']), upload.single('fichierNotes'), async (req, res) => {
    const { matiere_id, escadron, peloton, type_examen } = req.body;

    if (!req.file) return res.status(400).json({ message: "Aucun fichier fourni." });
    if (!matiere_id || !escadron || !type_examen) return res.status(400).json({ message: "Matière, type d'examen et escadron sont requis." });

    try {
        const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        const donneesValides = [];
        const erreurs = [];

        const [allElevesDb] = await db.query("SELECT id, nom, prenom, numero_incorporation, escadron, peloton FROM eleves");

        const allElevesMap = new Map(allElevesDb.map(e => [e.numero_incorporation.toString().trim(), e]));

        for (let i = 1; i < data.length; i++) {
            const row = data[i];
            if (!row || row.length < 3 || (!row[1] && !row[2])) continue; 

            const nom_prenom_fichier = row[0] ? row[0].toString().trim() : '';
            const numero_incorporation = row[1] ? row[1].toString().trim() : '';
            const noteRaw = row[2];

            if (!numero_incorporation) {
                erreurs.push({ ligne: i + 1, nom_prenom: nom_prenom_fichier, message: "Numéro d'incorporation manquant." });
                continue;
            }

            const eleveTrouve = allElevesMap.get(numero_incorporation);

            if (!eleveTrouve) {
                erreurs.push({ ligne: i + 1, nom_prenom: nom_prenom_fichier, numero_incorporation, message: "Ce N° d'incorporation n'existe pas dans la base de données." });
                continue;
            }

            const escadronSelectionne = escadron.toString();
            const escadronEleve = eleveTrouve.escadron ? eleveTrouve.escadron.toString() : '';
            const pelotonSelectionne = peloton.toString();
            const pelotonEleve = eleveTrouve.peloton ? eleveTrouve.peloton.toString() : '';

            const escadronMatch = escadronSelectionne === escadronEleve;
            const pelotonMatch = pelotonSelectionne === 'all' || pelotonSelectionne === pelotonEleve;

            if (!escadronMatch || !pelotonMatch) {
                erreurs.push({
                    ligne: i + 1,
                    nom_prenom: nom_prenom_fichier,
                    numero_incorporation,
                    message: `Élève trouvé, mais pas dans le bon groupe (Escadron: ${escadronEleve}, Peloton: ${pelotonEleve}).`
                });
                continue;
            }

            const note = parseFloat(String(noteRaw).replace(',', '.'));
            if (isNaN(note) || note < 0 || note > 20) {
                erreurs.push({ ligne: i + 1, nom_prenom: `${eleveTrouve.nom} ${eleveTrouve.prenom}`, numero_incorporation, message: `Note invalide : "${noteRaw}".` });
                continue;
            }

            donneesValides.push({
                ligne: i + 1,
                eleve_id: eleveTrouve.id,
                nom_prenom: `${eleveTrouve.nom} ${eleveTrouve.prenom}`, 
                numero_incorporation: eleveTrouve.numero_incorporation,
                note: note
            });
        }

        res.json({ donneesValides, erreurs });

    } catch (err) {
        console.error("Erreur sur /api/notes/importer-previsualisation :", err);
        res.status(500).json({ message: "Erreur interne lors du traitement du fichier." });
    }
});

app.post('/api/notes/enregistrer-importation', authenticateToken, checkRole(['admin','operateur_note']), async (req, res) => {
    const { notes, matiere_id, type_examen } = req.body;
    const utilisateurId = req.user.id;

    if (!Array.isArray(notes) || notes.length === 0 || !matiere_id || !type_examen) {
        return res.status(400).json({ message: "Données invalides ou manquantes." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        const valuesToInsert = notes.map(item => [
            item.eleve_id,
            matiere_id,
            item.note,
            type_examen,
            utilisateurId
        ]);

        const query = `
            INSERT INTO copies (eleve_id, matiere_id, note, type_examen, note_saisie_par_utilisateur_id)
            VALUES ? AS new_values
            ON DUPLICATE KEY UPDATE
                note = new_values.note,
                note_saisie_par_utilisateur_id = new_values.note_saisie_par_utilisateur_id;
        `;

        const [result] = await connection.query(query, [valuesToInsert]);
        await connection.commit();

        await logActivity(utilisateurId, req.user.nom_utilisateur, 'IMPORT_NOTES', `A importé/mis à jour ${result.affectedRows} notes pour la matière ID ${matiere_id}.`);
        res.status(201).json({ message: `${result.affectedRows} notes ont été enregistrées avec succès.` });

    } catch (err) {
        await connection.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ message: "Conflit de duplication détecté. Vérifiez vos données." });
        }
        console.error("Erreur sur /api/notes/enregistrer-importation", err);
        res.status(500).json({ message: "Erreur interne lors de l'enregistrement." });
    } finally {
        connection.release();
    }
});

app.get('/api/escadrons', authenticateToken, checkRole(['admin','operateur_note']), async (req, res) => {
    try {
        const [escadrons] = await db.query(
            "SELECT DISTINCT escadron FROM eleves WHERE escadron IS NOT NULL ORDER BY escadron ASC"
        );
        res.json(escadrons.map(e => e.escadron));
    } catch (err) {
        console.error("Erreur sur GET /api/escadrons", err);
        res.status(500).json({ message: "Erreur lors de la récupération des escadrons." });
    }
});

app.get('/api/pelotons/:escadron', authenticateToken, checkRole(['admin','operateur_note']), async (req, res) => {
    const { escadron } = req.params;
    try {
        const [pelotons] = await db.query(
            "SELECT DISTINCT peloton FROM eleves WHERE escadron = ? AND peloton IS NOT NULL ORDER BY peloton ASC",
            [escadron]
        );
        res.json(pelotons.map(p => p.peloton));
    } catch (err) {
        console.error("Erreur sur GET /api/pelotons/:escadron", err);
        res.status(500).json({ message: "Erreur lors de la récupération des pelotons." });
    }
});

// APRÈS — ajouter promotion dans le body
app.post('/api/configuration/examens', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { nom_modele, promotion } = req.body;

    if (!nom_modele || nom_modele.trim() === '') {
        return res.status(400).json({ message: "Le nom du modèle est requis." });
    }
    if (!promotion || promotion.trim() === '') {
        return res.status(400).json({ message: "La promotion est requise." });
    }

    try {
        const query = "INSERT INTO modeles_examens (nom_modele, coefficient_general, promotion) VALUES (?, ?, ?)";
        const [result] = await db.query(query, [nom_modele.trim(), 1, promotion.trim()]);
        const nouvelId = result.insertId;
        const [[nouveauModele]] = await db.query("SELECT * FROM modeles_examens WHERE id = ?", [nouvelId]);
        res.status(201).json({ ...nouveauModele, configurations: [] });
    } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ 
                //  Message précis avec la promotion
                message: `Un modèle "${nom_modele.trim()}" existe déjà pour la promotion ${promotion.trim()}.` 
            });
        }
        res.status(500).json({ message: "Erreur lors de la création du modèle." });
    }
});

app.delete('/api/configuration/examens/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const connection = await db.getConnection();

    try {
        await connection.beginTransaction();

        await connection.query("DELETE FROM examens_configurations WHERE modele_examen_id = ?", [id]);

        const [result] = await connection.query("DELETE FROM modeles_examens WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            await connection.rollback();
            return res.status(404).json({ message: "Modèle non trouvé." });
        }

        await connection.commit();
        res.status(200).json({ message: "Le modèle d'examen a été supprimé avec succès." });

    } catch (err) {
        await connection.rollback();
        console.error(`Erreur sur DELETE /api/configuration/examens/${id}`, err);
        res.status(500).json({ message: "Erreur lors de la suppression du modèle." });
    } finally {
        connection.release();
    }
});

app.get('/api/matieres-par-examen', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    const { typeExamen, promotion } = req.query;

    if (!typeExamen) {
        return res.status(400).json({ message: "Le paramètre typeExamen est requis." });
    }

    try {
        let query = `
            SELECT m.id, m.nom_matiere
            FROM matieres m
            JOIN examens_configurations ec ON m.id = ec.matiere_id
            JOIN modeles_examens me ON ec.modele_examen_id = me.id
            WHERE me.nom_modele = ?
        `;
        const params = [typeExamen];

        // ✅ Filtrer par promotion si fournie
        if (promotion && promotion !== 'all') {
            query += " AND me.promotion = ?";
            params.push(promotion);
        }

        query += " ORDER BY m.nom_matiere";

        const [matieres] = await db.query(query, params);
        res.json(matieres);
    } catch (err) {
        console.error("Erreur sur GET /api/matieres-par-examen", err);
        res.status(500).json({ message: "Erreur lors de la récupération des matières pour cet examen." });
    }
});
app.get('/api/stats/notes-utilisateur-specifique', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { matiereId, typeExamen } = req.query;
        const utilisateurId = req.user.id;

        if (!matiereId || !typeExamen) {
            return res.status(400).json({ message: "L'ID de la matière et le type d'examen sont requis." });
        }

        const query = `
            SELECT COUNT(*) as notesSaisies
            FROM copies
            WHERE note_saisie_par_utilisateur_id = ?
              AND matiere_id = ?
              AND type_examen = ?
        `;

        const [[result]] = await db.query(query, [utilisateurId, matiereId, typeExamen]);
        res.json(result);

    } catch (err) {
        console.error("Erreur sur /api/stats/notes-utilisateur-specifique", err);
        res.status(500).json({ error: "Erreur lors du calcul des statistiques utilisateur spécifiques." });
    }
});

app.post('/api/decisions-conseil', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { eleve_id, type_decision, motif } = req.body;

    if (!eleve_id || !type_decision) {
        return res.status(400).json({ message: "L'élève et le type de décision sont requis." });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Enregistrer la décision dans l'historique du conseil
        await connection.query(
            "INSERT INTO decisions_conseil (eleve_id, type_decision, motif) VALUES (?, ?, ?)",
            [eleve_id, type_decision, motif && motif !== "" ? motif : null]
        );

        // 2. Déterminer le nouveau statut de l'élève
        let nouveauStatut = 'actif';
        if (type_decision === 'redoublement') nouveauStatut = 'redoublant';
        else if (type_decision === 'ajournement_3m') nouveauStatut = 'ajourne_3m';
        else if (type_decision === 'ajournement_6m') nouveauStatut = 'ajourne_6m';
        else if (type_decision === 'radiation') nouveauStatut = 'radie';

        // 3. Mettre à jour la fiche de l'élève
        // Note : On pourrait aussi vider 'promotion_actuelle' pour les radiés
        await connection.query(
            "UPDATE eleves SET statut = ? WHERE id = ?",
            [nouveauStatut, eleve_id]
        );

        await connection.commit();
        res.status(201).json({ message: "Décision enregistrée et statut élève mis à jour." });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ error: "Erreur lors de l'enregistrement." });
    } finally {
        connection.release();
    }
});

// 2. Route pour MODIFIER une décision
app.put('/api/decisions-conseil/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { type_decision, motif } = req.body;
    
    try {
        await db.query(
            "UPDATE decisions_conseil SET type_decision = ?, motif = ? WHERE id = ?",
            [type_decision, motif && motif !== "" ? motif : null, id] // Gère le "Non renseigné"
        );
        res.json({ message: "Décision mise à jour avec succès" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/decisions-conseil', authenticateToken, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                d.id, 
                d.eleve_id, 
                d.type_decision, 
                d.motif, 
                d.date_decision,
                e.nom, 
                e.prenom, 
                e.numero_incorporation, 
                e.promotion, 
                e.escadron, 
                e.peloton
            FROM decisions_conseil d
            JOIN eleves e ON d.eleve_id = e.id
            ORDER BY d.date_decision DESC
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Ajoute aussi cette route pour la mise à jour (Action modifier)
app.put('/api/decisions-conseil/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { type_decision, motif } = req.body;
    try {
        await db.query(
            "UPDATE decisions_conseil SET type_decision = ?, motif = ? WHERE id = ?",
            [type_decision, motif, id]
        );
        res.json({ message: "Décision mise à jour avec succès" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/decisions-conseil/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        await db.query("DELETE FROM decisions_conseil WHERE id = ?", [req.params.id]);
        res.json({ message: "Décision supprimée" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.put('/api/decisions-conseil/:id', authenticateToken, checkRole(['admin']), async (req, res) => {
    const { id } = req.params;
    const { type_decision, motif } = req.body;
    try {
        await db.query(
            "UPDATE decisions_conseil SET type_decision = ?, motif = ? WHERE id = ?",
            [type_decision, motif, id]
        );
        res.json({ message: "Décision mise à jour" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


app.get('/api/dashboard/evolution-conseil', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { promotion } = req.query;
        const [elevesConseil] = await db.query(
            "SELECT id, nom, prenom, numero_incorporation, promotion, statut FROM eleves WHERE statut IN ('redoublant', 'ajourne_3m', 'ajourne_6m') AND promotion = ?",
            [promotion]
        );

        const evolutionData = [];
        for (const eleve of elevesConseil) {
            const [stats] = await db.query(
                "SELECT type_examen, moyenne FROM statistiques_classement WHERE eleve_id = ? AND type_examen IN ('General', 'REPECHAGE')",
                [eleve.id]
            );

            const moyInitiale = stats.find(s => s.type_examen === 'General')?.moyenne || 0;
            const moyRepechage = stats.find(s => s.type_examen === 'REPECHAGE')?.moyenne || 0;

            const [detailsNotes] = await db.query(`
                SELECT m.nom_matiere, c_rep.note as note_repechage,
                (SELECT c_init.note FROM copies c_init WHERE c_init.eleve_id = c_rep.eleve_id AND c_init.matiere_id = c_rep.matiere_id AND c_init.type_examen != 'REPECHAGE' LIMIT 1) as note_initiale
                FROM copies c_rep JOIN matieres m ON c_rep.matiere_id = m.id
                WHERE c_rep.eleve_id = ? AND c_rep.type_examen = 'REPECHAGE'
            `, [eleve.id]);

            evolutionData.push({
                id: eleve.id,
                nom: eleve.nom,
                prenom: eleve.prenom,
                numero_incorporation: eleve.numero_incorporation, // CHANGÉ : 'incorp' devient 'numero_incorporation'
 statut: eleve.statut, 
     
           moyenneInitiale: parseFloat(moyInitiale).toFixed(2),
                moyenneRepechage: parseFloat(moyRepechage).toFixed(2),
                progression: (parseFloat(moyRepechage) - parseFloat(moyInitiale)).toFixed(2),
                matieres: detailsNotes.map(n => ({
                    nom: n.nom_matiere,
                    initiale: n.note_initiale ? parseFloat(n.note_initiale).toFixed(2) : "N/A",
                    repechage: parseFloat(n.note_repechage).toFixed(2),
                    diff: n.note_initiale ? (parseFloat(n.note_repechage) - parseFloat(n.note_initiale)).toFixed(2) : "N/A"
                }))
            });
        }
        evolutionData.sort((a, b) => b.progression - a.progression);
        res.json(evolutionData);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Route pour déclencher le calcul global et remplir la table de cache

app.post('/api/resultats/generer-statistiques', authenticateToken, checkRole(['admin']), async (req, res) => {
    const connection = await db.getConnection();
    req.setTimeout(600000);
    try {
        await connection.beginTransaction();

        // ── Données globales ──────────────────────────────────────────────────
        const [promotions]     = await connection.query("SELECT DISTINCT promotion FROM eleves WHERE promotion IS NOT NULL");
        const [tousLesEleves]  = await connection.query("SELECT id, promotion, statut FROM eleves");
        const [notes]          = await connection.query("SELECT eleve_id, matiere_id, note, type_examen FROM copies WHERE note IS NOT NULL");
        const [tousLesConfigs] = await connection.query("SELECT modele_examen_id, matiere_id, coefficient FROM examens_configurations");

        // Index notes : notesIndex[eleve_id][type_examen][matiere_id] = note
        const notesIndex = {};
        notes.forEach(n => {
            const eId = n.eleve_id;
            const tEx = String(n.type_examen).trim();
            const mId = n.matiere_id;
            if (!notesIndex[eId])        notesIndex[eId] = {};
            if (!notesIndex[eId][tEx])   notesIndex[eId][tEx] = {};
            notesIndex[eId][tEx][mId] = parseFloat(n.note);
        });

        const getPopulation = (statut) =>
            ['redoublant', 'ajourne_3m', 'ajourne_6m'].includes(statut) ? 'conseil' : 'actif';

        // ── PROMOTION SPÉCIALE : 79E ──────────────────────────────────────────
        // Calcule la moyenne avec les notes DISPONIBLES (même incomplètes).
        // Un élève est classé dès qu'il a au moins une note.
        // Seule la 79E est en mode souple — toutes les autres sont strictes,
        // quelle que soit leur valeur (80E, 81E, 82E...).
        const PROMO_SOUPLE = '79E';
        const estPromoSouple = (promo) => promo === PROMO_SOUPLE;

        const calculerMoyenneSouple = (notesDeLEleve, configsModele) => {
            // On ne prend que les matières qui ont une note
            let pts  = 0;
            let coef = 0;
            configsModele.forEach(c => {
                const note = notesDeLEleve[c.matiere_id];
                if (note !== undefined) {
                    pts  += note * parseFloat(c.coefficient);
                    coef += parseFloat(c.coefficient);
                }
            });
            return coef > 0 ? pts / coef : null;
        };

        const calculerMoyenneGeneraleSouple = (notesDeLEleve, modelesHorsRepechage, configsParModele) => {
            // Moyenne pondérée des moyennes par examen (avec notes disponibles)
            let totalPts  = 0;
            let totalCoef = 0;
            modelesHorsRepechage.forEach(m => {
                const configsM    = configsParModele[m.id] || [];
                const coeffGlobal = parseFloat(m.coefficient_general);
                if (coeffGlobal <= 0 || configsM.length === 0) return;

                const moy = calculerMoyenneSouple(notesDeLEleve[String(m.nom_modele).trim()] || {}, configsM);
                if (moy !== null) {
                    totalPts  += moy * coeffGlobal;
                    totalCoef += coeffGlobal;
                }
            });
            return totalCoef > 0 ? totalPts / totalCoef : null;
        };

        // ── LOGIQUE STRICTE (autres promotions) ───────────────────────────────
        // Toutes les notes d'un examen doivent être présentes pour être classé.

        const calculerMoyenneStricte = (notesDeLExamen, configsModele) => {
            let pts  = 0;
            let coef = 0;
            for (const c of configsModele) {
                const note = notesDeLExamen[c.matiere_id];
                if (note === undefined) return null; // manque une note → non classé
                pts  += note * parseFloat(c.coefficient);
                coef += parseFloat(c.coefficient);
            }
            return coef > 0 ? pts / coef : null;
        };

        const calculerMoyenneGeneraleStricte = (notesDeLEleve, modelesHorsRepechage, configsParModele) => {
            let totalPts  = 0;
            let totalCoef = 0;
            let tousComplets = true;
            const examensComplets = [];

            for (const m of modelesHorsRepechage) {
                const configsM    = configsParModele[m.id] || [];
                const coeffGlobal = parseFloat(m.coefficient_general);
                if (configsM.length === 0) continue;

                const notesDeLExamen = notesDeLEleve[String(m.nom_modele).trim()] || {};
                const moy = calculerMoyenneStricte(notesDeLExamen, configsM);

                if (moy === null) {
                    tousComplets = false;
                } else {
                    examensComplets.push(String(m.nom_modele).trim());
                    if (coeffGlobal > 0) {
                        totalPts  += moy * coeffGlobal;
                        totalCoef += coeffGlobal;
                    }
                }
            }

            if (totalCoef > 0 && tousComplets) {
                return { moyenne: totalPts / totalCoef, motif: null };
            }
            return {
                moyenne: null,
                motif: examensComplets.length > 0
                    ? `Incomplet — Complétés : ${examensComplets.join(', ')}`
                    : 'Aucun examen complété'
            };
        };

        // ── Boucle principale par promotion ───────────────────────────────────
        let statsToInsert = [];

        for (const promoRow of promotions) {
            const promo = promoRow.promotion;

            // Modèles de cette promotion
            const [modelesPromo] = await connection.query(
                "SELECT id, nom_modele, coefficient_general FROM modeles_examens WHERE promotion = ?",
                [promo]
            );
            if (modelesPromo.length === 0) continue;

            const modelesHorsRepechage = modelesPromo.filter(
                m => !m.nom_modele.toUpperCase().includes('REPECHAGE')
            );

            // Index configs par modele_id (évite de refiltrer dans chaque élève)
            const configsParModele = {};
            modelesPromo.forEach(m => {
                configsParModele[m.id] = tousLesConfigs.filter(c => c.modele_examen_id === m.id);
            });

            const elevesDePromo = tousLesEleves.filter(e => e.promotion === promo);
            const isSouple      = estPromoSouple(promo); // ← souple uniquement pour 79E

            const tousLesModeles = [
                ...modelesPromo,
                { id: 0, nom_modele: 'General', coefficient_general: 0 }
            ];

            for (const modele of tousLesModeles) {
                const isGeneral = modele.nom_modele === 'General';

                const moyennesEleves = elevesDePromo.map(eleve => {
                    const notesDeLEleve = notesIndex[eleve.id] || {};
                    let moyenneFinale   = null;
                    let motifNonClasse  = null;

                    if (isGeneral) {
                        if (isSouple) {
                            // ── 79E : moyenne générale souple ──
                            moyenneFinale = calculerMoyenneGeneraleSouple(
                                notesDeLEleve, modelesHorsRepechage, configsParModele
                            );
                            if (moyenneFinale === null) motifNonClasse = 'Aucune note disponible';
                        } else {
                            // ── Autres promos : stricte ──
                            const res = calculerMoyenneGeneraleStricte(
                                notesDeLEleve, modelesHorsRepechage, configsParModele
                            );
                            moyenneFinale  = res.moyenne;
                            motifNonClasse = res.motif;
                        }
                    } else {
                        const nomExamen      = String(modele.nom_modele).trim();
                        const notesDeLExamen = notesDeLEleve[nomExamen] || {};
                        const configsM       = configsParModele[modele.id] || [];

                        if (isSouple) {
                            // ── 79E : moyenne d'examen souple ──
                            moyenneFinale = calculerMoyenneSouple(notesDeLExamen, configsM);
                            if (moyenneFinale === null) {
                                motifNonClasse = configsM.length === 0
                                    ? 'Aucune matière configurée'
                                    : 'Aucune note disponible';
                            }
                        } else {
                            // ── Autres promos : stricte ──
                            moyenneFinale = calculerMoyenneStricte(notesDeLExamen, configsM);
                            if (moyenneFinale === null) {
                                const nb = configsM.filter(c => notesDeLExamen[c.matiere_id] !== undefined).length;
                                motifNonClasse = configsM.length === 0
                                    ? 'Aucune matière configurée'
                                    : `Notes incomplètes (${nb}/${configsM.length} matières)`;
                            }
                        }
                    }

                    return {
                        id:           eleve.id,
                        promotion:    promo,
                        population:   getPopulation(eleve.statut),
                        moyenne:      moyenneFinale,
                        motifNonClasse
                    };
                });

                // ── Calcul des rangs par population ───────────────────────────
                for (const pop of ['actif', 'conseil']) {
                    const classes    = moyennesEleves.filter(e => e.population === pop && e.moyenne !== null);
                    const nonClasses = moyennesEleves.filter(e => e.population === pop && e.moyenne === null);

                    classes.sort((a, b) => b.moyenne - a.moyenne);

                    let rang = 0; let lastMoy = -1; let countAtRank = 1;
                    classes.forEach((eleve, index) => {
                        const moyArrondie = parseFloat(eleve.moyenne.toFixed(2));
                        if (moyArrondie !== lastMoy) { rang += countAtRank; countAtRank = 1; }
                        else { countAtRank++; }
                        lastMoy = moyArrondie;

                        const isEx =
                            (classes[index + 1] && parseFloat(classes[index + 1].moyenne.toFixed(2)) === moyArrondie) ||
                            (classes[index - 1] && parseFloat(classes[index - 1].moyenne.toFixed(2)) === moyArrondie);

                        statsToInsert.push([
                            eleve.id, promo, pop, modele.nom_modele,
                            eleve.moyenne.toFixed(2), isEx ? `${rang} ex` : `${rang}`, null
                        ]);
                    });

                    nonClasses.forEach(eleve => {
                        statsToInsert.push([
                            eleve.id, promo, pop, modele.nom_modele,
                            null, null, eleve.motifNonClasse
                        ]);
                    });
                }
            }
        }

        // ── Écriture en base ──────────────────────────────────────────────────
        if (statsToInsert.length > 0) {
            await connection.query("DELETE FROM statistiques_classement");
            const chunkSize = 1000;
            for (let i = 0; i < statsToInsert.length; i += chunkSize) {
                await connection.query(
                    "INSERT INTO statistiques_classement (eleve_id, promotion, population, type_examen, moyenne, rang, motif_non_classe) VALUES ?",
                    [statsToInsert.slice(i, i + chunkSize)]
                );
            }
        }

        await connection.commit();
        res.json({ message: "Statistiques et classements générés avec succès." });
    } catch (err) {
        await connection.rollback();
        res.status(500).json({ error: err.message });
    } finally {
        connection.release();
    }
});

app.get('/api/resultats/stats-eleve/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        // ✅ Récupère depuis statistiques_classement (moyennes calculées)
        const [statsClassement] = await db.query(`
            SELECT type_examen, moyenne, rang 
            FROM statistiques_classement 
            WHERE eleve_id = ?
        `, [id]);

        // ✅ Récupère AUSSI les notes brutes par matière pour chaque type examen
        const [notesDetail] = await db.query(`
            SELECT 
                c.type_examen,
                c.note,
                m.nom_matiere,
                m.id as matiere_id,
                ec.coefficient,
                me.coefficient_general
            FROM copies c
            JOIN matieres m ON c.matiere_id = m.id
            JOIN examens_configurations ec ON ec.matiere_id = m.id
            JOIN modeles_examens me ON ec.modele_examen_id = me.id AND me.nom_modele = c.type_examen
            WHERE c.eleve_id = ? AND c.note IS NOT NULL
        `, [id]);

        // Grouper les notes par type_examen
        const notesParExamen = {};
        notesDetail.forEach(n => {
            if (!notesParExamen[n.type_examen]) {
                notesParExamen[n.type_examen] = {
                    notes: [],
                    totalPts: 0,
                    totalCoef: 0
                };
            }
            notesParExamen[n.type_examen].notes.push(n);
            notesParExamen[n.type_examen].totalPts += parseFloat(n.note) * parseFloat(n.coefficient);
            notesParExamen[n.type_examen].totalCoef += parseFloat(n.coefficient);
        });

        // Fusionner avec statsClassement
        const results = statsClassement.map(stat => {
            const notesExamen = notesParExamen[stat.type_examen];
            // Calculer moyenne partielle si pas de moyenne officielle
            let moyenneAffichee = stat.moyenne;
            if (!moyenneAffichee && notesExamen && notesExamen.totalCoef > 0) {
                moyenneAffichee = (notesExamen.totalPts / notesExamen.totalCoef).toFixed(2);
            }

            return {
                type_examen: stat.type_examen,
                moyenne: moyenneAffichee,
                rang: stat.rang,
                // ✅ Indique si c'est une moyenne partielle ou complète
                est_complet: stat.moyenne !== null,
                notes_presentes: notesExamen ? notesExamen.notes.length : 0
            };
        });

       
        Object.keys(notesParExamen).forEach(typeExamen => {
            const existeDeja = results.find(r => r.type_examen === typeExamen);
            if (!existeDeja) {
                const notesExamen = notesParExamen[typeExamen];
                results.push({
                    type_examen: typeExamen,
                    moyenne: notesExamen.totalCoef > 0 
                        ? (notesExamen.totalPts / notesExamen.totalCoef).toFixed(2) 
                        : null,
                    rang: null,
                    est_complet: false,
                    notes_presentes: notesExamen.notes.length
                });
            }
        });

        res.json(results);
    } catch (err) {
        res.status(500).json({ error: "Erreur lors de la récupération des statistiques." });
    }
});
app.get('/api/resultats/sans-note-complete', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { typeExamen, promotion, population } = req.query;

        // 1. Récupérer les matières configurées pour ce type d'examen ET cette promotion
        const configParams = [typeExamen];
        let configQuery = `
            SELECT ec.matiere_id, m.nom_matiere
            FROM examens_configurations ec
            JOIN modeles_examens me ON ec.modele_examen_id = me.id
            JOIN matieres m ON ec.matiere_id = m.id
            WHERE me.nom_modele = ?
        `;
        if (promotion && promotion !== 'all') {
            configQuery += " AND me.promotion = ?";
            configParams.push(promotion);
        }

        const [configsMatieres] = await db.query(configQuery, configParams);

        if (configsMatieres.length === 0) {
            return res.json([]);
        }

        const matiereIds = configsMatieres.map(c => c.matiere_id);

        // 2. Récupérer tous les élèves de la promotion avec les filtres population
        let eleveQuery = `SELECT id, nom, prenom, numero_incorporation, escadron, peloton, statut FROM eleves WHERE 1=1`;
        const eleveParams = [];

        if (promotion && promotion !== 'all') {
            eleveQuery += " AND promotion = ?";
            eleveParams.push(promotion);
        }
        if (population && population !== 'all') {
            if (population === 'actif') {
                eleveQuery += " AND (statut = 'actif' OR statut IS NULL OR statut = 'approuve')";
            } else if (population === 'conseil') {
                eleveQuery += " AND statut IN ('redoublant', 'ajourne_3m', 'ajourne_6m')";
            }
        }

        const [eleves] = await db.query(eleveQuery, eleveParams);

        if (eleves.length === 0) {
            return res.json([]);
        }

        // 3. Récupérer toutes les notes existantes pour ce type d'examen et ces matières
        const placeholders = matiereIds.map(() => '?').join(',');
        const [toutesLesNotes] = await db.query(`
            SELECT c.eleve_id, c.matiere_id
            FROM copies c
            WHERE c.type_examen = ?
              AND c.matiere_id IN (${placeholders})
              AND c.note IS NOT NULL
              AND c.eleve_id IS NOT NULL
        `, [typeExamen, ...matiereIds]);

        // 4. Grouper les notes par élève (Set pour lookup O(1))
        const notesParEleve = {};
        toutesLesNotes.forEach(n => {
            if (!notesParEleve[n.eleve_id]) notesParEleve[n.eleve_id] = new Set();
            notesParEleve[n.eleve_id].add(n.matiere_id);
        });

        // 5. Filtrer les élèves incomplets et calculer les matières manquantes
        const incomplets = eleves
            .map(eleve => {
                const notesEleve = notesParEleve[eleve.id] || new Set();
                const matiereManquantes = configsMatieres
                    .filter(c => !notesEleve.has(c.matiere_id))
                    .map(c => c.nom_matiere);

                return {
                    ...eleve,
                    notesPresentes: notesEleve.size,
                    totalMatieres: matiereIds.length,
                    matiereManquantes
                };
            })
            .filter(eleve => eleve.matiereManquantes.length > 0);

        res.json(incomplets);

    } catch (err) {
        console.error('Erreur sans-note-complete:', err);
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/resultats/exporter-manquants', authenticateToken, checkRole(['admin']), async (req, res) => {
    try {
        const { matiereId, typeExamen, promotion, population } = req.query;

        if (!matiereId || !typeExamen) {
            return res.status(400).json({ message: "Matière et type d'examen sont requis pour l'exportation." });
        }

        // 1. Récupérer le nom de la matière
        const [[matiereInfo]] = await db.query("SELECT nom_matiere FROM matieres WHERE id = ?", [matiereId]);
        if (!matiereInfo) {
            return res.status(404).json({ message: "Matière non trouvée." });
        }

        // 2. Récupérer tous les élèves de la promotion/population ciblée
        let eleveQuery = `SELECT id, nom, prenom, numero_incorporation, escadron, peloton, sexe, statut FROM eleves WHERE 1=1`;
        const eleveParams = [];

        if (promotion && promotion !== 'all') {
            eleveQuery += " AND promotion = ?";
            eleveParams.push(promotion);
        }
        if (population && population !== 'all') {
            if (population === 'actif') {
                eleveQuery += " AND (statut = 'actif' OR statut IS NULL OR statut = 'approuve')";
            } else if (population === 'conseil') {
                eleveQuery += " AND statut IN ('redoublant', 'ajourne_3m', 'ajourne_6m')";
            }
        }
        eleveQuery += " ORDER BY escadron, peloton, CAST(numero_incorporation AS UNSIGNED) ASC";

        const [eleves] = await db.query(eleveQuery, eleveParams);
        if (eleves.length === 0) {
            return res.status(404).json({ message: "Aucun élève trouvé pour ces critères." });
        }

        // 3. Récupérer les élèves qui ONT déjà une note pour cette matière + cet examen
        const [elevesAvecNote] = await db.query(`
            SELECT eleve_id
            FROM copies
            WHERE matiere_id = ? AND type_examen = ? AND note IS NOT NULL AND eleve_id IS NOT NULL
        `, [matiereId, typeExamen]);
        const idsAvecNote = new Set(elevesAvecNote.map(r => r.eleve_id));

        // 4. Filtrer les manquants
        const manquants = eleves.filter(e => !idsAvecNote.has(e.id));

        if (manquants.length === 0) {
            return res.status(404).json({ message: "Aucun élève manquant pour ces critères — tout le monde a une note !" });
        }

        // 5. Grouper par escadron/peloton, comme l'export des notes
        const groupedData = manquants.reduce((acc, eleve) => {
            const key = `${eleve.escadron || 'Sans Escadron'} - ${eleve.peloton || 'Sans Peloton'}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(eleve);
            return acc;
        }, {});

        const workbook = xlsx.utils.book_new();
        const nomMatiere = matiereInfo.nom_matiere.toUpperCase();

        for (const groupName in groupedData) {
            const sheetData = groupedData[groupName];
            const headers = ["N° ORDRE", "NOM ET PRENOM", "N° INCORPORATION", "ESCADRON", "PELOTON", "SEXE", "STATUT"];
            const body = sheetData.map((row, index) => [
                index + 1,
                `${row.nom || ''} ${row.prenom || ''}`.trim(),
                row.numero_incorporation,
                row.escadron,
                row.peloton,
                (row.sexe === 'feminin' ? 'F' : 'M'),
                row.statut || 'actif'
            ]);
            const finalSheetData = [
                [`ÉLÈVES SANS NOTE - ${nomMatiere} (${typeExamen})`],
                [],
                headers,
                ...body
            ];
            const worksheet = xlsx.utils.aoa_to_sheet(finalSheetData);
            worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
            worksheet['!cols'] = [
                { wch: 10 }, { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 15 }
            ];
            const sheetName = groupName.replace(/[\\/*?:]/g, '').substring(0, 31);
            xlsx.utils.book_append_sheet(workbook, worksheet, sheetName);
        }

        const buffer = xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' });
        const fileName = `Manquants_${nomMatiere.replace(/ /g, '_')}_${typeExamen}${promotion ? '_' + promotion : ''}.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buffer);

    } catch (err) {
        console.error("Erreur export manquants:", err);
        res.status(500).json({ error: "Erreur lors de la génération du fichier Excel des manquants." });
    }
});
app.get('/api/stats/mes-notes-directes-par-matiere', authenticateToken, checkRole(['admin', 'operateur_note']), async (req, res) => {
    try {
        const { typeExamen, promotion } = req.query;
        const utilisateurId = req.user.id;

        if (!typeExamen) {
            return res.status(400).json({ message: "Le type d'examen est requis." });
        }

        let query = `
            SELECT m.id AS matiere_id, m.nom_matiere,
                   COUNT(c.id) AS notesSaisies
            FROM matieres m
            JOIN examens_configurations ec ON ec.matiere_id = m.id
            JOIN modeles_examens me ON ec.modele_examen_id = me.id
            LEFT JOIN copies c ON c.matiere_id = m.id
                AND c.type_examen = me.nom_modele
                AND c.note_saisie_par_utilisateur_id = ?
                AND c.code_anonyme IS NULL
                AND c.note IS NOT NULL
            WHERE me.nom_modele = ?
        `;
        const params = [utilisateurId, typeExamen];

        if (promotion && promotion !== 'all') {
            query += ' AND me.promotion = ?';
            params.push(promotion);
        }

        query += ' GROUP BY m.id, m.nom_matiere ORDER BY m.nom_matiere';

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error("Erreur sur /api/stats/mes-notes-directes-par-matiere", err);
        res.status(500).json({ error: "Erreur lors du calcul des notes saisies par matière." });
    }
});

const HOST = '0.0.0.0';
app.listen(port, HOST, () => {
    console.log(`Serveur backend démarré sur le port ${port} et accessible sur le réseau.`);
});
