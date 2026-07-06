import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import {
    FaPlay, FaSave, FaUserPlus, FaUsers, FaArrowLeft, FaHistory,
    FaEdit, FaTrash, FaCheckCircle, FaUserSlash, FaClipboardList,
    FaInfoCircle, FaLock
} from 'react-icons/fa';
import apiPaths from '../config/apiPaths';

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
                            </div>
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
                            <button type="submit" className="btn btn-primary" disabled={!selectedEleve || !selectedMatiereId}>
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
            `}</style>
        </div>
    );
};

export default SaisieDirecte;
