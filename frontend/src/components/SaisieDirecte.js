import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import {
    FaPlay, FaSave, FaUserPlus, FaUsers, FaArrowLeft, FaHistory,
    FaEdit, FaTrash, FaCheckCircle, FaUserSlash, FaClipboardList,
    FaInfoCircle, FaLock
} from 'react-icons/fa';
import apiPaths from '../config/apiPaths';

// ─── Configuration "Parcours chronométré" (type EG 101 / FETTA) ───────────────
// Reproduit la logique du fichier Excel :
//   - Temps total = somme des (Arrivée - Départ) de 6 épreuves
//   - Note = RECHERCHEV(temps_total, Barème!A:B, 2, VRAI) -> recherche approximative

// Barème: seuil de temps total (en secondes depuis minuit) -> note /20
// Source : feuille "Barème" du fichier Excel FETTA_79_COURS_EG_101.xlsx
const BAREME_PARCOURS = [
    { seuil: 1 * 3600 + 30 * 60 + 0, note: 20 },  // 1h30m00
    { seuil: 2 * 3600 + 14 * 60 + 0, note: 19 },  // 2h14m00
    { seuil: 2 * 3600 + 29 * 60 + 59, note: 18 }, // 2h29m59
    { seuil: 2 * 3600 + 44 * 60 + 59, note: 17 }, // 2h44m59
    { seuil: 2 * 3600 + 59 * 60 + 59, note: 16 }, // 2h59m59
    { seuil: 3 * 3600 + 14 * 60 + 59, note: 15 }, // 3h14m59
    { seuil: 3 * 3600 + 29 * 60 + 59, note: 14 }, // 3h29m59
    { seuil: 3 * 3600 + 44 * 60 + 59, note: 13 }, // 3h44m59
    { seuil: 3 * 3600 + 59 * 60 + 59, note: 12 }, // 3h59m59
];

// Postes du parcours, dans l'ordre exact de passage (colonnes C→N du fichier Excel).
// C'est un relais : on ne repart pas de zéro à chaque poste.
//   - RSA       : uniquement un Départ (point de départ du parcours)
//   - TOPO..TIR : Arrivée au poste, puis Départ vers le poste suivant
//   - OS        : uniquement une Arrivée (ligne d'arrivée finale)
const CHECKPOINTS_PARCOURS = [
    { key: 'rsa', label: 'RSA', arrivee: false, depart: true },
    { key: 'topo', label: 'TOPO', arrivee: true, depart: true },
    { key: 'tel', label: 'TEL', arrivee: true, depart: true },
    { key: 'eit', label: 'EIT', arrivee: true, depart: true },
    { key: 'secourisme', label: 'SECOURISME', arrivee: true, depart: true },
    { key: 'tir', label: 'TIR', arrivee: true, depart: true },
    { key: 'os', label: 'OS', arrivee: true, depart: false },
];

// Liste à plat des 12 champs, dans l'ordre exact des colonnes C→N de l'Excel
// (rsa_depart, topo_arrivee, topo_depart, tel_arrivee, tel_depart, ...)
const CHAMPS_ORDONNES_PARCOURS = CHECKPOINTS_PARCOURS.reduce((champs, cp) => {
    if (cp.arrivee) champs.push(`${cp.key}_arrivee`);
    if (cp.depart) champs.push(`${cp.key}_depart`);
    return champs;
}, []);

// ⚠️ Nom de la matière qui déclenche le mode "Parcours chronométré".
// La comparaison est tolérante : elle matche toute matière dont le nom
// commence par "PG" (ex: "PG", "PG (Bonus)", "PG Bonus"...).
const MATIERE_PARCOURS_NOM = 'PG';

// "HH:MM" -> secondes depuis minuit
const timeToSeconds = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 3600 + m * 60;
};

// Calcule la durée totale = somme des 6 segments (D-C)+(F-E)+(H-G)+(J-I)+(L-K)+(N-M),
// exactement comme la formule Excel. Retourne null tant que tous les temps ne sont
// pas renseignés.
// Vérifie que la séquence complète des 12 temps est strictement croissante
// (pas de retour à minuit possible : le parcours ne dépasse jamais 24h).
// Retourne un Set contenant les clés des champs impliqués dans une incohérence.
const champsInvalides = (temps) => {
    const invalides = new Set();
    for (let i = 1; i < CHAMPS_ORDONNES_PARCOURS.length; i++) {
        const champPrecedent = CHAMPS_ORDONNES_PARCOURS[i - 1];
        const champActuel = CHAMPS_ORDONNES_PARCOURS[i];
        const tPrec = timeToSeconds(temps[champPrecedent]);
        const tActuel = timeToSeconds(temps[champActuel]);
        if (tPrec !== null && tActuel !== null && tActuel <= tPrec) {
            invalides.add(champPrecedent);
            invalides.add(champActuel);
        }
    }
    return invalides;
};

// Calcule la durée totale = somme des 6 segments (D-C)+(F-E)+(H-G)+(J-I)+(L-K)+(N-M).
// Plus de correction "passage de minuit" : le parcours ne dépasse pas 24h,
// donc un segment négatif ou nul signifie une saisie invalide.
const calculerDureeTotale = (temps) => {
    const valeurs = CHAMPS_ORDONNES_PARCOURS.map(id => timeToSeconds(temps[id]));
    if (valeurs.some(v => v === null)) return null;
    let total = 0;
    for (let i = 0; i < valeurs.length; i += 2) {
        const duree = valeurs[i + 1] - valeurs[i];
        if (duree <= 0) return null; // incohérent
        total += duree;
    }
    return total;
};

// Reproduit =RECHERCHEV(total, Barème!A:B, 2, VRAI) : recherche approximative
// sur une table triée par ordre croissant -> renvoie la note du plus grand
// seuil inférieur ou égal au temps total.
const noteDepuisBareme = (totalSecondes) => {
    if (totalSecondes === null) return null;
    let note = null;
    for (const { seuil, note: n } of BAREME_PARCOURS) {
        if (seuil <= totalSecondes) note = n;
        else break;
    }
    // Temps meilleur que le seuil le plus bas du barème -> note maximale
    return note === null ? 20 : note;
};

