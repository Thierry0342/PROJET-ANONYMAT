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
const IconSettings = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
const IconUserX = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="18" y1="8" x2="23" y2="13"></line><line x1="23" y1="8" x2="18" y2="13"></line></svg>;
const IconMoreVertical = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>;

const HistoryModal = ({ resultat, onClose }) => {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (resultat?.copie_id) {
            const token = localStorage.getItem('token');
            axios.get(`/api/resultats/${resultat.copie_id}/historique`, { headers: { Authorization: `Bearer ${token}` } })
            .then(response => setHistory(response.data)).catch(error => { console.error("Error loading history", error); setHistory([]); }).finally(() => setLoading(false));
        }
    }, [resultat]);
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content history-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Historique pour {resultat.prenom} {resultat.nom}</h3><button className="close-button" onClick={onClose}>&times;</button></div>
                <div className="modal-body">
                    {loading ? <p>Chargement...</p> : (
                        <div className="history-list">
                            {history.length > 0 ? history.map((item, index) => (
                                <div key={index} className="history-item">
                                    <div className="history-meta"><strong>Modifié par : {item.modifie_par}</strong><br/><span>Le {new Date(item.date_modification).toLocaleString('fr-FR')}</span></div>
                                    <p className="history-motif"><strong>Motif :</strong> {item.motif}</p>
                                </div>
                            )) : <p>Aucun historique de modification trouvé.</p>}
                        </div>
                    )}
                </div>
                <div className="modal-actions"><button className="btn-cancel" onClick={onClose}>Fermer</button></div>            </div>
        </div>
    );
};

const ModificationModal = ({ resultat, onClose, onSave }) => {
    const [nouvelleNote, setNouvelleNote] = useState(resultat.note || '');
    const [raison, setRaison] = useState('');
    const generateMotif = () => `Modification de la note de ${resultat.prenom} ${resultat.nom} (N° Inc ${resultat.numero_incorporation}). Ancienne note : ${resultat.note}. Nouvelle note : ${nouvelleNote}. Raison : ${raison}`;
    const handleSave = () => {
        const noteNum = parseFloat(nouvelleNote);
        if (isNaN(noteNum) || noteNum < 0 || noteNum > 20) { alert("Veuillez entrer une note valide entre 0 et 20."); return; }
        if (!raison.trim()) { alert("Veuillez fournir une raison pour la modification."); return; }
        onSave(resultat.copie_id, nouvelleNote, generateMotif());
    };
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header"><h3>Modifier la note de {resultat.prenom} {resultat.nom}</h3><button className="close-button" onClick={onClose}>&times;</button></div>
                <div className="modal-body">
                    <div className="form-group"><label>Ancienne Note</label><input type="text" value={resultat.note} disabled /></div>
                    <div className="form-group"><label>Nouvelle Note</label><input type="number" min="0" max="20" step="0.25" value={nouvelleNote} onChange={(e) => setNouvelleNote(e.target.value)} placeholder="Note entre 0 et 20" /></div>
                    <div className="form-group"><label>Raison de la modification</label><textarea rows="3" placeholder="Expliquez pourquoi la note est modifiée..." value={raison} onChange={(e) => setRaison(e.target.value)}></textarea></div>
                </div>
                <div className="modal-actions"><button className="btn-save" onClick={handleSave}>Enregistrer</button><button className="btn-cancel" onClick={onClose}>Annuler</button></div>
            </div>
        </div>
    );
};

const ExportAnimation = () => (<div className="export-overlay"><div><div className="typewriter"><div className="slide"><i></i></div><div className="paper"></div><div className="keyboard"></div></div><p>Génération du fichier en cours...</p></div></div>);

const ExportModal = ({ onExport, onCancel }) => (
    <div className="modal-overlay">
        <div className="modal-content">
            <h3>Choisir le format d'exportation</h3>
            <div className="modal-actions">
                <button className="btn-excel" onClick={() => onExport('excel')}>Exporter en Excel</button>
                <button className="btn-pdf" onClick={() => onExport('pdf')}>Exporter en PDF</button>
                <button className="btn-cancel" onClick={onCancel}>Annuler</button>
            </div>
        </div>
    </div>
);

