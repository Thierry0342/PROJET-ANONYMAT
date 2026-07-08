import React, { useState, useEffect, useMemo, useRef } from 'react';
import axios from 'axios';
import ConfigurationModal from './ConfigurationModal';
import ClassementModal from './ClassementModal';
import ElevesSansNoteModal from './ElevesSansNoteModal';
import './Resultats.css';
import './Typewriter.css';

const IconEdit = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>;
const IconTrash = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>;
const IconHistory = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>;
const IconSearch = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const IconRefresh = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>;
const IconExport = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>;
const IconSettings = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1-2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
const IconUserX = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>;
const IconMoreVertical = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>;
const IconCalculator = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect><line x1="8" y1="6" x2="16" y2="6"></line><line x1="16" y1="14" x2="16" y2="18"></line><path d="M16 10h.01"></path><path d="M12 10h.01"></path><path d="M8 10h.01"></path><path d="M12 14h.01"></path><path d="M8 14h.01"></path><path d="M12 18h.01"></path><path d="M8 18h.01"></path></svg>;

const HistoryModal = ({ resultat, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (resultat?.copie_id) {
            const token = localStorage.getItem('token');
            axios.get(`/api/resultats/${resultat.copie_id}/historique`, { headers: { Authorization: `Bearer ${token}` } })
                .then(response => setHistory(response.data))
                .catch(() => setHistory([]))
                .finally(() => setLoading(false));
        }
    }, [resultat]);
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content history-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Historique : {resultat.prenom} {resultat.nom}</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {loading ? <p>Chargement...</p> : (
                        <div className="history-list">
                            {history.length > 0 ? history.map((item, index) => (
                                <div key={index} className="history-item">
                                    <div className="history-meta">
                                        <strong>{item.modifie_par}</strong><br />
                                        <span>Le {new Date(item.date_modification).toLocaleString('fr-FR')}</span>
                                    </div>
                                    <p className="history-motif"><strong>Motif :</strong> {item.motif}</p>
                                </div>
                            )) : <p>Aucun historique trouvé.</p>}
                        </div>
                    )}
                </div>
                <div className="modal-actions">
                    <button className="btn-cancel" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
};

const ModificationModal = ({ resultat, onClose, onSave }) => {
    const [nouvelleNote, setNouvelleNote] = useState(resultat.note || '');
    const [raison, setRaison] = useState('');
    const handleSave = () => {
        const noteNum = parseFloat(nouvelleNote);
        if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) { alert("Note valide entre 0 et 20."); return; }
        if (!raison.trim()) { alert("Raison obligatoire."); return; }
        onSave(resultat.copie_id, nouvelleNote, `Modification: ${resultat.note} -> ${nouvelleNote}. Raison: ${raison}`);
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Modifier la note</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="form-group"><label>Élève</label><input type="text" value={`${resultat.prenom} ${resultat.nom}`} disabled /></div>
                    <div className="form-group"><label>Nouvelle Note</label><input type="number" min="0" max="20" step="0.25" value={nouvelleNote} onChange={e => setNouvelleNote(e.target.value)} /></div>
                    <div className="form-group"><label>Raison</label><textarea rows="3" value={raison} onChange={e => setRaison(e.target.value)}></textarea></div>
                </div>
                <div className="modal-actions">
                    <button className="btn-save" onClick={handleSave}>Enregistrer</button>
                    <button className="btn-cancel" onClick={onClose}>Annuler</button>
                </div>
            </div>
        </div>
    );
};

const ExportAnimation = () => (
    <div className="export-overlay">
        <div>
            <div className="typewriter">
                <div className="slide"><i></i></div>
                <div className="paper"></div>
                <div className="keyboard"></div>
            </div>
            <p>Génération en cours...</p>
        </div>
    </div>
);

const ExportModal = ({ onExport, onCancel }) => (
    <div className="modal-overlay" onClick={onCancel}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><h3>Exporter les résultats</h3></div>
            <div className="modal-body" style={{ textAlign: 'center', padding: '2rem' }}>
                <button className="btn-excel" onClick={() => onExport('excel')} style={{ marginRight: '10px' }}>Excel</button>
                <button className="btn-pdf" onClick={() => onExport('pdf')}>PDF</button>
            </div>
            <div className="modal-actions">
                <button className="btn-cancel" onClick={onCancel}>Annuler</button>
            </div>
        </div>
    </div>
);

