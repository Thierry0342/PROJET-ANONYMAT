import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import {
    FaUserPlus, FaEdit, FaTrash, FaSearch, FaLock, FaTimes, FaSave,FaPrint
} from 'react-icons/fa';
import apiPaths from '../config/apiPaths';

// ─── Modal Ajout / Modification ────────────────────────────────────────────
const EleveFormModal = ({ eleve, onClose, onSave, isSaving, promotionsList }) => {
    const isEdit = !!eleve;
    const [form, setForm] = useState({
        nom: eleve?.nom || '',
        prenom: eleve?.prenom || '',
        numero_incorporation: eleve?.numero_incorporation || '',
        sexe: eleve?.sexe || '',
        escadron: eleve?.escadron || '',
        peloton: eleve?.peloton || '',
        promotion: eleve?.promotion || (promotionsList[0] || ''),
        statut: eleve?.statut || 'actif'
    });
    const [erreur, setErreur] = useState('');
    const nomRef = useRef(null);
    useEffect(() => { nomRef.current?.focus(); }, []);

    const handleChange = (champ, valeur) => setForm(prev => ({ ...prev, [champ]: valeur }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.nom.trim() || !form.numero_incorporation.trim()) {
            setErreur("Le nom et le numéro d'incorporation sont requis.");
            return;
        }
        setErreur('');
        onSave(form, eleve?.id);
    };

    return (
        <div className="modal-overlay fiche-overlay" onClick={onClose}>
    <div className="modal-content fiche-notes-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{isEdit ? `Modifier ${eleve.nom} ${eleve.prenom}` : 'Ajouter un élève'}</h3>
                    <button className="close-button" onClick={onClose}><FaTimes /></button>
                </div>
                <form onSubmit={handleSubmit}>
                    <div className="modal-body">
                        <div className="form-row">
                            <div className="form-group">
                                <label>Nom *</label>
                                <input ref={nomRef} type="text" value={form.nom}
                                    onChange={e => handleChange('nom', e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Prénom</label>
                                <input type="text" value={form.prenom}
                                    onChange={e => handleChange('prenom', e.target.value)} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>N° Incorporation *</label>
                                <input type="text" value={form.numero_incorporation}
                                    onChange={e => handleChange('numero_incorporation', e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Sexe</label>
                                <select value={form.sexe} onChange={e => handleChange('sexe', e.target.value)}>
                                    <option value="">--</option>
                                    <option value="masculin">Masculin</option>
                                    <option value="feminin">Féminin</option>
                                </select>
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Escadron</label>
                                <input type="text" value={form.escadron}
                                    onChange={e => handleChange('escadron', e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Peloton</label>
                                <input type="text" value={form.peloton}
                                    onChange={e => handleChange('peloton', e.target.value)} />
                            </div>
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label>Promotion</label>
                                <input type="text" list="promotions-datalist" value={form.promotion}
                                    onChange={e => handleChange('promotion', e.target.value)}
                                    placeholder="Ex: 79E" />
                                <datalist id="promotions-datalist">
                                    {promotionsList.map(p => <option key={p} value={p} />)}
                                </datalist>
                            </div>
                            <div className="form-group">
                                <label>Statut</label>
                                <select value={form.statut} onChange={e => handleChange('statut', e.target.value)}>
                                    <option value="actif">Actif</option>
                                    <option value="redoublant">Redoublant</option>
                                    <option value="ajourne_3m">Ajourné 3 Mois</option>
                                    <option value="ajourne_6m">Ajourné 6 Mois</option>
                                    <option value="radie">Radié</option>
                                </select>
                            </div>
                        </div>
                        {erreur && <div className="alert alert-danger">{erreur}</div>}
                    </div>
                    <div className="modal-actions">
                        <button type="submit" className="btn btn-primary" disabled={isSaving}>
                            <FaSave /> {isSaving ? 'Enregistrement...' : 'Enregistrer'}
                        </button>
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ─── Modal Confirmation suppression ────────────────────────────────────────
const ConfirmDeleteModal = ({ eleve, onConfirm, onCancel, isDeleting }) => (
    <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
                <h3>Confirmer la suppression</h3>
                <button className="close-button" onClick={onCancel}><FaTimes /></button>
            </div>
            <div className="modal-body">
                <p>
                    Voulez-vous vraiment supprimer <strong>{eleve.nom} {eleve.prenom}</strong> (N° {eleve.numero_incorporation}) ?
                </p>
                <p style={{ color: '#e53e3e', fontSize: '0.9rem' }}>
                    Cette action est irréversible.
                </p>
            </div>
            <div className="modal-actions">
                <button className="btn btn-danger" onClick={onConfirm} disabled={isDeleting}>
                    <FaTrash /> {isDeleting ? 'Suppression...' : 'Supprimer'}
                </button>
                <button className="btn btn-secondary" onClick={onCancel}>Annuler</button>
            </div>
        </div>
    </div>
);
// ─── Modal Fiche de notes détaillée (clic sur une ligne, admin uniquement) ─
const FicheNotesEleveModal = ({ eleveId, onClose, getAuthHeaders }) => {
    const [data, setData] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [filtreExamen, setFiltreExamen] = useState('all');
    const [filtreMatiere, setFiltreMatiere] = useState('all');

    useEffect(() => {
        const fetchDetails = async () => {
            setIsLoading(true);
            setError('');
            try {
                const res = await axios.get(`/api/eleves/${eleveId}/notes-detaillees`, getAuthHeaders());
                setData(res.data);
            } catch (err) {
                setError(err.response?.data?.message || "Erreur lors du chargement des notes.");
            } finally {
                setIsLoading(false);
            }
        };
        if (eleveId) fetchDetails();
    }, [eleveId, getAuthHeaders]);

    const typesExamen = useMemo(() => {
        if (!data) return [];
        return [...new Set(data.notes.map(n => n.type_examen).filter(Boolean))].sort();
    }, [data]);

    const matieres = useMemo(() => {
        if (!data) return [];
        const map = new Map();
        data.notes.forEach(n => map.set(n.matiere_id, n.nom_matiere));
        return [...map.entries()].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
    }, [data]);

    const notesFiltrees = useMemo(() => {
        if (!data) return [];
        return data.notes.filter(n => {
            if (filtreExamen !== 'all' && n.type_examen !== filtreExamen) return false;
            if (filtreMatiere !== 'all' && String(n.matiere_id) !== String(filtreMatiere)) return false;
            return true;
        }).sort((a, b) => (a.nom_matiere || '').localeCompare(b.nom_matiere || '', 'fr'));
    }, [data, filtreExamen, filtreMatiere]);

    const absencesFiltrees = useMemo(() => {
        if (!data) return [];
        return data.absences.filter(a => {
            if (filtreExamen !== 'all' && a.type_examen !== filtreExamen) return false;
            if (filtreMatiere !== 'all' && String(a.matiere_id) !== String(filtreMatiere)) return false;
            return true;
        });
    }, [data, filtreExamen, filtreMatiere]);

    const moyenneAffichee = useMemo(() => {
        if (notesFiltrees.length === 0) return null;
        const somme = notesFiltrees.reduce((s, n) => s + parseFloat(n.note), 0);
        return (somme / notesFiltrees.length).toFixed(2);
    }, [notesFiltrees]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content fiche-notes-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header no-print">
                    <h3>Fiche de notes {data ? `- ${data.eleve.nom} ${data.eleve.prenom}` : ''}</h3>
                    <button className="close-button" onClick={onClose}><FaTimes /></button>
                </div>

                {isLoading && <p className="no-print">Chargement...</p>}
                {error && <div className="alert alert-danger no-print">{error}</div>}

                {data && (
                    <div className="print-area">
                        <div className="fiche-entete">
                            <h2>{data.eleve.nom} {data.eleve.prenom}</h2>
                            <p>
                                N° {data.eleve.numero_incorporation} — Escadron {data.eleve.escadron || '-'} / Peloton {data.eleve.peloton || '-'}
                                {data.eleve.promotion ? ` — Promotion ${data.eleve.promotion}` : ''}
                            </p>
                        </div>

                        <div className="filtres-box no-print">
                            <div className="form-group">
                                <label>Type d'examen</label>
                                <select value={filtreExamen} onChange={e => setFiltreExamen(e.target.value)}>
                                    <option value="all">Tous</option>
                                    {typesExamen.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Matière</label>
                                <select value={filtreMatiere} onChange={e => setFiltreMatiere(e.target.value)}>
                                    <option value="all">Toutes</option>
                                    {matieres.map(m => <option key={m.id} value={m.id}>{m.nom}</option>)}
                                </select>
                            </div>
                        </div>

                        <table className="results-table">
                            <thead>
                                <tr>
                                    <th>Matière</th>
                                    <th>Type d'examen</th>
                                    <th>Note / 20</th>
                                    <th>Date de saisie</th>
                                </tr>
                            </thead>
                            <tbody>
                                {notesFiltrees.length > 0 ? notesFiltrees.map(n => (
                                    <tr key={n.id}>
                                        <td>{n.nom_matiere}</td>
                                        <td>{n.type_examen}</td>
                                        <td>{parseFloat(n.note).toFixed(2)}</td>
                                        <td>{n.note_saisie_a ? new Date(n.note_saisie_a).toLocaleDateString('fr-FR') : '-'}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={4}>Aucune note pour ces critères.</td></tr>
                                )}
                            </tbody>
                            {moyenneAffichee && (
                                <tfoot>
                                    <tr>
                                        <td colSpan={2} style={{ fontWeight: 'bold' }}>Moyenne (simple, sur la sélection)</td>
                                        <td style={{ fontWeight: 'bold' }}>{moyenneAffichee}</td>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>

                        {absencesFiltrees.length > 0 && (
                            <>
                                <h4 className="absences-titre">Absences déclarées</h4>
                                <table className="results-table">
                                    <thead>
                                        <tr>
                                            <th>Matière</th>
                                            <th>Type d'examen</th>
                                            <th>Motif</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {absencesFiltrees.map((a, i) => (
                                            <tr key={i}>
                                                <td>{a.nom_matiere}</td>
                                                <td>{a.type_examen || '-'}</td>
                                                <td>{a.motif || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </>
                        )}
                    </div>
                )}

                <div className="modal-actions no-print">
                    <button className="btn btn-primary" onClick={() => window.print()} disabled={!data}>
                        <FaPrint /> Imprimer
                    </button>
                    <button className="btn btn-secondary" onClick={onClose}>Fermer</button>
                </div>
            </div>

            <style jsx>{`
    .fiche-overlay {
        background: transparent;
        padding: 0;
    }
    .fiche-notes-modal {
        max-width: 100%;
        width: 100%;
        height: 100vh;
        max-height: 100vh;
        margin: 0;
        border-radius: 0;
        display: flex;
        flex-direction: column;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 0 0 1px #e2e8f0, 0 10px 30px rgba(0,0,0,0.15);
    }
    .fiche-notes-modal .modal-header {
        position: sticky;
        top: 0;
        background: #fff;
        z-index: 2;
        padding: 16px 24px;
        border-bottom: 1px solid #e2e8f0;
        margin-bottom: 0;
        flex-shrink: 0;
    }
    .fiche-notes-modal .modal-header h3 {
        margin: 0;
        font-size: 1.1rem;
    }
    .fiche-notes-modal .print-area {
        overflow-y: auto;
        padding: 20px 24px;
        flex: 1;
        max-width: 900px;
        margin: 0 auto;
        width: 100%;
    }
    .fiche-notes-modal .modal-actions {
        flex-shrink: 0;
        padding: 12px 24px;
        border-top: 1px solid #e2e8f0;
        margin-top: 0;
    }
    .fiche-entete { text-align: center; margin-bottom: 16px; }
    .fiche-entete h2 { margin: 0 0 4px 0; font-size: 1.25rem; }
    .fiche-entete p { margin: 0; color: #718096; font-size: 0.9rem; }
    .absences-titre { margin-top: 20px; margin-bottom: 8px; }

    .fiche-notes-modal .filtres-box {
        position: sticky;
        top: 0;
        z-index: 1;
        background: #f7fafc;
    }
    .fiche-notes-modal .results-table { font-size: 0.9rem; }
    .fiche-notes-modal .results-table th,
    .fiche-notes-modal .results-table td { padding: 8px 10px; }
`}</style>
            <style jsx global>{`
                @media print {
                    body * { visibility: hidden; }
                    .print-area, .print-area * { visibility: visible; }
                    .print-area { position: absolute; top: 0; left: 0; width: 100%; padding: 20px; }
                    .no-print { display: none !important; }
                }
            `}</style>
        </div>
    );
};
// ─── Composant principal ───────────────────────────────────────────────────
const ListeEleves = () => {
    const [isAdmin, setIsAdmin] = useState(false);
    const [allEleves, setAllEleves] = useState([]);
    const [promotionsList, setPromotionsList] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('');
    const [selectedEscadron, setSelectedEscadron] = useState('all');
    const [selectedPeloton, setSelectedPeloton] = useState('all');
    const [rechercheTexte, setRechercheTexte] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingEleve, setEditingEleve] = useState(null);
    const [deletingEleve, setDeletingEleve] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
const [eleveNotesSelectionne, setEleveNotesSelectionne] = useState(null);
    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (token) {
            try {
                const decoded = jwtDecode(token);
                setIsAdmin(decoded.role === 'admin');
            } catch (e) { /* ignore */ }
        }
    }, []);

    // ── Chargement initial des promotions ──────────────────────────────────
    useEffect(() => {
        const fetchPromotions = async () => {
            try {
                const res = await axios.get('/api/promotions', getAuthHeaders());
                const list = res.data || [];
                setPromotionsList(list);
                if (list.length > 0) setSelectedPromotion(list[0]);
                else setIsLoading(false);
            } catch (err) {
                setError("Erreur lors du chargement des promotions.");
                setIsLoading(false);
            }
        };
        fetchPromotions();
    }, [getAuthHeaders]);

    // ── Chargement des élèves selon la promotion sélectionnée ──────────────
    const fetchEleves = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const params = {};
            if (selectedPromotion) params.promotion = selectedPromotion;
            const res = await axios.get(apiPaths.eleves.base, { params, ...getAuthHeaders() });
            setAllEleves(res.data);
        } catch (err) {
            setError("Erreur lors du chargement des élèves.");
        } finally {
            setIsLoading(false);
        }
    }, [selectedPromotion, getAuthHeaders]);

    useEffect(() => {
        if (selectedPromotion || promotionsList.length === 0) fetchEleves();
    }, [selectedPromotion, fetchEleves, promotionsList.length]);

    // ── Escadrons / Pelotons dérivés de la liste chargée ────────────────────
    const escadrons = useMemo(() => {
        return [...new Set(allEleves.map(e => e.escadron).filter(Boolean))]
            .sort((a, b) => a - b);
    }, [allEleves]);

    const pelotons = useMemo(() => {
        if (selectedEscadron === 'all') return [];
        return [...new Set(
            allEleves.filter(e => String(e.escadron) === String(selectedEscadron))
                .map(e => e.peloton).filter(Boolean)
        )].sort((a, b) => a - b);
    }, [allEleves, selectedEscadron]);

    // ── Filtrage final (escadron / peloton / recherche texte) ──────────────
    const elevesFiltres = useMemo(() => {
        let liste = allEleves;
        if (selectedEscadron !== 'all') {
            liste = liste.filter(e => String(e.escadron) === String(selectedEscadron));
        }
        if (selectedPeloton !== 'all') {
            liste = liste.filter(e => String(e.peloton) === String(selectedPeloton));
        }
        if (rechercheTexte.trim().length >= 1) {
            const q = rechercheTexte.trim().toLowerCase();
            liste = liste.filter(e =>
                (e.numero_incorporation || '').toLowerCase().includes(q) ||
                `${e.nom} ${e.prenom}`.toLowerCase().includes(q) ||
                `${e.prenom} ${e.nom}`.toLowerCase().includes(q)
            );
        }
        return [...liste].sort((a, b) => {
            const escA = parseInt(a.escadron) || 0;
            const escB = parseInt(b.escadron) || 0;
            if (escA !== escB) return escA - escB;
            const pelA = parseInt(a.peloton) || 0;
            const pelB = parseInt(b.peloton) || 0;
            if (pelA !== pelB) return pelA - pelB;
            return (a.nom || '').localeCompare(b.nom || '', 'fr');
        });
    }, [allEleves, selectedEscadron, selectedPeloton, rechercheTexte]);

    // ── Actions CRUD (admin) ────────────────────────────────────────────────
    const handleSaveEleve = async (form, id) => {
        setIsSaving(true);
        setError('');
        try {
            if (id) {
                await axios.put(`/api/eleves/${id}`, form, getAuthHeaders());
                setMessage("Élève modifié avec succès.");
            } else {
                await axios.post(apiPaths.eleves.base, form, getAuthHeaders());
                setMessage("Élève ajouté avec succès.");
            }
            setIsAddModalOpen(false);
            setEditingEleve(null);
            await fetchEleves();
            setTimeout(() => setMessage(''), 4000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de l'enregistrement.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmDelete = async () => {
        if (!deletingEleve) return;
        setIsDeleting(true);
        setError('');
        try {
            await axios.delete(`/api/eleves/${deletingEleve.id}`, getAuthHeaders());
            setMessage("Élève supprimé avec succès.");
            setDeletingEleve(null);
            await fetchEleves();
            setTimeout(() => setMessage(''), 4000);
        } catch (err) {
            setError(err.response?.data?.message || "Erreur lors de la suppression.");
            setDeletingEleve(null);
        } finally {
            setIsDeleting(false);
        }
    };

    const getStatutLabel = (statut) => {
        switch (statut) {
            case 'redoublant': return 'Redoublant';
            case 'ajourne_3m': return 'Ajourné 3M';
            case 'ajourne_6m': return 'Ajourné 6M';
            case 'radie': return 'Radié';
            default: return 'Actif';
        }
    };

    return (
        <div className="card liste-eleves-card">
            {isAddModalOpen && (
                <EleveFormModal
                    eleve={null}
                    promotionsList={promotionsList}
                    isSaving={isSaving}
                    onClose={() => setIsAddModalOpen(false)}
                    onSave={handleSaveEleve}
                />
            )}
            {editingEleve && (
                <EleveFormModal
                    eleve={editingEleve}
                    promotionsList={promotionsList}
                    isSaving={isSaving}
                    onClose={() => setEditingEleve(null)}
                    onSave={handleSaveEleve}
                />
            )}
            {deletingEleve && (
                <ConfirmDeleteModal
                    eleve={deletingEleve}
                    isDeleting={isDeleting}
                    onConfirm={handleConfirmDelete}
                    onCancel={() => setDeletingEleve(null)}
                />
            )}
            {eleveNotesSelectionne && (
                <FicheNotesEleveModal
                    eleveId={eleveNotesSelectionne.id}
                    onClose={() => setEleveNotesSelectionne(null)}
                    getAuthHeaders={getAuthHeaders}
                />
            )}

            <div className="card-header-actions">
                <h2>Liste des Élèves</h2>
                {isAdmin ? (
                    <button className="btn btn-primary" onClick={() => setIsAddModalOpen(true)}>
                        <FaUserPlus /> Ajouter un élève
                    </button>
                ) : (
                    <span className="readonly-badge"><FaLock /> Lecture seule</span>
                )}
            </div>

            {message && <div className="alert alert-success">{message}</div>}
            {error && <div className="alert alert-danger">{error}</div>}

            <div className="filtres-box">
                <div className="form-group">
                    <label>Promotion</label>
                    <select value={selectedPromotion} onChange={e => {
                        setSelectedPromotion(e.target.value);
                        setSelectedEscadron('all');
                        setSelectedPeloton('all');
                    }}>
                        <option value="">-- Toutes les promotions --</option>
                        {promotionsList.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label>Escadron</label>
                    <select value={selectedEscadron} onChange={e => {
                        setSelectedEscadron(e.target.value);
                        setSelectedPeloton('all');
                    }}>
                        <option value="all">Tous</option>
                        {escadrons.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label>Peloton</label>
                    <select value={selectedPeloton} onChange={e => setSelectedPeloton(e.target.value)}
                        disabled={selectedEscadron === 'all'}>
                        <option value="all">Tous</option>
                        {pelotons.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                <div className="form-group search-group">
                    <label>Recherche</label>
                    <div className="search-input-wrapper">
                        <FaSearch className="search-icon" />
                        <input type="text" value={rechercheTexte}
                            onChange={e => setRechercheTexte(e.target.value)}
                            placeholder="Nom ou N° Incorporation..." />
                    </div>
                </div>
            </div>

            <div className="resultats-count">
                {isLoading ? 'Chargement...' : `${elevesFiltres.length} élève(s) trouvé(s)`}
            </div>

            {!isLoading && (
                <div className="table-responsive">
                    <table className="results-table">
                        <thead>
                            <tr>
                                <th>N° Incorp.</th>
                                <th>Nom</th>
                                <th>Prénom</th>
                                <th>Sexe</th>
                                <th>Escadron</th>
                                <th>Peloton</th>
                                <th>Promotion</th>
                                <th>Statut</th>
                                {isAdmin && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {elevesFiltres.length > 0 ? elevesFiltres.map(eleve => (
                                <tr
                                        key={eleve.id}
                                        className={isAdmin ? 'clickable-row' : ''}
                                        onClick={() => isAdmin && setEleveNotesSelectionne(eleve)}
                                    >
                                    
                                    <td>{eleve.numero_incorporation}</td>
                                    <td>{eleve.nom}</td>
                                    <td>{eleve.prenom}</td>
                                    <td>{eleve.sexe === 'feminin' ? 'F' : eleve.sexe === 'masculin' ? 'M' : '-'}</td>
                                    <td>{eleve.escadron || '-'}</td>
                                    <td>{eleve.peloton || '-'}</td>
                                    <td>{eleve.promotion || '-'}</td>
                                    <td>
                                        <span className={`badge-statut ${eleve.statut || 'actif'}`}>
                                            {getStatutLabel(eleve.statut)}
                                        </span>
                                    </td>
                                                                       

                                </tr>
                            )) : (
                                <tr><td colSpan={isAdmin ? 9 : 8}>Aucun élève trouvé pour ces critères.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            <style jsx>{`
                .liste-eleves-card { max-width: 1200px; margin: 0 auto; }
                .card-header-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
                .readonly-badge { display: flex; align-items: center; gap: 8px; color: #718096; background: #f7fafc; padding: 8px 14px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 0.9rem; }
                .filtres-box { display: flex; flex-wrap: wrap; gap: 16px; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 16px; }
                .filtres-box .form-group { flex: 1; min-width: 160px; margin-bottom: 0; }
                .search-group { flex: 2; min-width: 220px; }
                .search-input-wrapper { position: relative; }
                .search-input-wrapper .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #a0aec0; }
                .search-input-wrapper input { padding-left: 32px; width: 100%; }
                .resultats-count { color: #718096; font-size: 0.9rem; margin-bottom: 10px; }
                .table-responsive { overflow-x: auto; }
                .results-table { width: 100%; border-collapse: collapse; }
                .results-table th, .results-table td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: left; }
                .results-table th { background: #f7fafc; font-size: 0.85rem; color: #4a5568; text-transform: uppercase; }
                .actions-cell { display: flex; gap: 8px; }
                .btn-icon { background: transparent; border: none; cursor: pointer; padding: 6px; border-radius: 6px; font-size: 1rem; }
                .btn-edit { color: #3182ce; }
                .btn-edit:hover { background: #ebf8ff; }
                .btn-delete { color: #e53e3e; }
                .btn-delete:hover { background: #fff5f5; }
                .badge-statut { padding: 2px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: bold; text-transform: uppercase; }
                .badge-statut.actif { background: #c6f6d5; color: #276749; }
                .badge-statut.redoublant { background: #fed7d7; color: #9b2c2c; }
                .badge-statut.ajourne_3m, .badge-statut.ajourne_6m { background: #feebc8; color: #7b341e; }
                .badge-statut.radie { background: #e2e8f0; color: #4a5568; }
                .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
                .modal-content { background: #fff; padding: 20px; border-radius: 8px; width: 90%; max-width: 550px; }
                .modal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
                .close-button { background: transparent; border: none; font-size: 1.1rem; cursor: pointer; color: #718096; }
                .modal-actions { display: flex; gap: 10px; margin-top: 16px; }
                .form-row { display: flex; gap: 14px; }
                .form-row .form-group { flex: 1; }
                .alert { padding: 10px 15px; border-radius: 6px; margin: 10px 0; }
                .alert-success { background: #c6f6d5; color: #276749; border: 1px solid #9ae6b4; }
                .alert-danger { background: #fed7d7; color: #9b2c2c; border: 1px solid #feb2b2; }
                .clickable-row { cursor: pointer; }
                .clickable-row:hover { background: #ebf8ff; }
            `}</style>
        </div>
    );
};

export default ListeEleves;