const SelectionClassementModal = ({ onSelect, onClose }) => {
    const modeles = ['General', 'MI-STAGE', 'FETTA', 'TEST_JOURNALIER', 'EXAMEN FINAL'];
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Choisir le modèle de classement</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <div className="selection-classement-grid">
                        {modeles.map(modele => (
                            <button
                                key={modele}
                                className="btn btn-primary"
                                onClick={() => onSelect(modele)}
                            >
                                Classement {modele}
                            </button>
                        ))}
                    </div>
                </div>
                 <div className="modal-actions">
                    <button className="btn btn-cancel" onClick={onClose}>Annuler</button>
                </div>
            </div>
        </div>
    );
};

function Resultats() {
    const [resultats, setResultats] = useState([]);
    const [matieres, setMatieres] = useState([]);
    const [examTypes, setExamTypes] = useState([]);
    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedMatiere, setSelectedMatiere] = useState('');
    const [selectedTypeExamen, setSelectedTypeExamen] = useState('');
    const [selectedPromotion, setSelectedPromotion] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [resultsPerPage] = useState(10);
    const [editingResult, setEditingResult] = useState(null);
    const [viewingHistoryOf, setViewingHistoryOf] = useState(null);
    const [isExporting, setIsExporting] = useState(false);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isSelectionClassementOpen, setIsSelectionClassementOpen] = useState(false);
    const [selectedModeleClassement, setSelectedModeleClassement] = useState(null);
    const [isResultatClassementOpen, setIsResultatClassementOpen] = useState(false);
    const [isElevesSansNoteModalOpen, setIsElevesSansNoteModalOpen] = useState(false);
    const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
    const [suggestions, setSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [studentInfo, setStudentInfo] = useState(null);

    const actionMenuRef = useRef(null);
    const searchContainerRef = useRef(null);

    const fetchAllData = () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };
        const resultsRequest = axios.get('/api/resultats', config);
        const matieresRequest = axios.get('/api/matieres', config);
        const examTypesRequest = axios.get('/api/examens', config);
        const promotionsRequest = axios.get('/api/promotions', config);
        Promise.all([resultsRequest, matieresRequest, examTypesRequest, promotionsRequest])
            .then(([resResults, resMatieres, resExamTypes, resPromotions]) => {
                setResultats(resResults.data);
                setMatieres(resMatieres.data);
                setExamTypes(resExamTypes.data);
                setPromotions(resPromotions.data);
            })
            .catch(err => console.error("Erreur de chargement des données:", err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) setIsActionMenuOpen(false);
            if (searchContainerRef.current && !searchContainerRef.current.contains(event.target)) setShowSuggestions(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const rankedStudents = useMemo(() => {
        if (!resultats.length || !matieres.length) return [];
        const matieresMap = matieres.reduce((acc, m) => {
            acc[m.id] = { nom: m.nom_matiere, coeff: m.coefficient };
            return acc;
        }, {});
        const groupedByStudent = resultats.reduce((acc, r) => {
            acc[r.numero_incorporation] = acc[r.numero_incorporation] || { notes: [], prenom: r.prenom, nom: r.nom };            acc[r.numero_incorporation].notes.push(r);
            return acc;
        }, {});
        const studentAverages = Object.entries(groupedByStudent).map(([incorp, data]) => {
            const { totalPoints, totalCoeffs } = data.notes.reduce((totals, note) => {
                const matiere = matieresMap[note.matiere_id];
                if (matiere && matiere.coeff > 0) {
                    totals.totalPoints += note.note * matiere.coeff;
                    totals.totalCoeffs += matiere.coeff;
                }
                return totals;
            }, { totalPoints: 0, totalCoeffs: 0 });
            const moyenne = totalCoeffs > 0 ? (totalPoints / totalCoeffs) : 0;
            return { numero_incorporation: incorp, nom: `${data.prenom} ${data.nom}`, moyenne: parseFloat(moyenne.toFixed(2)) };
        });
        studentAverages.sort((a, b) => b.moyenne - a.moyenne);
        return studentAverages.map((student, index) => ({ ...student, rang: index + 1 }));
    }, [resultats, matieres]);

    const filteredResults = useMemo(() => {
        let results = resultats;
        if (selectedMatiere) {
            results = results.filter(r => r.matiere_id === parseInt(selectedMatiere, 10));
        }
        if (selectedTypeExamen) {
            results = results.filter(r => r.type_examen === selectedTypeExamen);
        }
        if (selectedPromotion) {
            results = results.filter(r => r.promotion === selectedPromotion);
        }
        if (searchTerm) {
            const lowSearch = searchTerm.toLowerCase().trim();
            results = results.filter(r =>
                (r.nom && r.nom.toLowerCase() === lowSearch) ||
                (r.prenom && r.prenom.toLowerCase() === lowSearch) ||
                (`${r.prenom} ${r.nom}`.toLowerCase() === lowSearch) ||
                (r.code_anonyme && r.code_anonyme.toLowerCase() === lowSearch) ||
                (r.numero_incorporation && r.numero_incorporation.toString() === lowSearch)
            );
        }
        return results;
    }, [resultats, selectedMatiere, selectedTypeExamen, selectedPromotion, searchTerm]);

    useEffect(() => {
        const uniqueStudentsInFilter = new Set(filteredResults.map(r => r.numero_incorporation));
        if (searchTerm && uniqueStudentsInFilter.size === 1) {
            const numero_incorporation = uniqueStudentsInFilter.values().next().value;
            const studentData = rankedStudents.find(s => s.numero_incorporation.toString() === numero_incorporation.toString());
            setStudentInfo(studentData || null);
        } else {
            setStudentInfo(null);
        }
    }, [filteredResults, rankedStudents, searchTerm]);

    const searchSuggestions = useMemo(() => {
        const uniqueNames = [...new Set(resultats.map(r => `${r.prenom} ${r.nom}`))];
        const uniqueInc = [...new Set(resultats.map(r => r.numero_incorporation.toString()))];
        return [...uniqueNames, ...uniqueInc];
    }, [resultats]);

    const handleCloseConfigModal = () => {
        setIsConfigModalOpen(false);
        fetchAllData();
    };

    const handleSearchChange = (value) => {
        setSearchTerm(value);
        setCurrentPage(1);
        if (value) {
            const lowercasedValue = value.toLowerCase();
            const filteredSuggestions = searchSuggestions.filter(s =>
                s.toLowerCase().includes(lowercasedValue)
            ).sort((a, b) => {
                const aStartsWith = a.toLowerCase().startsWith(lowercasedValue);
                const bStartsWith = b.toLowerCase().startsWith(lowercasedValue);
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                return a.localeCompare(b);
            });
            setSuggestions(filteredSuggestions.slice(0, 7));
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    };

    const handleSuggestionClick = (suggestion) => {
        setSearchTerm(suggestion);
        setShowSuggestions(false);
    };

    const indexOfLastResult = currentPage * resultsPerPage;
    const indexOfFirstResult = indexOfLastResult - resultsPerPage;
    const currentResults = filteredResults.slice(indexOfFirstResult, indexOfLastResult);
    const totalPages = Math.ceil(filteredResults.length / resultsPerPage);
    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    const handleSaveModification = (copieId, nouvelleNote, motif) => {
        const token = localStorage.getItem('token');
        axios.put(`/api/resultats/${copieId}`, { nouvelle_note: nouvelleNote, motif }, { headers: { Authorization: `Bearer ${token}` } })
            .then(response => {
                alert(response.data.message);
                setEditingResult(null);
                fetchAllData();
            })
            .catch(error => alert(error.response?.data?.message || "Erreur de mise à jour."));
    };

    const handleDelete = (copieId, nomEleve) => {
        if (window.confirm(`Supprimer la note de ${nomEleve} ? L'action sera archivée.`)) {
            const token = localStorage.getItem('token');
            axios.delete(`/api/resultats/${copieId}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(response => {
                    alert(response.data.message);
                    fetchAllData();
                })
                .catch(error => alert(error.response?.data?.message || "Erreur de suppression."));
        }
    };

    const openExportModal = () => {
        if (!selectedMatiere) { alert("Veuillez sélectionner une matière avant d'exporter."); return; }
        setIsExportModalOpen(true);
    };

    const handleExport = (format) => {
        setIsExportModalOpen(false);
        setIsExporting(true);
        const selectedMatiereData = matieres.find(m => m.id === parseInt(selectedMatiere));
        const matiereNom = selectedMatiereData ? selectedMatiereData.nom_matiere : 'inconnue';
        const token = localStorage.getItem('token');
        const url = format === 'excel' ? `/api/resultats/exporter?matiereId=${selectedMatiere}` : `/api/resultats/generer-document-pdf`;
        axios({ url, method: format === 'excel' ? 'GET' : 'POST', data: format === 'pdf' ? { matiereId: selectedMatiere } : null, headers: { Authorization: `Bearer ${token}` }, responseType: 'blob', })
            .then((response) => {
                const href = URL.createObjectURL(response.data);
                const link = document.createElement('a');
                link.href = href;
                link.setAttribute('download', `Notes_${matiereNom.replace(/ /g, '_')}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(href);
            }).catch(error => {
                console.error(`Erreur d'exportation en ${format} !`, error);
                alert(`Une erreur est survenue lors de l'exportation.`);
            })
            .finally(() => { setTimeout(() => setIsExporting(false), 4000); });
    };

    const handleSelectModele = (modele) => {
        setSelectedModeleClassement(modele);
        setIsSelectionClassementOpen(false);
        setIsResultatClassementOpen(true);
    };

    if (loading) return <p>Chargement des données...</p>;

    return (
        <>
            {isExporting && <ExportAnimation />}
            {isExportModalOpen && <ExportModal onExport={handleExport} onCancel={() => setIsExportModalOpen(false)} />}
            {editingResult && <ModificationModal resultat={editingResult} onClose={() => setEditingResult(null)} onSave={handleSaveModification} />}
            {viewingHistoryOf && <HistoryModal resultat={viewingHistoryOf} onClose={() => setViewingHistoryOf(null)} />}
            {isConfigModalOpen && <ConfigurationModal matieres={matieres} onClose={handleCloseConfigModal} />}
            {isSelectionClassementOpen && <SelectionClassementModal onSelect={handleSelectModele} onClose={() => setIsSelectionClassementOpen(false)} />}
            {isResultatClassementOpen && <ClassementModal modeleExamen={selectedModeleClassement} onClose={() => setIsResultatClassementOpen(false)} />}
            {isElevesSansNoteModalOpen && selectedMatiere && (
                <ElevesSansNoteModal
                    matiereId={selectedMatiere}
                    nomMatiere={matieres.find(m => m.id === parseInt(selectedMatiere, 10))?.nom_matiere || ''}
                    typeExamen={selectedTypeExamen}
                    onClose={() => setIsElevesSansNoteModalOpen(false)}
                />
            )}
            <div className="page-header"><h2>Résultats des Examens</h2></div>
            <div className="resultats-card">
                <div className="toolbar">
                    <div className="filter-group">
                        <select value={selectedPromotion} onChange={e => { setSelectedPromotion(e.target.value); setCurrentPage(1); }}>
                            <option value="">Toutes les promotions</option>
                            {promotions.map(promo => (<option key={promo} value={promo}>{promo}</option>))}
                        </select>
                        <select value={selectedMatiere} onChange={e => { setSelectedMatiere(e.target.value); setCurrentPage(1); }}>
                            <option value="">Toutes les matières</option>
                            {matieres.map(matiere => (<option key={matiere.id} value={matiere.id}>{matiere.nom_matiere}</option>))}
                        </select>
                        <select value={selectedTypeExamen} onChange={e => { setSelectedTypeExamen(e.target.value); setCurrentPage(1); }}>
                            <option value="">Tous les types</option>
                            {examTypes.map(examen => (
                                <option key={examen.id} value={examen.nom_modele}>
                                    {examen.nom_modele}
                                </option>
                            ))}
                        </select>
                        <div className="search-container" ref={searchContainerRef}>
                            <IconSearch />
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Rechercher par nom, N° incorp..."
                                value={searchTerm}
                                onChange={e => handleSearchChange(e.target.value)}
                            />
                            {showSuggestions && suggestions.length > 0 && (
                                <div className="search-suggestions">
                                    {suggestions.map((s, index) => (
                                        <div key={index} className="suggestion-item" onClick={() => handleSuggestionClick(s)}>
                                            {s}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        {studentInfo && (
                             <div className="student-info-card">
                                <div>
                                    <div className="info-label">Rang</div>
                                    <div className="info-value">{studentInfo.rang}</div>
                                </div>
                                <div>
                                    <div className="info-label">Moyenne</div>
                                    <div className="info-value">{studentInfo.moyenne}</div>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="action-group">
                         <div className={`dropdown-menu ${isActionMenuOpen ? 'active' : ''}`} ref={actionMenuRef}>
                            <button className="btn btn-secondary dropdown-toggle" onClick={() => setIsActionMenuOpen(!isActionMenuOpen)} title="Plus d'actions">
                                <IconMoreVertical />
                            </button>
                            <div className="dropdown-content">
                                <button className="dropdown-item" onClick={() => { setIsSelectionClassementOpen(true); setIsActionMenuOpen(false); }}>
                                    Calculer le classement
                                </button>
                                <button className="dropdown-item" onClick={() => { openExportModal(); setIsActionMenuOpen(false); }} disabled={!selectedMatiere}>
                                    <IconExport /> Exporter les notes
                                </button>
                                <button className="dropdown-item" onClick={() => { setIsElevesSansNoteModalOpen(true); setIsActionMenuOpen(false); }} disabled={!selectedMatiere || !selectedTypeExamen}>
                                    <IconUserX /> Voir les manquants
                                </button>
                                <button className="dropdown-item" onClick={() => { setIsConfigModalOpen(true); setIsActionMenuOpen(false); }}>
                                    <IconSettings /> Configuration
                                </button>
                                <button className="dropdown-item" onClick={() => { fetchAllData(); setIsActionMenuOpen(false); }}>
                                    <IconRefresh /> Rafraîchir les données
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="table-responsive">
                    <table className="results-table">
                        <thead>
                            <tr>
                                <th>Élève</th>
                                <th>Promo</th>
                                <th>N° Incorp.</th>
                                <th>Matière</th>
                                <th>Type</th>
                                <th>Note</th>
                                <th>Code Anonyme</th>
                                <th>Opérateurs</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentResults.length > 0 ? (
                                currentResults.map(r => (
                                    <tr key={r.copie_id}>
                                        <td>{`${r.prenom} ${r.nom}`}</td>
                                        <td>{r.promotion || 'N/A'}</td>
                                        <td>{r.numero_incorporation}</td>
                                        <td>{r.nom_matiere}</td>
                                        <td>{r.type_examen}</td>
                                        <td className="note-cell">
                                            <span className={`note-value note-${r.note >= 10 ? 'success' : 'danger'}`}>{r.note}</span>
                                            {r.modifications_count > 0 && (<span className="notification-bell" title="Voir l'historique" onClick={() => setViewingHistoryOf(r)}><IconHistory /><span className="badge">{r.modifications_count}</span></span>)}
                                        </td>
                                        <td>{r.code_anonyme}</td>
                                        <td className="operator-cell">{r.operateur_note || 'N/A'} / {r.operateur_code || 'N/A'}</td>
                                        <td className="action-buttons">
                                            <button className="btn-icon btn-edit" onClick={() => setEditingResult(r)} title="Modifier"><IconEdit /></button>
                                            <button className="btn-icon btn-delete" onClick={() => handleDelete(r.copie_id, `${r.prenom} ${r.nom}`)} title="Supprimer"><IconTrash /></button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="9" className="no-results">Aucun résultat trouvé pour les filtres actuels.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="pagination">
                        <button onClick={() => paginate(currentPage - 1)} disabled={currentPage === 1}>Précédent</button>
                        <span>Page {currentPage} sur {totalPages}</span>
                        <button onClick={() => paginate(currentPage + 1)} disabled={currentPage === totalPages}>Suivant</button>
                    </div>
                )}
            </div>
        </>
    );
}

export default Resultats;