const formatDuree = (secondes) => {
    if (secondes === null) return '--h--m--s';
    const h = Math.floor(secondes / 3600);
    const m = Math.floor((secondes % 3600) / 60);
    const s = Math.floor(secondes % 60);
    return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
};

// ─── Formulaire "Parcours chronométré" ─────────────────────────────────────────
// Remplace le champ Note classique quand la matière sélectionnée est le parcours.
// Appelle onNoteCalculee(note, dureeTotale) à chaque changement, `note` étant
// une chaîne vide tant que tous les temps ne sont pas renseignés.
const ParcoursChronoForm = ({ onNoteCalculee, resetSignal }) => {
    const [temps, setTemps] = useState({});
    const inputRefs = useRef({});

    const invalides = useMemo(() => champsInvalides(temps), [temps]);
    const hasErrors = invalides.size > 0;
    const duree = useMemo(() => (hasErrors ? null : calculerDureeTotale(temps)), [temps, hasErrors]);
    const note = useMemo(() => noteDepuisBareme(duree), [duree]);

    // ✅ Notifie le parent de façon synchrone à chaque changement, pas via useEffect
    const notifierParent = (nouveauxTemps) => {
        const inv = champsInvalides(nouveauxTemps);
        const d = inv.size > 0 ? null : calculerDureeTotale(nouveauxTemps);
        const n = noteDepuisBareme(d);
        onNoteCalculee(n !== null ? String(n) : '', d);
    };

    useEffect(() => {
        setTemps({});
        onNoteCalculee('', null); // ✅ reset aussi côté parent
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetSignal]);

    const handleChange = (champId, value) => {
        setTemps(prev => {
            const next = { ...prev, [champId]: value };
            notifierParent(next);
            return next;
        });
    };

    const handleKeyDown = (champId, e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const index = CHAMPS_ORDONNES_PARCOURS.indexOf(champId);
            const suivantId = CHAMPS_ORDONNES_PARCOURS[index + 1];
            if (suivantId && inputRefs.current[suivantId]) {
                inputRefs.current[suivantId].focus();
            }
        }
    };

    return (
        <div className="parcours-chrono-box">
            <table className="parcours-table">
                <thead>
                    <tr><th>Poste</th><th>Arrivée</th><th>Départ</th></tr>
                </thead>
                <tbody>
                    {CHECKPOINTS_PARCOURS.map(cp => (
                        <tr key={cp.key}>
                            <td>{cp.label}</td>
                            <td>
                                {cp.arrivee ? (
                                    <input
                                        type="time"
                                        className={invalides.has(`${cp.key}_arrivee`) ? 'invalid' : ''}
                                        ref={el => { inputRefs.current[`${cp.key}_arrivee`] = el; }}
                                        value={temps[`${cp.key}_arrivee`] || ''}
                                        onChange={e => handleChange(`${cp.key}_arrivee`, e.target.value)}
                                        onKeyDown={e => handleKeyDown(`${cp.key}_arrivee`, e)}
                                    />
                                ) : <span className="champ-absent">—</span>}
                            </td>
                            <td>
                                {cp.depart ? (
                                    <input
                                        type="time"
                                        className={invalides.has(`${cp.key}_depart`) ? 'invalid' : ''}
                                        ref={el => { inputRefs.current[`${cp.key}_depart`] = el; }}
                                        value={temps[`${cp.key}_depart`] || ''}
                                        onChange={e => handleChange(`${cp.key}_depart`, e.target.value)}
                                        onKeyDown={e => handleKeyDown(`${cp.key}_depart`, e)}
                                    />
                                ) : <span className="champ-absent">—</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {hasErrors && (
                <div className="parcours-erreur">
                    ⚠ Chaque heure doit être strictement postérieure à la précédente (le parcours ne dépasse pas 24h).
                </div>
            )}
            <div className="parcours-result">
                <span>Temps total : <strong>{formatDuree(duree)}</strong></span>
                <span>Note calculée : <strong>{note !== null ? `${note} / 20` : '-'}</strong></span>
            </div>
        </div>
    );
};

// ─── Modals ───────────────────────────────────────────────────────────────────

const ModificationModal = ({ entry, onClose, onSave }) => {
    const [nouvelleNote, setNouvelleNote] = useState(entry.note || '');
    const [raison, setRaison] = useState('');

    const handleSave = () => {
        const noteNum = parseFloat(nouvelleNote);
        if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
            alert("Veuillez entrer une note valide entre 0 et 20.");
            return;
        }
        if (!raison.trim()) {
            alert("Veuillez fournir une raison pour la modification.");
            return;
        }
        const motif = `Modification de la note de ${entry.prenom} ${entry.nom} (N° Inc ${entry.numero_incorporation}). Ancienne note : ${entry.note}. Nouvelle note : ${nouvelleNote}. Raison : ${raison}`;
        onSave(entry.copie_id, nouvelleNote, motif);
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Modifier la note de {entry.prenom} {entry.nom}</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="form-group"><label>Matière</label><input type="text" value={entry.nom_matiere} disabled /></div>
                    <div className="form-group"><label>Ancienne Note</label><input type="text" value={entry.note} disabled /></div>
                    <div className="form-group">
                        <label>Nouvelle Note</label>
                        <input type="number" min="0" max="20" step="0.01" value={nouvelleNote}
                            onChange={(e) => setNouvelleNote(e.target.value)}
                            placeholder="Note entre 0 et 20" autoFocus />
                    </div>
                    <div className="form-group">
                        <label>Raison de la modification</label>
                        <textarea rows="3" placeholder="Expliquez pourquoi la note est modifiée..."
                            value={raison} onChange={(e) => setRaison(e.target.value)} />
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-primary" onClick={handleSave}>Enregistrer la Modification</button>
                    <button className="btn btn-secondary" onClick={onClose}>Annuler</button>
                </div>
            </div>
        </div>
    );
};

const HistoriqueSaisiesModal = ({ isOpen, onClose, saisies, onEdit, isLoading }) => {
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Mes 150 dernières saisies directes</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {isLoading ? <p>Chargement de l'historique...</p> : (
                        <div className="table-responsive">
                            <table className="results-table">
                                <thead>
                                    <tr><th>Date</th><th>Élève</th><th>Matière</th><th>Note</th><th>Action</th></tr>
                                </thead>
                                <tbody>
                                    {saisies.length > 0 ? saisies.map(saisie => (
                                        <tr key={saisie.copie_id}>
                                            <td>{new Date(saisie.date_saisie).toLocaleString('fr-FR')}</td>
                                            <td>{saisie.prenom} {saisie.nom} ({saisie.numero_incorporation})</td>
                                            <td>{saisie.nom_matiere}</td>
                                            <td>{saisie.note}</td>
                                            <td>
                                                <button className="btn-icon btn-edit" onClick={() => onEdit(saisie)} title="Modifier cette note">
                                                    <FaEdit />
                                                </button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="5">Aucune saisie récente trouvée.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
};

const AbsenceModal = ({ eleve, onConfirm, onCancel }) => {
    const [motif, setMotif] = useState('');
    const inputRef = useRef(null);
    useEffect(() => { inputRef.current?.focus(); }, []);

    return (
        <div className="modal-overlay">
            <div className="modal-content" style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <h3>Absence de {eleve.prenom} {eleve.nom}</h3>
                    <button className="close-button" onClick={onCancel}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="form-group">
                        <label htmlFor="motif_absence">Motif (optionnel)</label>
                        <input ref={inputRef} type="text" id="motif_absence" value={motif}
                            onChange={(e) => setMotif(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && onConfirm(motif)}
                            placeholder="Ex: Raison médicale..." />
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-primary" onClick={() => onConfirm(motif)}>Confirmer l'Absence</button>
                    <button className="btn btn-secondary" onClick={onCancel}>Annuler</button>
                </div>
            </div>
        </div>
    );
};

const ValidationModal = ({ isOpen, onClose, saisies, onValider, onVider, onSupprimer, onModifier, isSaving }) => {
    const [editingId, setEditingId] = useState(null);
    const [editingValue, setEditingValue] = useState('');
    const editInputRef = useRef(null);

    useEffect(() => {
        if (editingId && editInputRef.current) editInputRef.current.focus();
    }, [editingId]);

    if (!isOpen) return null;

    const handleStartEditing = (saisie) => {
        if (saisie.type === 'note') {
            setEditingId(saisie.temp_id);
            setEditingValue(saisie.note);
        }
    };

    const handleSaveEdit = () => {
        if (editingId) {
            const noteNum = parseFloat(editingValue);
            if (!isNaN(noteNum) && noteNum >= 0 && noteNum <= 20) {
                onModifier(editingId, editingValue);
            }
            setEditingId(null);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Saisies en attente de validation ({saisies.length})</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="table-responsive">
                        <table className="results-table">
                            <thead>
                                <tr><th>N° Incorp</th><th>Élève</th><th>Esc</th><th>Pon</th><th>Sexe</th><th>Note / Motif</th><th>Action</th></tr>
                            </thead>
                            <tbody>
                                {saisies.map((saisie) => (
                                    <tr key={saisie.temp_id} className={saisie.type === 'absence' ? 'absence-row' : ''}>
                                        <td>{saisie.numero_incorporation || '-'}</td>
                                        <td>{saisie.eleve_nom}</td>
                                        <td>{saisie.escadron || '-'}</td>
                                        <td>{saisie.peloton || '-'}</td>
                                        <td>{saisie.sexe === 'feminin' ? 'F' : saisie.sexe === 'masculin' ? 'M' : '-'}</td>
                                        <td onClick={() => handleStartEditing(saisie)}>
                                            {editingId === saisie.temp_id ? (
                                                <input ref={editInputRef} type="number" value={editingValue}
                                                    onChange={(e) => setEditingValue(e.target.value)}
                                                    onBlur={handleSaveEdit}
                                                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
                                                    min="0" max="20" step="0.01"
                                                    style={{ width: '80px', textAlign: 'center' }} />
                                            ) : (
                                                saisie.type === 'note'
                                                    ? <strong>{saisie.note} / 20 <FaEdit style={{ marginLeft: '10px', color: '#007bff', cursor: 'pointer' }} /></strong>
                                                    : <span className="motif-display"><FaUserSlash /> <em>{saisie.motif}</em></span>
                                            )}
                                        </td>
                                        <td>
                                            <button className="btn-icon btn-delete" onClick={() => onSupprimer(saisie.temp_id)}>
                                                <FaTrash />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn btn-secondary" onClick={onVider} disabled={isSaving}>Vider</button>
                    <button className="btn btn-primary" onClick={onValider} disabled={saisies.length === 0 || isSaving}>
                        <FaCheckCircle /> {isSaving ? 'Enregistrement...' : `Valider (${saisies.length})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Composant principal ──────────────────────────────────────────────────────

const SaisieDirecte = () => {
    const [allEleves, setAllEleves] = useState([]);
    const [examTypes, setExamTypes] = useState([]);
    const [availableMatieres, setAvailableMatieres] = useState([]);
    const [selectedMatiereId, setSelectedMatiereId] = useState('');
    const [selectedTypeExamen, setSelectedTypeExamen] = useState('');
    const [selectedEscadron, setSelectedEscadron] = useState('');
    const [selectedPeloton, setSelectedPeloton] = useState('all');
    const [selectedStatutConseil, setSelectedStatutConseil] = useState('');
    const [note, setNote] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isMatiereLoading, setIsMatiereLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [mode, setMode] = useState('serie');
    const [saisiesTemporaires, setSaisiesTemporaires] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isSaisieSerieActive, setIsSaisieSerieActive] = useState(false);
    const [listeElevesSerie, setListeElevesSerie] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [rechercheEleve, setRechercheEleve] = useState('');
    const [elevesTrouves, setElevesTrouves] = useState([]);
    const [selectedEleve, setSelectedEleve] = useState(null);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [recentSaisies, setRecentSaisies] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [editingEntry, setEditingEntry] = useState(null);
    const [isAbsenceModalOpen, setIsAbsenceModalOpen] = useState(false);
    const [isValidationModalOpen, setIsValidationModalOpen] = useState(false);
    const [assignment, setAssignment] = useState(null);
    const [promotionsList, setPromotionsList] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('');
    const [parcoursResetSignal, setParcoursResetSignal] = useState(0);
const [mesNotesParMatiere, setMesNotesParMatiere] = useState([]);
const [isLoadingMesNotes, setIsLoadingMesNotes] = useState(false);
    const noteInputRef = useRef(null);
    const rechercheEleveInputRef = useRef(null);

    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    // ── Chargement initial ────────────────────────────────────────────────────
    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const token = localStorage.getItem('token');
                const decoded = jwtDecode(token);

                // ✅ Ne plus charger les examTypes globalement ici
                // Ils seront chargés dynamiquement selon la promotion sélectionnée
                const [elevesRes, matieresRes, promotionsRes] = await Promise.all([
                    axios.get(apiPaths.eleves.base, getAuthHeaders()),
                    axios.get('/api/matieres', getAuthHeaders()),
                    axios.get('/api/promotions', getAuthHeaders())
                ]);

                setAllEleves(elevesRes.data);

                const list = promotionsRes.data || [];
                setPromotionsList(list);

                // ✅ Sélectionner automatiquement la dernière promotion (index 0 = plus récente)
                if (list.length > 0 && !decoded.assigned_matiere_id) {
                    setSelectedPromotion(list[0]);
                }

                // ✅ Mode assigné (opérateur)
                if (decoded.assigned_matiere_id) {
                    const matiereObj = matieresRes.data.find(m => m.id === decoded.assigned_matiere_id);
                    setAssignment({
                        matiereNom: matiereObj ? matiereObj.nom_matiere : 'Inconnue',
                        examen: decoded.assigned_type_examen,
                        promotion: decoded.assigned_promotion,
                        population: decoded.assigned_population || 'all'
                    });
                    setSelectedMatiereId(decoded.assigned_matiere_id);
                    setSelectedTypeExamen(decoded.assigned_type_examen);
                    setSelectedPromotion(decoded.assigned_promotion || '');
                }
            } catch (err) {
                setError("Erreur de chargement.");
            }
            setIsLoading(false);
        };
        fetchData();
    }, [getAuthHeaders]);

    // ── Charger les examens filtrés par promotion ─────────────────────────────
    useEffect(() => {
        if (assignment) return; // Mode opérateur assigné → pas de rechargement
        const fetchExamens = async () => {
            const promo = selectedPromotion;
            if (!promo) {
                setExamTypes([]);
                setSelectedTypeExamen('');
                setSelectedMatiereId('');
                setAvailableMatieres([]);
                return;
            }
            try {
                // ✅ Filtrer les examens par promotion
                const examRes = await axios.get(
                    `/api/examens?promotion=${promo}`,
                    getAuthHeaders()
                );
                setExamTypes(examRes.data);

                // ✅ Reset l'examen sélectionné s'il n'appartient plus à cette promo
                setSelectedTypeExamen(prev => {
                    const exists = examRes.data.find(e => e.nom_modele === prev);
                    if (!exists) {
                        setSelectedMatiereId('');
                        setAvailableMatieres([]);
                        return '';
                    }
                    return prev;
                });
            } catch (err) {
                setExamTypes([]);
                setSelectedTypeExamen('');
            }
        };
        fetchExamens();
    }, [selectedPromotion, assignment, getAuthHeaders]);

    // ── Charger les matières filtrées par examen ET promotion ─────────────────
    useEffect(() => {
        if (assignment) return; // Mode opérateur assigné → pas de rechargement
        const fetchMatieres = async () => {
            if (!selectedTypeExamen || !selectedPromotion) {
                setAvailableMatieres([]);
                setSelectedMatiereId('');
                return;
            }
            setIsMatiereLoading(true);
            try {
                // ✅ Passer promotion ET typeExamen pour filtrer les matières
                const response = await axios.get(
                    `/api/matieres-par-examen?typeExamen=${selectedTypeExamen}&promotion=${selectedPromotion}`,
                    getAuthHeaders()
                );
                setAvailableMatieres(response.data);

                // ✅ Reset la matière si elle n'est plus dans la config de cette promo
                setSelectedMatiereId(prev => {
                    if (!prev) return prev;
                    const exists = response.data.find(m => m.id === parseInt(prev));
                    return exists ? prev : '';
                });
            } catch (err) {
                setAvailableMatieres([]);
                setSelectedMatiereId('');
            } finally {
                setIsMatiereLoading(false);
            }
        };
        fetchMatieres();
    }, [selectedTypeExamen, selectedPromotion, assignment, getAuthHeaders]);

    // ── Escadrons et pelotons filtrés par promotion ───────────────────────────
    const escadrons = useMemo(() => {
        let filtered = allEleves;
        const promo = assignment?.promotion || selectedPromotion;
        if (promo) filtered = allEleves.filter(e => e.promotion === promo);
        return [...new Set(filtered.map(e => e.escadron).filter(Boolean))].sort((a, b) => a - b);
    }, [allEleves, assignment, selectedPromotion]);

    const pelotons = useMemo(() => {
        if (!selectedEscadron) return [];
        const promo = assignment?.promotion || selectedPromotion;
        let filtered = allEleves.filter(e => e.escadron === selectedEscadron);
        if (promo) filtered = filtered.filter(e => e.promotion === promo);
        return [...new Set(filtered.map(e => e.peloton).filter(Boolean))].sort((a, b) => a - b);
    }, [allEleves, selectedEscadron, assignment, selectedPromotion]);

    // ✅ Détecte si la matière sélectionnée est "PG" (Parcours chronométré)
    // (uniquement pertinent en mode "Recherche" / saisie manuelle)
    const isMatiereParcours = useMemo(() => {
        const matiere = availableMatieres.find(m => m.id === parseInt(selectedMatiereId));
        const nom = (matiere?.nom_matiere || assignment?.matiereNom || '').trim().toUpperCase();
        return nom.startsWith(MATIERE_PARCOURS_NOM);
    }, [selectedMatiereId, availableMatieres, assignment]);

    // ── Historique ────────────────────────────────────────────────────────────
    const fetchRecentSaisies = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            const response = await axios.get('/api/copies/mes-saisies-directes-recentes', getAuthHeaders());
            setRecentSaisies(response.data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [getAuthHeaders]);
    const fetchMesNotesParMatiere = useCallback(async () => {
    const typeExamen = assignment?.examen || selectedTypeExamen;
    const promo = assignment?.promotion || selectedPromotion;
    if (!typeExamen) {
        setMesNotesParMatiere([]);
        return;
    }
    setIsLoadingMesNotes(true);
    try {
        const params = { typeExamen };
        if (promo) params.promotion = promo;
        const res = await axios.get('/api/stats/mes-notes-directes-par-matiere', {
            params,
            ...getAuthHeaders()
        });
        setMesNotesParMatiere(res.data);
    } catch (err) {
        setMesNotesParMatiere([]);
    } finally {
        setIsLoadingMesNotes(false);
    }
}, [assignment, selectedTypeExamen, selectedPromotion, getAuthHeaders]);

useEffect(() => { fetchMesNotesParMatiere(); }, [fetchMesNotesParMatiere]);

    const handleOpenHistoryModal = () => {
        setIsHistoryModalOpen(true);
        fetchRecentSaisies();
    };

    const handleSaveModification = (copieId, nouvelleNote, motif) => {
        axios.put(`/api/resultats/${copieId}`, { nouvelle_note: nouvelleNote, motif }, getAuthHeaders())
            .then(() => { setEditingEntry(null); fetchRecentSaisies(); })
            .catch(error => alert(error.response?.data?.message || "Erreur."));
    };

    // ── Saisie en série ───────────────────────────────────────────────────────
    const handleStartSaisieSerie = async () => {
        const isConseil = assignment?.population === 'conseil';
        if (!selectedMatiereId || !selectedTypeExamen || (!isConseil && !selectedEscadron) || (isConseil && !selectedStatutConseil)) {
            setError(isConseil ? "Sélectionnez une catégorie conseil." : "Sélectionnez l'escadron.");
            return;
        }
        setIsLoading(true);
        setError('');
        setMessage('');
        try {
            const params = {
                matiereId: selectedMatiereId,
                typeExamen: selectedTypeExamen,
                promotion: assignment?.promotion || selectedPromotion,
                population: assignment?.population,
                escadron: selectedEscadron,
                peloton: selectedPeloton,
                statutFiltre: selectedStatutConseil
            };
            const response = await axios.get(apiPaths.eleves.parGroupe, { params, ...getAuthHeaders() });
            if (response.data.length === 0) {
                setMessage("Aucun élève trouvé.");
                setListeElevesSerie([]);
            } else {
                const sorted = [...response.data].sort((a, b) => {
                    const pelotonA = parseInt(a.peloton) || 0;
                    const pelotonB = parseInt(b.peloton) || 0;
                    if (pelotonA !== pelotonB) return pelotonA - pelotonB;
                    const sexeOrder = (s) => (s === 'feminin') ? 0 : 1;
                    const diff = sexeOrder(a.sexe) - sexeOrder(b.sexe);
                    if (diff !== 0) return diff;
                    return (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' });
                });
                setListeElevesSerie(sorted);
                setCurrentIndex(0);
                setIsSaisieSerieActive(true);
            }
        } catch (err) {
            setError("Erreur lors du chargement des élèves.");
        }
        setIsLoading(false);
    };

    const handleSubmitNoteSerie = (e) => {
        e.preventDefault();
        const noteNum = parseFloat(note);
        if (note === '' || isNaN(noteNum) || noteNum < 0 || noteNum > 20) {
            setError("Note invalide (0 à 20).");
            return;
        }
        const currentEleve = listeElevesSerie[currentIndex];
        const nouvelleSaisie = {
            type: 'note',
            eleve_id: currentEleve.id,
            eleve_nom: `${currentEleve.nom} ${currentEleve.prenom}`,
            numero_incorporation: currentEleve.numero_incorporation,
            escadron: currentEleve.escadron,
            peloton: currentEleve.peloton,
            sexe: currentEleve.sexe,
            matiere_id: selectedMatiereId,
            note: note,
            type_examen: selectedTypeExamen,
            temp_id: `${Date.now()}-${currentEleve.id}`
        };
        setSaisiesTemporaires(prev => [...prev, nouvelleSaisie]);
        setNote('');
        setError('');
        if (currentIndex < listeElevesSerie.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setIsSaisieSerieActive(false);
            setIsValidationModalOpen(true);
        }
    };

    const handleConfirmAbsence = (motif) => {
        const eleve = listeElevesSerie[currentIndex];
        const nouvelleSaisie = {
            type: 'absence',
            eleve_id: eleve.id,
            eleve_nom: `${eleve.nom} ${eleve.prenom}`,
            numero_incorporation: eleve.numero_incorporation,
            escadron: eleve.escadron,
            peloton: eleve.peloton,
            sexe: eleve.sexe,
            matiere_id: selectedMatiereId,
            motif: motif || 'Non spécifié',
            type_examen: selectedTypeExamen,
            temp_id: `${Date.now()}-${eleve.id}`
        };
        setSaisiesTemporaires(prev => [...prev, nouvelleSaisie]);
        setIsAbsenceModalOpen(false);
        if (currentIndex < listeElevesSerie.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setIsSaisieSerieActive(false);
            setIsValidationModalOpen(true);
        }
    };

    // ── Recherche élève (mode manuel) ─────────────────────────────────────────
    useEffect(() => {
        const chercher = async () => {
            if (rechercheEleve.trim().length < 2 || (selectedEleve && rechercheEleve.includes(selectedEleve.nom))) {
                setElevesTrouves([]);
                return;
            }
            try {
                const res = await axios.get(apiPaths.eleves.recherche, {
                    params: {
                        q: rechercheEleve,
                        promotion: assignment?.promotion || selectedPromotion,
                        population: assignment?.population
                    },
                    ...getAuthHeaders()
                });
                setElevesTrouves(res.data);
            } catch (error) {
                console.error(error);
            }
        };
        const debounce = setTimeout(chercher, 300);
        return () => clearTimeout(debounce);
    }, [rechercheEleve, selectedEleve, assignment, selectedPromotion, getAuthHeaders]);

 const handleSubmitNoteManuel = (e) => {
    e.preventDefault();
    const noteNum = parseFloat(note);
    if (!selectedEleve || isNaN(noteNum)) return;
    const nouvelleSaisie = {
        type: 'note',
        eleve_id: selectedEleve.id,
        eleve_nom: `${selectedEleve.nom} ${selectedEleve.prenom}`,
        numero_incorporation: selectedEleve.numero_incorporation,
        escadron: selectedEleve.escadron,
        peloton: selectedEleve.peloton,
        sexe: selectedEleve.sexe,
        matiere_id: selectedMatiereId,
        note: note,
        type_examen: selectedTypeExamen,
        temp_id: `${Date.now()}-${selectedEleve.id}`
    };
    setSaisiesTemporaires(prev => [...prev, nouvelleSaisie]);
    setNote('');
    setSelectedEleve(null);
    setRechercheEleve('');
    if (isMatiereParcours) {
        setParcoursResetSignal(s => s + 1); // ✅ vide les heures du formulaire parcours
    }
    rechercheEleveInputRef.current?.focus();
};

    // ── Validation finale ─────────────────────────────────────────────────────
    const handleValiderSaisies = async () => {
        setIsSaving(true);
        const notesToSave = saisiesTemporaires.filter(s => s.type === 'note');
        const absencesToSave = saisiesTemporaires.filter(s => s.type === 'absence');
        try {
            const promises = [];
            if (notesToSave.length > 0) {
                promises.push(axios.post('/api/copies/notes-directes-bulk', { notes: notesToSave }, getAuthHeaders()));
            }
            if (absencesToSave.length > 0) {
                promises.push(axios.post('/api/absences/direct-bulk', { absences: absencesToSave }, getAuthHeaders()));
            }
            await Promise.all(promises);
            setSaisiesTemporaires([]);
            setIsValidationModalOpen(false);
            setMessage("Saisies enregistrées avec succès.");
            fetchMesNotesParMatiere(); 
        } catch (err) {
            alert(err.response?.data?.message || "Erreur lors de l'enregistrement.");
        } finally {
            setIsSaving(false);
        }
    };

    // ── Helper label population ───────────────────────────────────────────────
    const getPopulationLabel = (pop) => {
        switch (pop) {
            case 'actif': return 'LISTE ORIGINALE (Actifs)';
            case 'conseil': return 'LISTE CONSEIL (Ajournés/Redoublants)';
            default: return 'TOUTE LA PROMOTION (Mixte)';
        }
    };

    // ── Render mode série ─────────────────────────────────────────────────────
    const renderModeSerie = () => {
        if (assignment?.population === 'conseil') {
            return (
                <div className="conseil-selection-box">
                    <div className="form-group">
                        <label>Catégorie Liste Conseil</label>
                        <select value={selectedStatutConseil} onChange={e => setSelectedStatutConseil(e.target.value)} className="select-conseil">
                            <option value="">-- Choisir --</option>
                            <option value="redoublant">Redoublants</option>
                            <option value="ajourne_3m">Ajournés 3 Mois</option>
                            <option value="ajourne_6m">Ajournés 6 Mois</option>
                        </select>
                    </div>
                    <button className="btn btn-primary btn-block" onClick={handleStartSaisieSerie}
                        disabled={!selectedStatutConseil || isLoading}>
                        <FaPlay /> Lancer la liste
                    </button>
                </div>
            );
        }
        return (
            <>
                <div className="form-group">
                    <label>Escadron</label>
                    <select value={selectedEscadron} onChange={e => { setSelectedEscadron(e.target.value); setSelectedPeloton('all'); }}>
                        <option value="">-- Choisir --</option>
                        {escadrons.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                </div>
                {selectedEscadron && (
                    <div className="form-group">
                        <label>Peloton</label>
                        <select value={selectedPeloton} onChange={e => setSelectedPeloton(e.target.value)}>
                            <option value="all">Tous</option>
                            {pelotons.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                )}
                <button className="btn btn-primary" onClick={handleStartSaisieSerie}
                    disabled={!selectedEscadron || isLoading || !selectedMatiereId || !selectedTypeExamen}>
                    <FaPlay /> Commencer
                </button>
            </>
        );
    };

    // ── Render ────────────────────────────────────────────────────────────────
    if (isLoading && !isSaisieSerieActive) return <div className="card">Chargement...</div>;

    return (
        <div className="card">
            {/* Modals */}
            {isAbsenceModalOpen && listeElevesSerie[currentIndex] && (
                <AbsenceModal
                    eleve={listeElevesSerie[currentIndex]}
                    onConfirm={handleConfirmAbsence}
                    onCancel={() => setIsAbsenceModalOpen(false)}
                />
            )}
            <HistoriqueSaisiesModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                saisies={recentSaisies}
                isLoading={isLoadingHistory}
                onEdit={setEditingEntry}
            />
            {editingEntry && (
                <ModificationModal
                    entry={editingEntry}
                    onClose={() => setEditingEntry(null)}
                    onSave={handleSaveModification}
                />
            )}
            <ValidationModal
                isOpen={isValidationModalOpen}
                onClose={() => setIsValidationModalOpen(false)}
                saisies={saisiesTemporaires}
                onValider={handleValiderSaisies}
                onVider={() => setSaisiesTemporaires([])}
                onSupprimer={(id) => setSaisiesTemporaires(prev => prev.filter(s => s.temp_id !== id))}
                onModifier={(id, val) => setSaisiesTemporaires(prev => prev.map(s => s.temp_id === id ? { ...s, note: val } : s))}
                isSaving={isSaving}
            />

            {/* Badge saisies en attente */}
            {saisiesTemporaires.length > 0 && (
                <div className="validation-badge" onClick={() => setIsValidationModalOpen(true)}>
                    <FaClipboardList />
                    <span>{saisiesTemporaires.length}</span>
                </div>
            )}

            {/* ── Mode saisie en série active ── */}
            {isSaisieSerieActive ? (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2>Notation en Série...</h2>
                        <button onClick={() => setIsSaisieSerieActive(false)} className="btn btn-secondary">
                            <FaArrowLeft /> Retour
                        </button>
                    </div>
                    <p>
                        Matière: <strong>{assignment?.matiereNom || availableMatieres.find(m => m.id === parseInt(selectedMatiereId))?.nom_matiere}</strong> |{' '}
                        Examen: <strong>{selectedTypeExamen}</strong> |{' '}
                        Promotion: <strong>{assignment?.promotion || selectedPromotion || 'Toutes'}</strong>
                    </p>
                    <div style={{ marginBottom: '10px', color: '#718096', fontSize: '0.9rem' }}>
                        Élève {currentIndex + 1} / {listeElevesSerie.length}
                    </div>
                    <div className="student-info-card">
                        <h3>{listeElevesSerie[currentIndex].nom} {listeElevesSerie[currentIndex].prenom}</h3>
                        <p>
                            N° Incorp: {listeElevesSerie[currentIndex].numero_incorporation} |{' '}
                            <span className={`badge-statut ${listeElevesSerie[currentIndex].statut}`}>
                                {listeElevesSerie[currentIndex].statut || 'Actif'}
                            </span>
                        </p>
                    </div>
                    <form onSubmit={handleSubmitNoteSerie}>
                        <div className="form-group">
                            <label>Note / 20</label>
                            <input ref={noteInputRef} type="number" value={note}
                                onChange={e => setNote(e.target.value)}
                                min="0" max="20" step="0.01" autoFocus required />
                        </div>
                        {error && <div className="alert alert-danger">{error}</div>}
                        <div className="saisie-serie-actions">
                            <button type="submit" className="btn btn-primary">
                                <FaSave /> Valider & Suivant
                            </button>
                            <button type="button" className="btn btn-warning" onClick={() => setIsAbsenceModalOpen(true)}>
                                <FaUserSlash /> Absent
                            </button>
                        </div>
                    </form>
                </>
            ) : (
                <>
                    {/* ── En-tête ── */}
                    <div className="card-header-actions">
                        <h2>Saisie Directe</h2>
                        <button onClick={handleOpenHistoryModal} className="btn-icon history-btn">
                            <FaHistory />
                        </button>
                    </div>

                    {/* ── Sélecteur de mode ── */}
                    <div className="mode-selector">
                        <button onClick={() => setMode('serie')} className={`btn ${mode === 'serie' ? 'btn-primary' : 'btn-secondary'}`}>
                            <FaUsers /> Par Catégorie
                        </button>
                        <button onClick={() => setMode('manuel')} className={`btn ${mode === 'manuel' ? 'btn-primary' : 'btn-secondary'}`}>
                            <FaUserPlus /> Recherche
                        </button>
                    </div>
                    <hr />

                    {/* ── Mode assigné (opérateur) ── */}
                    {assignment ? (
                        <div className="assignment-info-card">
                            <div className="assignment-header">
                                <span className="assign-title"><FaLock /> Session Sécurisée</span>
                            </div>
                            <div className="assignment-details-row">
                                <div className="assign-field"><strong>Matière:</strong> {assignment.matiereNom}</div>
                                <div className="assign-field"><strong>Examen:</strong> {assignment.examen}</div>
                                <div className="assign-field" style={{ background: '#fff', padding: '5px 10px', borderRadius: '8px' }}>
                                    <strong>Population:</strong> {getPopulationLabel(assignment.population)}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* ✅ Sélecteur Promotion */}
                            <div className="form-group">
                                <label>Promotion</label>
                                <select
                                    value={selectedPromotion}
                                    onChange={e => {
                                        setSelectedPromotion(e.target.value);
                                        setSelectedTypeExamen('');
                                        setSelectedMatiereId('');
                                        setSelectedEscadron('');
                                        setSelectedPeloton('all');
                                        setAvailableMatieres([]);
                                    }}
                                    disabled={saisiesTemporaires.length > 0}
                                >
                                    <option value="">-- Toutes les promotions --</option>
                                    {promotionsList.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>

                            {/* ✅ Sélecteur Examen (filtré par promotion) */}
                            <div className="form-group">
                                <label>Examen</label>
                                <select
                                    value={selectedTypeExamen}
                                    onChange={e => {
                                        setSelectedTypeExamen(e.target.value);
                                        setSelectedMatiereId('');
                                        setAvailableMatieres([]);
                                    }}
                                    disabled={!selectedPromotion || saisiesTemporaires.length > 0}
                                >
                                    <option value="">-- Choisir --</option>
                                    {examTypes.map(ex => (
                                        <option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>
                                    ))}
                                </select>
                                {selectedPromotion && examTypes.length === 0 && (
                                    <small style={{ color: '#e53e3e' }}>
                                        Aucun examen configuré pour cette promotion.
                                    </small>
                                )}
                            </div>

                            {/* ✅ Sélecteur Matière (filtrée par examen + promotion) */}
                            <div className="form-group">
                                <label>Matière</label>
                                <select
                                    value={selectedMatiereId}
                                    onChange={e => setSelectedMatiereId(e.target.value)}
                                    disabled={!selectedTypeExamen || isMatiereLoading}
                                >
                                    <option value="">-- Choisir --</option>
                                    {availableMatieres.map(m => (
                                        <option key={m.id} value={m.id}>{m.nom_matiere}</option>
                                    ))}
                                </select>
                                {isMatiereLoading && <small style={{ color: '#718096' }}>Chargement des matières...</small>}
                                {!isMatiereLoading && selectedTypeExamen && availableMatieres.length === 0 && (
                                    <small style={{ color: '#e53e3e' }}>
                                        Aucune matière configurée pour cet examen / cette promotion.
                                    </small>
                                )}
                            </div>
                        </>
                    )}
                    {(selectedTypeExamen || assignment) && mesNotesParMatiere.length > 0 && (
                            <div className="mes-notes-matiere-box">
                                <h4><FaClipboardList /> Vos notes déjà saisies pour cet examen</h4>
                                {isLoadingMesNotes ? (
                                    <small style={{ color: '#718096' }}>Chargement...</small>
                                ) : (
                                    <div className="mes-notes-matiere-list">
                                        {mesNotesParMatiere.map(m => (
                                            <div
                                                key={m.matiere_id}
                                                className={`matiere-note-item ${m.notesSaisies > 0 ? 'has-notes' : ''}`}
                                            >
                                                <span className="matiere-nom">{m.nom_matiere}</span>
                                                <span className="matiere-count">{m.notesSaisies}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                    {/* Messages */}
                    {message && <div className="alert alert-success">{message}</div>}
                    {error && <div className="alert alert-danger">{error}</div>}

                    {/* ── Mode série ou manuel ── */}
                    {mode === 'serie' ? renderModeSerie() : (
                        <form onSubmit={handleSubmitNoteManuel}>
                            <div className="form-group search-container">
                                <label>Recherche Élève</label>
                                <input
                                    ref={rechercheEleveInputRef}
                                    type="text"
                                    value={rechercheEleve}
                                    onChange={e => { setRechercheEleve(e.target.value); setSelectedEleve(null); }}
                                    onFocus={() => setIsSearchFocused(true)}
                                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                                    placeholder="Nom ou N° Incorp..."
                                />
                                {isSearchFocused && elevesTrouves.length > 0 && (
                                    <div className="search-results">
                                        {elevesTrouves.map(e => (
                                            <div key={e.id} className="search-result-item"
                                                onMouseDown={() => {
                                                    setSelectedEleve(e);
                                                    setRechercheEleve(`${e.numero_incorporation} - ${e.nom}`);
                                                }}>
                                                {e.numero_incorporation} - {e.nom} {e.prenom}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                  {selectedEleve ? (
                                    <small style={{ color: '#38a169', display: 'block', marginTop: '4px' }}>
                                        ✓ Élève sélectionné : {selectedEleve.nom} {selectedEleve.prenom}
                                    </small>
                                ) : rechercheEleve.trim().length >= 2 && (
                                    <small style={{ color: '#e53e3e', display: 'block', marginTop: '4px' }}>
                                        ⚠ Veuillez cliquer sur un élève dans la liste pour le sélectionner.
                                    </small>
                                )}
                                                        </div>
                            
                           {isMatiereParcours ? (
                                    <ParcoursChronoForm onNoteCalculee={(n) => setNote(n)} resetSignal={parcoursResetSignal} />
                                ) : (
                                <div className="form-group">
                                    <label>Note / 20</label>
                                    <input
                                        ref={noteInputRef}
                                        type="number"
                                        value={note}
                                        onChange={e => setNote(e.target.value)}
                                        min="0" max="20" step="0.01"
                                        disabled={!selectedEleve}
                                        required
                                    />
                                </div>
                            )}
                         
                            <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={!selectedEleve || !selectedMatiereId || (isMatiereParcours && !note)}
                            >
                                <FaSave /> Ajouter
                            </button>
                        </form>
                    )}
                </>
            )}

            <style jsx>{`
                .assignment-info-card { background: #ebf8ff; border: 1px solid #90cdf4; border-radius: 12px; padding: 18px; margin-bottom: 25px; }
                .assignment-header { margin-bottom: 10px; border-bottom: 1px solid #bee3f8; padding-bottom: 5px; }
                .assign-title { color: #2c5282; font-weight: 700; display: flex; align-items: center; gap: 10px; }
                .assignment-details-row { display: flex; flex-wrap: wrap; gap: 20px; }
                .assign-field { padding: 4px 0; }
                .student-info-card { background: #f7fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 5px solid #3182ce; }
                .mode-selector { display: flex; gap: 10px; margin-bottom: 20px; }
                .search-container { position: relative; }
                .search-results { position: absolute; top: 100%; left: 0; right: 0; background: #fff; border: 1px solid #ccc; z-index: 1000; max-height: 150px; overflow-y: auto; border-radius: 0 0 6px 6px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .search-result-item { padding: 8px 12px; cursor: pointer; }
                .search-result-item:hover { background: #edf2f7; }
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
                .modal-content { background: #fff; padding: 20px; border-radius: 8px; width: 90%; max-width: 500px; }
                .modal-content.large { max-width: 800px; }
                .validation-badge { position: fixed; bottom: 20px; right: 20px; background: #3182ce; color: #fff; width: 50px; height: 50px; border-radius: 50%; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; z-index: 999; box-shadow: 0 4px 12px rgba(49,130,206,0.4); }
                .select-conseil { border: 2px solid #ed8936; background: #fffaf0; height: 45px; width: 100%; border-radius: 8px; }
                .conseil-selection-box { padding: 15px; background: #fff5f5; border-radius: 10px; border: 1px dashed #feb2b2; }
                .badge-statut { padding: 2px 6px; border-radius: 4px; font-size: 0.8rem; font-weight: bold; text-transform: uppercase; }
                .badge-statut.redoublant { background: #fed7d7; color: #9b2c2c; }
                .badge-statut.ajourne_3m, .badge-statut.ajourne_6m { background: #feebc8; color: #7b341e; }
                .saisie-serie-actions { display: flex; gap: 10px; margin-top: 15px; }
                .alert { padding: 10px 15px; border-radius: 6px; margin: 10px 0; }
                .alert-success { background: #c6f6d5; color: #276749; border: 1px solid #9ae6b4; }
                .alert-danger { background: #fed7d7; color: #9b2c2c; border: 1px solid #feb2b2; }
                .motif-display { display: flex; align-items: center; gap: 8px; color: #c05621; }
                .absence-row { background: #fff5f5; }
                .card-header-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
                .history-btn { background: transparent; border: 1px solid #cbd5e0; border-radius: 8px; padding: 8px; cursor: pointer; color: #4a5568; }
                .history-btn:hover { background: #edf2f7; }
                .parcours-chrono-box { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 15px; margin-bottom: 15px; }
                .parcours-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
                .parcours-table th { text-align: left; font-size: 0.85rem; color: #718096; padding-bottom: 6px; }
                .parcours-table td { padding: 4px 6px 4px 0; }
                .parcours-table input[type="time"] { width: 100%; padding: 6px; border: 1px solid #cbd5e0; border-radius: 6px; }
                .champ-absent { color: #cbd5e0; display: inline-block; text-align: center; width: 100%; }
                .parcours-result { display: flex; justify-content: space-between; background: #edf2f7; padding: 10px 14px; border-radius: 8px; font-size: 0.95rem; }
            `}</style>
        </div>
    );
};

export default SaisieDirecte;