const SelectionClassementModal = ({ onSelect, onClose, examTypes, selectedPromotion }) => {
    const modeles = ['General', ...examTypes.map(et => et.nom_modele)];
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Choisir le modèle</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {selectedPromotion && (
                        <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '10px' }}>
                            Promotion sélectionnée : <strong>{selectedPromotion}</strong>
                        </p>
                    )}
                    <div className="selection-classement-grid">
                        {modeles.map(m => (
                            <button key={m} className="btn-modele" onClick={() => onSelect(m)}>
                                Classement {m}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="modal-actions">
                    <button className="btn-cancel" onClick={onClose}>Annuler</button>
                </div>
            </div>
        </div>
    );
};

function Resultats() {
    const [resultats, setResultats]                         = useState([]);
    const [matieres, setMatieres]                           = useState([]);
    const [examTypes, setExamTypes]                         = useState([]);
    const [promotions, setPromotions]                       = useState([]);
    const [loading, setLoading]                             = useState(true);

    // ✅ selectedPromotion initialisé à '' — sera mis à jour dès que les
    //    promotions arrivent (premier élément = plus récente car ORDER BY DESC)
    const [selectedPromotion, setSelectedPromotion]         = useState('');
    const [selectedMatiere, setSelectedMatiere]             = useState('');
    const [selectedTypeExamen, setSelectedTypeExamen]       = useState('');
    const [searchTerm, setSearchTerm]                       = useState('');
    const [currentPage, setCurrentPage]                     = useState(1);
    const [resultsPerPage]                                  = useState(10);
    const [editingResult, setEditingResult]                 = useState(null);
    const [viewingHistoryOf, setViewingHistoryOf]           = useState(null);
    const [isExporting, setIsExporting]                     = useState(false);
    const [isExportModalOpen, setIsExportModalOpen]         = useState(false);
    const [isConfigModalOpen, setIsConfigModalOpen]         = useState(false);
    const [isSelectionClassementOpen, setIsSelectionClassementOpen] = useState(false);
    const [selectedModeleClassement, setSelectedModeleClassement]   = useState(null);
    const [isResultatClassementOpen, setIsResultatClassementOpen]   = useState(false);
    const [isElevesSansNoteModalOpen, setIsElevesSansNoteModalOpen] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen]           = useState(false);
    const [showSuggestions, setShowSuggestions]             = useState(false);

    const actionMenuRef       = useRef(null);
    const searchContainerRef  = useRef(null);

    // ── Chargement initial ────────────────────────────────────────────────────
    const fetchAllData = (promoToSelect) => {
        setLoading(true);
        const token  = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };

        Promise.all([
            axios.get('/api/resultats', config),
            axios.get('/api/matieres', config),
            axios.get('/api/examens', config),
            axios.get('/api/promotions', config),
        ]).then(([resRes, resMat, resExam, resProm]) => {
            setResultats(resRes.data);
            setMatieres(resMat.data);
            setExamTypes(resExam.data);

            const liste = resProm.data || [];
            setPromotions(liste);

            // ✅ Sélectionner automatiquement la dernière promotion
            //    (liste triée DESC côté backend → index 0 = plus récente)
            if (liste.length > 0) {
                const derniere = promoToSelect || liste[0];
                setSelectedPromotion(derniere);
            }
        }).catch(err => console.error(err))
          .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchAllData();
    }, []);

