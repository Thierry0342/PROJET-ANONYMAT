import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FiUsers, FiLayers, FiTrash2, FiArrowLeft, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import './CopiesNotees.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

function CopiesNotees() {
    const [currentView, setCurrentView] = useState('dashboard');
    const [selectedCard, setSelectedCard] = useState(null);
    const [copies, setCopies] = useState([]);
    const [matieres, setMatieres] = useState([]);
    const [dashboardData, setDashboardData] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('79E');
    const [selectedPopulation, setSelectedPopulation] = useState('all');
    const [promotions, setPromotions] = useState([]);
    const [selectedMatiereFilter, setSelectedMatiereFilter] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', codes: [], layout: 'single-column' });
    const [isModalLoading, setIsModalLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const populations = [
        { id: 'all', label: 'Toute la promotion' },
        { id: 'actif', label: 'Liste Originale (Actifs)' },
        { id: 'conseil', label: 'Liste Conseil (Redoublants/Ajournés)' }
    ];

    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await axios.get(
                `${API_BASE_URL}/api/stats/copies-par-matiere?promotion=${selectedPromotion}&population=${selectedPopulation}`,
                getAuthHeaders()
            );
            setDashboardData(res.data);
        } catch (err) { 
            console.error(err); 
        } finally { 
            setIsLoading(false); 
        }
    }, [getAuthHeaders, selectedPromotion, selectedPopulation]);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [resM, resP] = await Promise.all([
                    axios.get(`${API_BASE_URL}/api/matieres`, getAuthHeaders()),
                    axios.get(`${API_BASE_URL}/api/promotions`, getAuthHeaders())
                ]);
                setMatieres(resM.data);
                if (resP.data && resP.data.length > 0) setPromotions(resP.data);
                else setPromotions(Array.from({ length: 5 }, (_, i) => `${77 + i}E`));
            } catch (err) { console.error(err); }
        };
        fetchInitialData();
    }, [getAuthHeaders]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    useEffect(() => {
        if (currentView === 'table' || selectedCard) {
            const fetchCopies = async () => {
                const matiereId = selectedCard ? selectedCard.id : selectedMatiereFilter;
                try {
                    const res = await axios.get(
                        `${API_BASE_URL}/api/copies/notees-non-liees?matiereId=${matiereId}&promotion=${selectedPromotion}&population=${selectedPopulation}`,
                        getAuthHeaders()
                    );
                    setCopies(res.data);
                } catch (err) { console.error(err); }
            };
            fetchCopies();
        }
    }, [selectedMatiereFilter, selectedCard, currentView, getAuthHeaders, selectedPromotion, selectedPopulation]);

    const handleCardClick = (matiere) => {
        setSelectedCard(matiere);
        setCurrentPage(1);
    };

    const handleDeleteNote = async (copieId) => {
        if (!window.confirm("Supprimer cette note ?")) return;
        try {
            await axios.delete(`${API_BASE_URL}/api/resultats/${copieId}`, getAuthHeaders());
            setCopies(prev => prev.filter(c => c.id !== copieId));
            fetchDashboardData();
        } catch (err) { alert("Erreur."); }
    };

    const handleSansNoteClick = async (matiereId, nomMatiere) => {
        setIsModalOpen(true);
        setIsModalLoading(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/codes/sans-note/${matiereId}?promotion=${selectedPromotion}&population=${selectedPopulation}`, getAuthHeaders());
            setModalContent({ 
                title: `Codes manquants : ${nomMatiere}`, 
                codes: res.data, 
                layout: res.data.length > 15 ? 'multi-column' : 'single-column' 
            });
        } catch (err) { console.error(err); }
        finally { setIsModalLoading(false); }
    };

    const totalPendingCodes = dashboardData.reduce((total, item) => total + (item.en_attente || 0), 0);

    const CopiesTable = () => {
        const indexOfLastItem = currentPage * itemsPerPage;
        const indexOfFirstItem = indexOfLastItem - itemsPerPage;
        const currentCopies = copies.slice(indexOfFirstItem, indexOfLastItem);
        const totalPages = Math.ceil(copies.length / itemsPerPage);

        return (
            <div className="table-wrapper">
                <table className="custom-table">
                    <thead>
                        <tr>
                            <th>Matière</th>
                            <th>Code Anonyme</th>
                            <th>Note / 20</th>
                            <th className="text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {currentCopies.map(copie => (
                            <tr key={copie.id}>
                                <td className="font-semibold">{copie.nom_matiere}</td>
                                <td><code className="code-tag">{copie.code_anonyme}</code></td>
                                <td><span className="note-badge">{copie.note}</span></td>
                                <td className="text-center">
                                    <button className="btn-delete-icon" onClick={() => handleDeleteNote(copie.id)}>
                                        <FiTrash2 />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {copies.length > itemsPerPage && (
                    <div className="pagination">
                        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)}>Précédent</button>
                        <span>{currentPage} / {totalPages}</span>
                        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)}>Suivant</button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="copies-notees-container">
            <div className="top-toolbar">
                <div className="toolbar-title">
                    <h1>Suivi des Notes Anonymes</h1>
                    <p>{selectedPromotion} - {populations.find(p => p.id === selectedPopulation)?.label}</p>
                </div>
                <div className="toolbar-filters">
                    <div className="filter-group">
                        <label><FiLayers /> Promotion</label>
                        <select value={selectedPromotion} onChange={e => setSelectedPromotion(e.target.value)}>
                            {promotions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="filter-group">
                        <label><FiUsers /> Population</label>
                        <select value={selectedPopulation} onChange={e => setSelectedPopulation(e.target.value)}>
                            {populations.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="main-nav-tabs">
                <button className={currentView === 'dashboard' ? 'active' : ''} onClick={() => {setCurrentView('dashboard'); setSelectedCard(null);}}>
                    Vue d'ensemble
                </button>
                <button className={currentView === 'table' ? 'active' : ''} onClick={() => {setCurrentView('table'); setSelectedCard(null);}}>
                    Liste détaillée {totalPendingCodes > 0 && <span className="notif-dot">{totalPendingCodes}</span>}
                </button>
            </div>

            {currentView === 'dashboard' && (
                <div className="dashboard-content">
                    {selectedCard ? (
                        <div className="split-view">
                            <div className="side-panel">
                                <button className="btn-back-flat" onClick={() => setSelectedCard(null)}><FiArrowLeft /> Retour</button>
                                <div className="matiere-stat-card selected">
                                    <h3>{selectedCard.nom_matiere}</h3>
                                    <div className="stat-row"><span>Notées</span><span className="val success">{selectedCard.avec_note}</span></div>
                                    <div className="stat-row"><span>En attente</span><span className="val" style={{color:'#3b82f6'}}>{selectedCard.en_attente}</span></div>
                                    <div className="stat-row"><span>Manquantes</span><span className="val warning">{selectedCard.sans_note < 0 ? 0 : selectedCard.sans_note}</span></div>
                                </div>
                            </div>
                            <div className="main-panel">
                                <CopiesTable />
                            </div>
                        </div>
                    ) : (
                        <div className="subjects-grid">
                            {isLoading ? <p>Chargement...</p> : dashboardData.map(item => (
                                <div key={item.id} className="subject-card" onClick={() => handleCardClick(item)}>
                                    <div className="subject-card-header"><h4>{item.nom_matiere}</h4></div>
                                    <div className="subject-card-body">
                                        <div className="mini-stat"><FiCheckCircle className="icon-success" /> <span>{item.avec_note} notées</span></div>
                                        <div className="mini-stat"><FiUsers style={{color:'#3b82f6'}} /> <span>{item.en_attente} en attente</span></div>
                                        <div className="mini-stat clickable" onClick={(e) => { e.stopPropagation(); handleSansNoteClick(item.id, item.nom_matiere); }}>
                                            <FiAlertCircle className="icon-warning" /> <span>{item.sans_note < 0 ? 0 : item.sans_note} manquantes</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {currentView === 'table' && (
                <div className="table-view-container">
                    <div className="table-header-actions">
                        <select value={selectedMatiereFilter} onChange={e => setSelectedMatiereFilter(e.target.value)}>
                            <option value="all">Toutes les matières</option>
                            {matieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                        </select>
                    </div>
                    <CopiesTable />
                </div>
            )}

            {isModalOpen && (
                <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{modalContent.title}</h3>
                            <button className="close-x" onClick={() => setIsModalOpen(false)}>&times;</button>
                        </div>
                        <div className="modal-body">
                            {isModalLoading ? <p>Chargement...</p> : (
                                <div className={`codes-grid-display ${modalContent.layout}`}>
                                    {modalContent.codes.map((c, i) => <div key={i} className="code-item-box">{c.code}</div>)}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CopiesNotees;
