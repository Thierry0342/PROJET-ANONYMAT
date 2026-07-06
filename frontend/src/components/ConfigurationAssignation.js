import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaUserCog, FaSave, FaEraser, FaCheckCircle, FaExclamationTriangle, FaFilter } from 'react-icons/fa';
import './ConfigurationAssignation.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const GENERATED_PROMOTIONS = Array.from({ length: 81 }, (_, i) => `${i + 70}E`);

function ConfigurationAssignation() {
    const [users, setUsers] = useState([]);
    const [matieres, setMatieres] = useState([]);
    const [examTypes, setExamTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });

    // ── Filtres de recherche ──────────────────────────────────────────────────
    const [promotionsList, setPromotionsList] = useState([]);
    const [filterPromotion, setFilterPromotion] = useState('');
    const [filterExamTypes, setFilterExamTypes] = useState([]);
    const [filterTypeExamen, setFilterTypeExamen] = useState('');
    const [filterMatieres, setFilterMatieres] = useState([]);
    const [filterMatiereId, setFilterMatiereId] = useState('');
    const [isFilterMatiereLoading, setIsFilterMatiereLoading] = useState(false);

    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    // ── Chargement initial ────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resUsers, resMatieres, resExams, resPromotions] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/utilisateurs`, getAuthHeaders()),
                axios.get(`${API_BASE_URL}/api/matieres`, getAuthHeaders()),
                axios.get(`${API_BASE_URL}/api/examens`, getAuthHeaders()),
                axios.get(`${API_BASE_URL}/api/promotions`, getAuthHeaders())
            ]);
            setUsers(resUsers.data.filter(u => u.role !== 'admin'));
            setMatieres(resMatieres.data);
            setExamTypes(resExams.data);
            setPromotionsList(resPromotions.data || []);
        } catch (error) {
            console.error("Erreur de chargement", error);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ── Charger les examens filtrés par promotion ─────────────────────────────
    useEffect(() => {
        const fetchFilterExamens = async () => {
            if (!filterPromotion) {
                setFilterExamTypes([]);
                setFilterTypeExamen('');
                setFilterMatiereId('');
                setFilterMatieres([]);
                return;
            }
            try {
                const res = await axios.get(
                    `${API_BASE_URL}/api/examens?promotion=${filterPromotion}`,
                    getAuthHeaders()
                );
                setFilterExamTypes(res.data);
                setFilterTypeExamen(prev => {
                    const exists = res.data.find(e => e.nom_modele === prev);
                    if (!exists) {
                        setFilterMatiereId('');
                        setFilterMatieres([]);
                        return '';
                    }
                    return prev;
                });
            } catch {
                setFilterExamTypes([]);
                setFilterTypeExamen('');
            }
        };
        fetchFilterExamens();
    }, [filterPromotion, getAuthHeaders]);

    // ── Charger les matières filtrées par examen + promotion ──────────────────
    useEffect(() => {
        const fetchFilterMatieres = async () => {
            if (!filterTypeExamen || !filterPromotion) {
                setFilterMatieres([]);
                setFilterMatiereId('');
                return;
            }
            setIsFilterMatiereLoading(true);
            try {
                const res = await axios.get(
                    `${API_BASE_URL}/api/matieres-par-examen?typeExamen=${filterTypeExamen}&promotion=${filterPromotion}`,
                    getAuthHeaders()
                );
                setFilterMatieres(res.data);
                setFilterMatiereId(prev => {
                    if (!prev) return prev;
                    const exists = res.data.find(m => m.id === parseInt(prev));
                    return exists ? prev : '';
                });
            } catch {
                setFilterMatieres([]);
                setFilterMatiereId('');
            } finally {
                setIsFilterMatiereLoading(false);
            }
        };
        fetchFilterMatieres();
    }, [filterTypeExamen, filterPromotion, getAuthHeaders]);

    // ── Réinitialiser les filtres ─────────────────────────────────────────────
    const handleResetFilters = () => {
        setFilterPromotion('');
        setFilterTypeExamen('');
        setFilterMatiereId('');
        setFilterExamTypes([]);
        setFilterMatieres([]);
    };

    // ── Filtrage des utilisateurs affichés ────────────────────────────────────
    const filteredUsers = users.filter(user => {
        if (filterPromotion && user.assigned_promotion !== filterPromotion) return false;
        if (filterTypeExamen && user.assigned_type_examen !== filterTypeExamen) return false;
        if (filterMatiereId && user.assigned_matiere_id?.toString() !== filterMatiereId.toString()) return false;
        return true;
    });

    const handleUpdateAssignation = async (userId, data) => {
        try {
            const user = users.find(u => u.id === userId);
            const payload = {
                nom_utilisateur: user.nom_utilisateur,
                role: user.role,
                assigned_matiere_id: data.matiereId,
                assigned_type_examen: data.typeExamen,
                assigned_promotion: data.promotion,
                assigned_population: data.population
            };

            await axios.put(`${API_BASE_URL}/api/utilisateurs/${userId}`, payload, getAuthHeaders());
            setMessage({ text: "Assignation mise à jour avec succès !", type: 'success' });
            fetchData();
            setTimeout(() => setMessage({ text: '', type: '' }), 3000);
        } catch (error) {
            setMessage({ text: "Erreur lors de la mise à jour", type: 'error' });
        }
    };

    if (loading) return <div className="loader">Chargement des configurations...</div>;

    const hasActiveFilter = filterPromotion || filterTypeExamen || filterMatiereId;

    return (
        <div className="config-assignation-container">
            <div className="card">
                <h2><FaUserCog /> Configuration des Missions de Saisie</h2>
                <p className="subtitle">Définissez ici la matière, l'examen et la population d'élèves attribués à chaque opérateur.</p>

                {message.text && (
                    <div className={`alert ${message.type}`}>
                        {message.type === 'success' ? <FaCheckCircle /> : <FaExclamationTriangle />}
                        {message.text}
                    </div>
                )}

                {/* ── Barre de filtres ── */}
                <div className="filter-bar">
                    <div className="filter-bar-header">
                        <span className="filter-label"><FaFilter /> Filtrer les opérateurs</span>
                        {hasActiveFilter && (
                            <button className="btn-reset-filter" onClick={handleResetFilters}>
                                <FaEraser /> Effacer les filtres
                            </button>
                        )}
                    </div>
                    <div className="filter-controls">
                        {/* Promotion */}
                        <div className="filter-group">
                            <label>Promotion</label>
                            <select
                                value={filterPromotion}
                                onChange={e => {
                                    setFilterPromotion(e.target.value);
                                    setFilterTypeExamen('');
                                    setFilterMatiereId('');
                                }}
                            >
                                <option value="">— Toutes —</option>
                                {promotionsList.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>

                        {/* Type Examen */}
                        <div className="filter-group">
                            <label>Type d'examen</label>
                            <select
                                value={filterTypeExamen}
                                onChange={e => {
                                    setFilterTypeExamen(e.target.value);
                                    setFilterMatiereId('');
                                }}
                                disabled={!filterPromotion}
                            >
                                <option value="">— Tous —</option>
                                {(filterPromotion ? filterExamTypes : examTypes).map(et => (
                                    <option key={et.id} value={et.nom_modele}>{et.nom_modele}</option>
                                ))}
                            </select>
                            {filterPromotion && filterExamTypes.length === 0 && (
                                <small className="filter-hint">Aucun examen pour cette promotion</small>
                            )}
                        </div>

                        {/* Matière */}
                        <div className="filter-group">
                            <label>Matière</label>
                            <select
                                value={filterMatiereId}
                                onChange={e => setFilterMatiereId(e.target.value)}
                                disabled={!filterTypeExamen || isFilterMatiereLoading}
                            >
                                <option value="">— Toutes —</option>
                                {(filterTypeExamen ? filterMatieres : matieres).map(m => (
                                    <option key={m.id} value={m.id}>{m.nom_matiere}</option>
                                ))}
                            </select>
                            {isFilterMatiereLoading && <small className="filter-hint">Chargement...</small>}
                            {!isFilterMatiereLoading && filterTypeExamen && filterMatieres.length === 0 && (
                                <small className="filter-hint filter-hint--warn">Aucune matière pour cet examen</small>
                            )}
                        </div>
                    </div>

                    {/* Résumé du filtre actif */}
                    {hasActiveFilter && (
                        <div className="filter-summary">
                            <strong>{filteredUsers.length}</strong> opérateur{filteredUsers.length !== 1 ? 's' : ''} affiché{filteredUsers.length !== 1 ? 's' : ''}
                            {filterPromotion && <span className="filter-tag">Promo : {filterPromotion}</span>}
                            {filterTypeExamen && <span className="filter-tag">Examen : {filterTypeExamen}</span>}
                            {filterMatiereId && (
                                <span className="filter-tag">
                                    Matière : {(filterMatieres.length ? filterMatieres : matieres).find(m => m.id.toString() === filterMatiereId.toString())?.nom_matiere}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <div className="table-responsive">
                    <table className="config-table">
                        <thead>
                            <tr>
                                <th>Utilisateur</th>
                                <th>Promotion</th>
                                <th>Type d'Examen</th>
                                <th>Matière Assignée</th>
                                <th>Population Cible</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', color: '#718096', padding: '30px' }}>
                                        Aucun opérateur ne correspond aux filtres sélectionnés.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(user => (
                                    <UserRow
                                        key={user.id}
                                        user={user}
                                        matieres={matieres}
                                        examTypes={examTypes}
                                        promotionsList={promotionsList}
                                        onSave={handleUpdateAssignation}
                                    />
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <style jsx>{`
                /* ── Barre de filtres ── */
                .filter-bar {
                    background: #f7fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 16px 20px;
                    margin-bottom: 24px;
                }
                .filter-bar-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 14px;
                }
                .filter-label {
                    font-weight: 600;
                    color: #2d3748;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 0.95rem;
                }
                .filter-controls {
                    display: flex;
                    gap: 16px;
                    flex-wrap: wrap;
                }
                .filter-group {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    min-width: 180px;
                    flex: 1;
                }
                .filter-group label {
                    font-size: 0.78rem;
                    font-weight: 600;
                    color: #718096;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }
                .filter-group select {
                    height: 38px;
                    border: 1px solid #cbd5e0;
                    border-radius: 6px;
                    padding: 0 10px;
                    font-size: 0.9rem;
                    background: white;
                    color: #2d3748;
                    cursor: pointer;
                }
                .filter-group select:disabled {
                    background: #edf2f7;
                    cursor: not-allowed;
                    color: #a0aec0;
                }
                .filter-hint {
                    font-size: 0.75rem;
                    color: #718096;
                }
                .filter-hint--warn {
                    color: #e53e3e;
                }
                .btn-reset-filter {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    background: none;
                    border: 1px solid #e53e3e;
                    color: #e53e3e;
                    padding: 6px 12px;
                    border-radius: 6px;
                    font-size: 0.85rem;
                    cursor: pointer;
                    transition: all 0.15s;
                }
                .btn-reset-filter:hover {
                    background: #fff5f5;
                }
                .filter-summary {
                    margin-top: 12px;
                    padding-top: 12px;
                    border-top: 1px dashed #e2e8f0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    flex-wrap: wrap;
                    font-size: 0.88rem;
                    color: #4a5568;
                }
                .filter-tag {
                    background: #ebf8ff;
                    color: #2b6cb0;
                    border: 1px solid #bee3f8;
                    padding: 2px 10px;
                    border-radius: 20px;
                    font-size: 0.82rem;
                    font-weight: 500;
                }
            `}</style>
        </div>
    );
}

function UserRow({ user, matieres, examTypes, promotionsList, onSave }) {
    const [promotion, setPromotion]   = useState(user.assigned_promotion     || '');
    const [typeExamen, setTypeExamen] = useState(user.assigned_type_examen   || '');
    const [matiereId, setMatiereId]   = useState(user.assigned_matiere_id    || '');
    const [population, setPopulation] = useState(user.assigned_population    || 'all');

    // Listes cascadées locales à cette ligne
    const [rowExamTypes, setRowExamTypes]   = useState([]);
    const [rowMatieres, setRowMatieres]     = useState([]);
    const [loadingExam, setLoadingExam]     = useState(false);
    const [loadingMat, setLoadingMat]       = useState(false);

    const getAuthHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    // Charger les examens quand la promotion change
    useEffect(() => {
        if (!promotion) {
            setRowExamTypes([]);
            setTypeExamen('');
            setRowMatieres([]);
            setMatiereId('');
            return;
        }
        setLoadingExam(true);
        axios.get(`${API_BASE_URL}/api/examens?promotion=${promotion}`, getAuthHeaders())
            .then(res => {
                setRowExamTypes(res.data);
                // Si l'examen courant n'existe pas dans la nouvelle liste, reset
                setTypeExamen(prev => {
                    const exists = res.data.find(e => e.nom_modele === prev);
                    if (!exists) { setRowMatieres([]); setMatiereId(''); return ''; }
                    return prev;
                });
            })
            .catch(() => { setRowExamTypes([]); setTypeExamen(''); })
            .finally(() => setLoadingExam(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promotion]);

    // Charger les matières quand l'examen change
    useEffect(() => {
        if (!typeExamen || !promotion) {
            setRowMatieres([]);
            setMatiereId('');
            return;
        }
        setLoadingMat(true);
        axios.get(
            `${API_BASE_URL}/api/matieres-par-examen?typeExamen=${typeExamen}&promotion=${promotion}`,
            getAuthHeaders()
        )
            .then(res => {
                setRowMatieres(res.data);
                setMatiereId(prev => {
                    if (!prev) return prev;
                    const exists = res.data.find(m => m.id.toString() === prev.toString());
                    return exists ? prev : '';
                });
            })
            .catch(() => { setRowMatieres([]); setMatiereId(''); })
            .finally(() => setLoadingMat(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typeExamen, promotion]);

    const isChanged =
        matiereId.toString() !== (user.assigned_matiere_id  || '').toString() ||
        typeExamen            !== (user.assigned_type_examen || '')             ||
        promotion             !== (user.assigned_promotion   || '')             ||
        population            !== (user.assigned_population  || 'all');

    const handleReset = () => {
        setPromotion(''); setTypeExamen(''); setMatiereId(''); setPopulation('all');
        onSave(user.id, { matiereId: null, typeExamen: null, promotion: null, population: 'all' });
    };

    return (
        <tr>
            {/* Utilisateur */}
            <td>
                <strong>{user.prenom} {user.nom}</strong>
                <br /><small>@{user.nom_utilisateur}</small>
            </td>

            {/* 1. Promotion */}
            <td>
                <select value={promotion} onChange={e => setPromotion(e.target.value)}>
                    <option value="">-- Toutes --</option>
                    {(promotionsList.length > 0 ? promotionsList : GENERATED_PROMOTIONS)
                        .map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </td>

            {/* 2. Type d'Examen (filtré par promotion) */}
            <td>
                <select
                    value={typeExamen}
                    onChange={e => setTypeExamen(e.target.value)}
                    disabled={!promotion || loadingExam}
                    style={{ minWidth: 120 }}
                >
                    <option value="">-- Aucun --</option>
                    {(promotion ? rowExamTypes : examTypes)
                        .map(et => <option key={et.id} value={et.nom_modele}>{et.nom_modele}</option>)}
                </select>
                {loadingExam && <small style={{ color: '#718096', fontSize: '0.72rem' }}>…</small>}
            </td>

            {/* 3. Matière (filtrée par examen + promotion) */}
            <td>
                <select
                    value={matiereId}
                    onChange={e => setMatiereId(e.target.value)}
                    disabled={!typeExamen || loadingMat}
                    style={{ minWidth: 120 }}
                >
                    <option value="">-- Aucune --</option>
                    {(typeExamen ? rowMatieres : matieres)
                        .map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                </select>
                {loadingMat && <small style={{ color: '#718096', fontSize: '0.72rem' }}>…</small>}
            </td>

            {/* 4. Population */}
            <td>
                <select
                    value={population}
                    onChange={e => setPopulation(e.target.value)}
                    style={{
                        backgroundColor: population !== 'all' ? '#eef2ff' : 'white',
                        fontWeight:       population !== 'all' ? '600'     : 'normal'
                    }}
                >
                    <option value="all">Tous les élèves</option>
                    <option value="actif">Liste Originale (Actifs)</option>
                    <option value="conseil">Liste Conseil (Ajournés/Red.)</option>
                </select>
            </td>

            {/* Actions */}
            <td>
                <button
                    className={`btn-save ${isChanged ? 'active' : ''}`}
                    disabled={!isChanged}
                    onClick={() => onSave(user.id, { matiereId, typeExamen, promotion, population })}
                >
                    <FaSave /> Enregistrer
                </button>
                <button
                    className="btn-reset"
                    onClick={handleReset}
                    title="Effacer l'assignation"
                >
                    <FaEraser />
                </button>
            </td>
        </tr>
    );
}

export default ConfigurationAssignation;