useEffect(() => {
    if (!selectedPromotion) return;
    const token = localStorage.getItem('token');
    axios.get(`/api/examens?promotion=${selectedPromotion}`, {
        headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
        setExamTypes(res.data);
        // Reset le type examen si plus disponible dans cette promo
        setSelectedTypeExamen(prev => {
            const exists = res.data.find(e => e.nom_modele === prev);
            return exists ? prev : '';
        });
        setCurrentPage(1);
    }).catch(err => console.error(err));
}, [selectedPromotion]);
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (actionMenuRef.current && !actionMenuRef.current.contains(event.target))
                setIsActionMenuOpen(false);
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target))
                setShowSuggestions(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Actions ───────────────────────────────────────────────────────────────
    const handleGenererStatistiques = () => {
        const token = localStorage.getItem('token');
        setIsActionMenuOpen(false);
        setLoading(true);
        axios.post('/api/resultats/generer-statistiques', {}, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => alert(res.data.message))
            .catch(() => alert("Erreur"))
            .finally(() => setLoading(false));
    };

    const handleSaveModification = (copieId, nouvelleNote, motif) => {
        const token = localStorage.getItem('token');
        axios.put(`/api/resultats/${copieId}`, { nouvelle_note: nouvelleNote, motif },
            { headers: { Authorization: `Bearer ${token}` } })
            .then(() => { fetchAllData(selectedPromotion); setEditingResult(null); })
            .catch(() => alert("Erreur"));
    };

    const handleDelete = (copieId, nomEleve) => {
        if (window.confirm(`Supprimer la note de ${nomEleve} ?`)) {
            const token = localStorage.getItem('token');
            axios.delete(`/api/resultats/${copieId}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(() => fetchAllData(selectedPromotion));
        }
    };

    const handleExport = (format) => {
        setIsExportModalOpen(false);
        setIsExporting(true);
        const token = localStorage.getItem('token');
        const url = format === 'excel'
            ? `/api/resultats/exporter?matiereId=${selectedMatiere}`
            : `/api/resultats/generer-document-pdf`;
        axios({
            url,
            method: format === 'excel' ? 'GET' : 'POST',
            data: { matiereId: selectedMatiere },
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob',
        }).then(response => {
            const href = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = href;
            link.setAttribute('download', `Notes.${format === 'excel' ? 'xlsx' : 'pdf'}`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }).finally(() => setTimeout(() => setIsExporting(false), 2000));
    };

    // ── Filtres ───────────────────────────────────────────────────────────────
    const filteredResults = useMemo(() => {
        let results = resultats;
        if (selectedMatiere)    results = results.filter(r => r.matiere_id === parseInt(selectedMatiere, 10));
        if (selectedTypeExamen) results = results.filter(r => r.type_examen === selectedTypeExamen);
        if (selectedPromotion)  results = results.filter(r => r.promotion === selectedPromotion);
        if (searchTerm) {
            const low = searchTerm.toLowerCase().trim();
            results = results.filter(r => {
                const fullName = `${r.prenom} ${r.nom}`.toLowerCase();
                const inc = r.numero_incorporation?.toString() || '';
                return fullName.includes(low) || inc.includes(low);
            });
        }
        return results;
    }, [resultats, selectedMatiere, selectedTypeExamen, selectedPromotion, searchTerm]);

    const suggestions = useMemo(() => {
        if (!searchTerm || searchTerm.length < 1) return [];
        const low  = searchTerm.toLowerCase();
        const seen = new Set();
        return resultats.filter(r => {
            const fullName = `${r.prenom} ${r.nom}`.toLowerCase();
            const inc      = r.numero_incorporation?.toString() || '';
            if ((fullName.includes(low) || inc.includes(low)) && !seen.has(fullName)) {
                seen.add(fullName);
                return true;
            }
            return false;
        }).slice(0, 5);
    }, [resultats, searchTerm]);

    const currentResults = filteredResults.slice(
        (currentPage - 1) * resultsPerPage,
        currentPage * resultsPerPage
    );
    const totalPages = Math.ceil(filteredResults.length / resultsPerPage);

    if (loading) return <div className="loader">Chargement...</div>;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="container-fluid">
            {isExporting && <ExportAnimation />}
            {isExportModalOpen && <ExportModal onExport={handleExport} onCancel={() => setIsExportModalOpen(false)} />}
            {editingResult && (
                <ModificationModal
                    resultat={editingResult}
                    onClose={() => setEditingResult(null)}
                    onSave={handleSaveModification}
                />
            )}
            {viewingHistoryOf && (
                <HistoryModal
                    resultat={viewingHistoryOf}
                    onClose={() => setViewingHistoryOf(null)}
                />
            )}

            {isConfigModalOpen && (
                <ConfigurationModal
                    matieres={matieres}
                    promotions={promotions}
                    // ✅ Passe la promotion actuellement sélectionnée au modal
                    defaultPromotion={selectedPromotion}
                    onClose={() => { setIsConfigModalOpen(false); fetchAllData(selectedPromotion); }}
                />
            )}

            {isSelectionClassementOpen && (
                <SelectionClassementModal
                    examTypes={examTypes}
                    selectedPromotion={selectedPromotion}
                    onSelect={m => {
                        setSelectedModeleClassement(m);
                        setIsSelectionClassementOpen(false);
                        setIsResultatClassementOpen(true);
                    }}
                    onClose={() => setIsSelectionClassementOpen(false)}
                />
            )}

            {isResultatClassementOpen && (
                <ClassementModal
                    modeleExamen={selectedModeleClassement}
                    promotion={selectedPromotion}
                    onClose={() => setIsResultatClassementOpen(false)}
                />
            )}

            {isElevesSansNoteModalOpen && (
                <ElevesSansNoteModal
                    onClose={() => setIsElevesSansNoteModalOpen(false)}
                    matiereId={selectedMatiere}
                    typeExamen={selectedTypeExamen}
                    promotion={selectedPromotion}
                />
            )}

            <div className="page-header">
                <h2>Résultats des Examens</h2>
                {selectedPromotion && (
                    <span style={{
                        background: '#4f46e5', color: 'white',
                        padding: '4px 14px', borderRadius: '20px',
                        fontSize: '0.85rem', fontWeight: '600', marginLeft: '12px'
                    }}>
                        Promotion {selectedPromotion}
                    </span>
                )}
            </div>

            <div className="resultats-card">
                <div className="toolbar">
                    <div className="filter-group">
                        {/*  Sélecteur promotion — dernière pré-sélectionnée */}
                     
                            <select
                                className="form-select"
                                value={selectedPromotion}
                                onChange={e => {
                                    setSelectedPromotion(e.target.value);
                                    setSelectedTypeExamen(''); // ← ajouter ce reset
                                    setCurrentPage(1);
                                }}
>
                            <option value="">Toutes les promotions</option>
                            {promotions.map(promo => (
                                <option key={promo} value={promo}>{promo}</option>
                            ))}
                        </select>

                        <select
                            className="form-select"
                            value={selectedMatiere}
                            onChange={e => { setSelectedMatiere(e.target.value); setCurrentPage(1); }}
                        >
                            <option value="">Toutes les matières</option>
                            {matieres.map(m => (
                                <option key={m.id} value={m.id}>{m.nom_matiere}</option>
                            ))}
                        </select>

                       <select
                            className="form-select"
                            value={selectedTypeExamen}
                            onChange={e => { setSelectedTypeExamen(e.target.value); setCurrentPage(1); }}
                        >
                            <option value="">Tous les types</option>
                            {examTypes
                                .filter(ex => !selectedPromotion || ex.promotion === selectedPromotion)
                                .filter((ex, index, self) =>
                                    // Dédoublonner par nom_modele au cas où
                                    index === self.findIndex(e => e.nom_modele === ex.nom_modele)
                                )
                                .map(ex => (
                                    <option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>
                                ))
                            }
                        </select>
                    </div>

                    <div className="action-group" ref={actionMenuRef}>
                        <button className="btn-menu" onClick={() => setIsActionMenuOpen(!isActionMenuOpen)}>
                            <IconMoreVertical />
                        </button>
                        {isActionMenuOpen && (
                            <div className="dropdown-panel">
                                <button className="drop-item" onClick={handleGenererStatistiques}>
                                    <IconCalculator /> Mettre à jour les calculs
                                </button>
                                <button className="drop-item" onClick={() => { setIsSelectionClassementOpen(true); setIsActionMenuOpen(false); }}>
                                    <IconCalculator /> Voir le classement
                                </button>
                                <button className="drop-item" onClick={() => { setIsExportModalOpen(true); setIsActionMenuOpen(false); }} disabled={!selectedMatiere}>
                                    <IconExport /> Exporter les notes
                                </button>
                                <button className="drop-item" onClick={() => { setIsElevesSansNoteModalOpen(true); setIsActionMenuOpen(false); }} disabled={!selectedMatiere || !selectedTypeExamen}>
                                    <IconUserX /> Voir les manquants
                                </button>
                                <button className="drop-item" onClick={() => { setIsConfigModalOpen(true); setIsActionMenuOpen(false); }}>
                                    <IconSettings /> Configuration
                                </button>
                                <button className="drop-item" onClick={() => { fetchAllData(selectedPromotion); setIsActionMenuOpen(false); }}>
                                    <IconRefresh /> Rafraîchir
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="search-section" ref={searchContainerRef}>
                    <div className="search-bar">
                        <IconSearch />
                        <input
                            type="text"
                            className="search-input"
                            placeholder="Rechercher un élève ou N° Incorporation..."
                            value={searchTerm}
                            onChange={e => { setSearchTerm(e.target.value); setShowSuggestions(true); }}
                            onFocus={() => setShowSuggestions(true)}
                        />
                    </div>
                    {showSuggestions && suggestions.length > 0 && (
                        <div className="suggestions-list">
                            {suggestions.map((s, idx) => (
                                <div
                                    key={idx}
                                    className="suggestion-item"
                                    onClick={() => { setSearchTerm(`${s.prenom} ${s.nom}`); setShowSuggestions(false); }}
                                >
                                    <strong>{s.prenom} {s.nom}</strong> <span>(N° {s.numero_incorporation})</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        margin: '10px 0', fontSize: '0.9rem', color: '#4a5568'
                    }}>
                        <span>
                            <strong> resultat : {filteredResults.length}</strong> note{filteredResults.length !== 1 ? 's' : ''} enregistrée{filteredResults.length !== 1 ? 's' : ''}
                            {selectedMatiere && matieres.find(m => m.id === parseInt(selectedMatiere, 10)) && (
                                <> pour <strong>{matieres.find(m => m.id === parseInt(selectedMatiere, 10)).nom_matiere}</strong></>
                            )}
                            {selectedTypeExamen && <> — <strong>{selectedTypeExamen}</strong></>}
                        </span>
                    </div>
                

                <div className="table-wrapper">
                    <table className="modern-table">
                        <thead>
                            <tr>
                                <th>Élève</th>
                                <th>Promo</th>
                                <th>N° Inc.</th>
                                <th>Matière</th>
                                <th>Type</th>
                                <th>Note</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentResults.length > 0 ? currentResults.map(r => (
                                <tr key={r.copie_id}>
                                    <td className="bold">{r.prenom} {r.nom}</td>
                                    <td>{r.promotion}</td>
                                    <td>{r.numero_incorporation}</td>
                                    <td>{r.nom_matiere}</td>
                                    <td><span className="type-badge">{r.type_examen}</span></td>
                                    <td>
                                        <span className={`note-pill ${parseFloat(r.note) >= 10 ? 'success' : 'danger'}`}>
                                            {!isNaN(parseFloat(r.note)) ? parseFloat(r.note).toFixed(2) : r.note}
                                        </span>
                                    </td>
                                    <td className="actions-cell">
                                        <button className="btn-action edit" title="Modifier" onClick={() => setEditingResult(r)}><IconEdit /></button>
                                        <button className="btn-action history" title="Historique" onClick={() => setViewingHistoryOf(r)}><IconHistory /></button>
                                        <button className="btn-action delete" title="Supprimer" onClick={() => handleDelete(r.copie_id, `${r.prenom} ${r.nom}`)}><IconTrash /></button>
                                    </td>
                                </tr>
                            )) : (
                                <tr><td colSpan="7" className="empty-state">Aucun résultat trouvé.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="pagination-bar">
                        <span className="page-info">Page {currentPage} sur {totalPages}</span>
                        <div className="page-btns">
                            <button disabled={currentPage === 1} onClick={() => setCurrentPage(currentPage - 1)}>Précédent</button>
                            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(currentPage + 1)}>Suivant</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default Resultats;
