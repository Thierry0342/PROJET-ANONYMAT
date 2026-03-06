import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { FiEdit, FiTrash2, FiPlusCircle, FiXCircle } from 'react-icons/fi';
import './DashboardRedesign.css';

const formatNom = (nom) => nom ? nom.toUpperCase() : '';
const formatPrenom = (prenom) => {
    if (!prenom) return '';
    return prenom.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const ConseilFormation = () => {
    const [decisionsSaved, setDecisionsSaved] = useState([]);
    const [loading, setLoading] = useState(true);
    const [quotas, setQuotas] = useState(() => {
        const savedQuotas = localStorage.getItem('conseil_quotas');
        return savedQuotas ? JSON.parse(savedQuotas) : { ajour3: 10, ajour6: 10, redouble: 10, radiation: 10 };
    });
    const [searchStudent, setSearchStudent] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedType, setSelectedType] = useState('ajournement_3m');
    const [selectedMotif, setSelectedMotif] = useState('');
    const [editingDecision, setEditingDecision] = useState(null);
    const [filterType, setFilterType] = useState(null);
    const [promotions, setPromotions] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('all');

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const resPromo = await axios.get('/api/promotions', { headers });
                setPromotions(resPromo.data);
                fetchDecisions();
            } catch (e) {}
        };
        fetchInitialData();
    }, []);

    useEffect(() => {
        localStorage.setItem('conseil_quotas', JSON.stringify(quotas));
    }, [quotas]);

    const fetchDecisions = async () => {
        try {
            setLoading(true);
            const res = await axios.get('/api/decisions-conseil', { headers });
            setDecisionsSaved(res.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSearchEleve = async (query) => {
        setSearchStudent(query);
        if (query.length > 1) {
            try {
                const res = await axios.get(`/api/eleves/recherche?q=${query}&promotion=${selectedPromotion}`, { headers });
                setSearchResults(res.data);
            } catch (e) { }
        } else setSearchResults([]);
    };

    const handleSelectFromSearch = async (eleve) => {
        try {
            await axios.post('/api/decisions-conseil', {
                eleve_id: eleve.id,
                type_decision: selectedType,
                motif: selectedMotif
            }, { headers });
            fetchDecisions();
            setSearchStudent('');
            setSearchResults([]);
            setSelectedMotif('');
        } catch (e) { alert("Erreur : l'élève est peut-être déjà inscrit."); }
    };

    const handleAddOrUpdateDecision = async () => {
        try {
            if (editingDecision) {
                await axios.put(`/api/decisions-conseil/${editingDecision.id}`, {
                    type_decision: selectedType,
                    motif: selectedMotif
                }, { headers });
                setEditingDecision(null);
                setSearchStudent('');
                setSelectedMotif('');
                fetchDecisions();
            }
        } catch (e) { }
    };

    const handleDeleteDecision = async (id) => {
        if (!window.confirm("Supprimer cette décision ?")) return;
        try {
            await axios.delete(`/api/decisions-conseil/${id}`, { headers });
            fetchDecisions();
        } catch (e) { }
    };

    const handleEditClick = (d) => {
        setEditingDecision(d);
        setSelectedType(d.type_decision);
        setSelectedMotif(d.motif || '');
        setSearchStudent(`${formatNom(d.nom)} ${formatPrenom(d.prenom)}`);
    };

    const getCount = (type) => {
        return decisionsSaved.filter(d => {
            const matchesType = d.type_decision === type;
            const matchesPromo = selectedPromotion === 'all' ? true : String(d.promotion) === String(selectedPromotion);
            return matchesType && matchesPromo;
        }).length;
    };

    const getRestant = (type, key) => {
        return quotas[key] - getCount(type);
    };

    const filteredDecisions = decisionsSaved.filter(d => {
        const matchesType = filterType ? d.type_decision === filterType : true;
        const matchesPromo = selectedPromotion === 'all' ? true : String(d.promotion) === String(selectedPromotion);
        return matchesType && matchesPromo;
    });

    if (loading) return <div className="loader-wrapper"><p className="text">Chargement...</p></div>;

    return (
        <div className="dashboard-redesign-container">
            <div className="top-nav-bar">
                <Link to="/dashboard/general" className="back-link">&larr; Retour</Link>
                <h1>Conseil de Formation</h1>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label style={{ fontWeight: '600' }}>Promotion :</label>
                    <select className="search-input" value={selectedPromotion} onChange={(e) => setSelectedPromotion(e.target.value)}>
                        <option value="all">Toutes</option>
                        {promotions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            <div className="stats-grid" style={{ marginBottom: '25px' }}>
                {[
                    { id: 'ajournement_3m', label: 'Ajournement 3m', key: 'ajour3' },
                    { id: 'ajournement_6m', label: 'Ajournement 6m', key: 'ajour6' },
                    { id: 'redoublement', label: 'Redoublement', key: 'redouble' },
                    { id: 'radiation', label: 'Remise Famille', key: 'radiation' }
                ].map(item => (
                    <div
                        key={item.id}
                        className={`stat-card-redesign clickable ${filterType === item.id ? 'highlight' : ''}`}
                        onClick={() => setFilterType(filterType === item.id ? null : item.id)}
                    >
                        <h4>{item.label}</h4>
                        <p>{getCount(item.id)}</p>
                        <small style={{ color: getRestant(item.id, item.key) < 0 ? '#d32f2f' : '#2e7d32', fontWeight: 'bold' }}>
                            Reste : {getRestant(item.id, item.key)}
                        </small>
                    </div>
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '25px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ backgroundColor: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #dfe0eb', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                        <h4 style={{ marginBottom: '15px' }}>{editingDecision ? '📝 Modifier' : '➕ Ajouter un élève'}</h4>

                        <label className="sidebar-stat-item" style={{ border: 'none', padding: '5px 0' }}>Type de décision</label>
                        <select className="search-input" style={{ width: '100%', marginBottom: '15px' }} value={selectedType} onChange={e => setSelectedType(e.target.value)}>
                            <option value="ajournement_3m">Ajournement 3 mois</option>
                            <option value="ajournement_6m">Ajournement 6 mois</option>
                            <option value="redoublement">Redoublement</option>
                            <option value="radiation">Remise à la famille</option>
                        </select>

                        <label className="sidebar-stat-item" style={{ border: 'none', padding: '5px 0' }}>Motif</label>
                        <select className="search-input" style={{ width: '100%', marginBottom: '15px' }} value={selectedMotif} onChange={e => setSelectedMotif(e.target.value)}>
                            <option value="">Non renseigné</option>
                            <option value="Santé">Santé</option>
                            <option value="Insuffisance Intellectuelle">Insuffisance Intellectuelle</option>
                            <option value="Discipline">Discipline</option>
                            <option value="Inaptitude Physique">Inaptitude Physique</option>
                        </select>

                        {!editingDecision ? (
                            <>
                                <label className="sidebar-stat-item" style={{ border: 'none', padding: '5px 0' }}>Rechercher l'élève (par nom)</label>
                                <input type="text" className="search-input" style={{ width: '100%' }} placeholder="Tapez le nom..." value={searchStudent} onChange={e => handleSearchEleve(e.target.value)} />
                                {searchResults.length > 0 && (
                                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #eee', marginTop: '5px', backgroundColor: '#fff', borderRadius: '8px', boxShadow: '0 4px 10px rgba(0,0,0,0.1)' }}>
                                        {searchResults.map(e => (
                                            <div key={e.id} className="clickable-row" style={{ padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f5f5f5' }} onClick={() => handleSelectFromSearch(e)}>
                                                <span style={{ fontSize: '0.85rem' }}>{formatNom(e.nom)} {formatPrenom(e.prenom)}</span>
                                                <FiPlusCircle style={{ color: '#28a745', fontSize: '1.2rem' }} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button className="btn-export excel-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={handleAddOrUpdateDecision}>Enregistrer</button>
                                <button className="btn-export pdf-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setEditingDecision(null); setSearchStudent(''); setSelectedMotif(''); }}>Annuler</button>
                            </div>
                        )}
                    </div>

                    <div style={{ backgroundColor: '#f8f9fa', padding: '20px', borderRadius: '12px', border: '1px solid #dfe0eb' }}>
                        <h4 style={{ fontSize: '0.9rem', marginBottom: '15px' }}>⚙️ Quotas</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Aj. 3m <input type="number" className="stat-input" style={{ width: '100%', marginTop: '5px' }} value={quotas.ajour3} onChange={e => setQuotas({ ...quotas, ajour3: parseInt(e.target.value) || 0 })} /></label>
                            <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Aj. 6m <input type="number" className="stat-input" style={{ width: '100%', marginTop: '5px' }} value={quotas.ajour6} onChange={e => setQuotas({ ...quotas, ajour6: parseInt(e.target.value) || 0 })} /></label>
                            <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Redoubl. <input type="number" className="stat-input" style={{ width: '100%', marginTop: '5px' }} value={quotas.redouble} onChange={e => setQuotas({ ...quotas, redouble: parseInt(e.target.value) || 0 })} /></label>
                            <label style={{ fontSize: '0.75rem', fontWeight: '600' }}>Remise <input type="number" className="stat-input" style={{ width: '100%', marginTop: '5px' }} value={quotas.radiation} onChange={e => setQuotas({ ...quotas, radiation: parseInt(e.target.value) || 0 })} /></label>
                        </div>
                    </div>
                </div>

                <div className="ranking-card" style={{ margin: 0 }}>
                    <div className="ranking-card-header">
                        <h3>Liste des décisions ({filteredDecisions.length})</h3>
                        {filterType && <button className="btn-details-action" onClick={() => setFilterType(null)}><FiXCircle /> Voir tout</button>}
                    </div>
                    <div className="table-responsive-dashboard">
                        <table>
                            <thead>
                                <tr>
                                    <th>N° INC</th>
                                    <th>NOM COMPLET</th>
                                    <th>PROMO</th>
                                    <th>DÉCISION</th>
                                    <th>MOTIF</th>
                                    <th style={{ textAlign: 'center' }}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDecisions.map(d => (
                                    <tr key={d.id}>
                                        <td><strong>{d.numero_incorporation}</strong></td>
                                        <td>{formatNom(d.nom)} {formatPrenom(d.prenom)}</td>
                                        <td><span className="sidebar-stat-item" style={{ padding: '2px 8px', border: 'none', background: '#eee', borderRadius: '4px' }}>{d.promotion}</span></td>
                                        <td><span className="status-badge" style={{ backgroundColor: '#3751FF', fontSize: '0.7rem' }}>{d.type_decision.replace('_', ' ').toUpperCase()}</span></td>
                                        <td>{d.motif || <em style={{color: '#999'}}>Non renseigné</em>}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px' }}>
                                                <FiEdit style={{ color: '#ffc107', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => handleEditClick(d)} />
                                                <FiTrash2 style={{ color: '#dc3545', cursor: 'pointer', fontSize: '1.2rem' }} onClick={() => handleDeleteDecision(d.id)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ConseilFormation;
