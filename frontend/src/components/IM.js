import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import Select from 'react-select';
import apiPaths from '../config/apiPaths';
import IncognitoAnalyse from './IA';
import './IM.css';

// Note : La surveillance globale (clics, inputs, heartbeat) est maintenant gérée par GlobalActivityTracker dans App.js

const logFrontendActivity = async (description) => {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const url = (apiPaths.logs && apiPaths.logs.frontendActivity) ? apiPaths.logs.frontendActivity : '/api/logs/frontend-activity';
        await axios.post(url, { description }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) {}
};

const LogModal = ({ show, onClose, logs, loading, error, view, onSwitchToAll, onMarkAllRead }) => {
    const [expandedUser, setExpandedUser] = useState(null);

    const groupedLogs = useMemo(() => {
        if (!logs) return [];
        const groups = {};
        logs.forEach(log => {
            const userName = log.nom_utilisateur || 'Inconnu';
            if (!groups[userName]) { groups[userName] = { name: userName, logs: [], unreadCount: 0 }; }
            groups[userName].logs.push(log);
            if (log.statut === 'non_vu') { groups[userName].unreadCount += 1; }
        });
        return Object.values(groups).sort((a, b) => b.unreadCount - a.unreadCount);
    }, [logs]);

    if (!show) return null;

    const toggleUser = (userName) => { setExpandedUser(expandedUser === userName ? null : userName); };
    const title = view === 'unread' ? "Activités Récentes (Non Lues)" : "Journal d'Activité Global";

    return (
        <div className="modal-overlay">
            <div className="modal-content log-modal-content">
                <div className="modal-header">
                    <h3>{title}</h3>
                    <button onClick={onClose} className="close-button">&times;</button>
                </div>
                <div className="modal-body">
                    {loading && <p>Chargement...</p>}
                    {error && <p className="error-message">{error}</p>}
                    {!loading && !error && groupedLogs.length === 0 && (
                        <p style={{textAlign: 'center', padding: '20px'}}>Aucune activité trouvée.</p>
                    )}
                    {!loading && !error && groupedLogs.length > 0 && (
                        <div className="user-log-list">
                            {groupedLogs.map(userGroup => (
                                <div key={userGroup.name} className={`user-log-group ${expandedUser === userGroup.name ? 'expanded' : ''}`}>
                                    <div className="user-log-header" onClick={() => toggleUser(userGroup.name)}>
                                        <div className="user-info">
                                            <span className="user-icon">👤</span>
                                            <span className="user-name">{userGroup.name}</span>
                                        </div>
                                        <div className="user-meta">
                                            {userGroup.unreadCount > 0 && <span className="badge-unread">{userGroup.unreadCount} non lu(s)</span>}
                                            <span className="toggle-arrow">{expandedUser === userGroup.name ? '▲' : '▼'}</span>
                                        </div>
                                    </div>
                                    {expandedUser === userGroup.name && (
                                        <div className="user-log-details">
                                            <table className="log-table">
                                                <thead><tr><th>Date</th><th>Action</th><th>Détail</th></tr></thead>
                                                <tbody>
                                                    {userGroup.logs.map(log => (
                                                        <tr key={log.id} className={log.statut === 'non_vu' ? 'log-unread' : ''}>
                                                            <td>{new Date(log.date_action).toLocaleString('fr-FR')}</td>
                                                            <td><span className={`log-type ${log.type_action.toLowerCase()}`}>{log.type_action}</span></td>
                                                            <td>{log.description}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="modal-actions">
                    <button className="btn btn-warning" onClick={onMarkAllRead} style={{marginRight: 'auto'}}>✔ Tout lu</button>
                    {view === 'unread' && <button className="btn btn-secondary" onClick={onSwitchToAll}>Historique complet</button>}
                    <button className="btn btn-primary" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
};

const ConnectedUsersPanel = () => {
    const [onlineUsers, setOnlineUsers] = useState([]);

    useEffect(() => {
        const fetchOnline = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get('/api/users/online', { headers: { Authorization: `Bearer ${token}` } });
                setOnlineUsers(res.data);
            } catch (e) {}
        };
        fetchOnline();
        const interval = setInterval(fetchOnline, 10000);
        return () => clearInterval(interval);
    }, []);

    if (onlineUsers.length === 0) return null;

    return (
        <div style={{
            position: 'fixed', bottom: '10px', left: '10px',
            background: 'var(--surface-color)', border: '1px solid var(--border-color)',
            padding: '10px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            zIndex: 1000, fontSize: '0.85rem'
        }}>
            <strong>🟢 En ligne ({onlineUsers.length})</strong>
            <ul style={{listStyle: 'none', padding: 0, margin: '5px 0 0 0'}}>
                {onlineUsers.map(u => (
                    <li key={u.id} style={{marginBottom: '4px'}}>
                        {u.nom_utilisateur}
                        <span style={{fontSize: '0.75em', color: '#888', marginLeft: '5px'}}>
                           ({u.login_time ? new Date(u.login_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '?'})
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

const IncognitoMoyenne = () => {
    const [mode, setMode] = useState('manual');
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [keywordInput, setKeywordInput] = useState('');
    const [keywordError, setKeywordError] = useState('');
    const CORRECT_KEYWORD = 'antesakaboyz23';

    const handleKeywordSubmit = (e) => {
        e.preventDefault();
        if (keywordInput.trim() === CORRECT_KEYWORD) {
            logFrontendActivity("A accédé au Mode Stratégique.");
            setIsUnlocked(true);
            setKeywordError('');
        } else {
            logFrontendActivity(`Echec mot-clé: "${keywordInput}"`);
            setKeywordError('Mot-clé incorrect.');
            setKeywordInput('');
        }
    };

    if (!isUnlocked) {
        return (
            <div className="card" style={{ maxWidth: '500px', margin: '40px auto' }}>
                {/* GlobalTracker retiré ici car présent dans App.js */}
                <h2>Accès Restreint</h2>
                <form onSubmit={handleKeywordSubmit}>
                    <div className="form-group">
                        <label>Mot-clé</label>
                        <input type="password" value={keywordInput} onChange={(e) => setKeywordInput(e.target.value)} autoFocus />
                    </div>
                    {keywordError && <p className="error-message">{keywordError}</p>}
                    <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>Déverrouiller</button>
                </form>
            </div>
        );
    }

    return (
        <>
            {/* GlobalTracker retiré ici car présent dans App.js */}
            <ConnectedUsersPanel />
            {mode === 'analyse' ? (
                <IncognitoAnalyse onBack={() => setMode('manual')} />
            ) : (
                <IncognitoManualContent onSwitchToAnalyse={() => setMode('analyse')} />
            )}
        </>
    );
};

const IncognitoManualContent = ({ onSwitchToAnalyse }) => {
    const [classement, setClassement] = useState([]);
    const [matieres, setMatieres] = useState([]);
    const [examConfigs, setExamConfigs] = useState([]);
    const [selectedExamModel, setSelectedExamModel] = useState(null);
    const [classementMap, setClassementMap] = useState(new Map());
    const [selectedEleveId, setSelectedEleveId] = useState('');
    const [selectedMatiereIds, setSelectedMatiereIds] = useState([]);
    const [targetType, setTargetType] = useState('moyenne');
    const [moyenneVisee, setMoyenneVisee] = useState('');
    const [rangVise, setRangVise] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [allSuggestions, setAllSuggestions] = useState([]);
    const [plan, setPlan] = useState([]);

    const [showLogModal, setShowLogModal] = useState(false);
    const [activityLogs, setActivityLogs] = useState([]);
    const [logLoading, setLogLoading] = useState(false);
    const [logError, setLogError] = useState('');
    const [unreadLogsCount, setUnreadLogsCount] = useState(0);
    const [logModalView, setLogModalView] = useState('unread');

    const fetchUnreadCount = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(apiPaths.logs.unreadCount, { headers: { Authorization: `Bearer ${token}` } });
            setUnreadLogsCount(res.data.count);
        } catch (error) {}
    }, []);

    useEffect(() => {
        logFrontendActivity("Page Mode Stratégique ouverte.");
        fetchUnreadCount();
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };

        Promise.all([
            axios.get(apiPaths.incognito.classementActuel, config),
            axios.get(apiPaths.matieres.base, config),
            axios.get('/api/configuration/examens', config)
        ]).then(([resClassement, resMatieres, resConfigs]) => {
            setClassement(resClassement.data);
            const map = new Map(resClassement.data.map(e => [e.id, e]));
            setClassementMap(map);
            setMatieres(resMatieres.data);
            setExamConfigs(resConfigs.data);
        }).catch(() => setError("Erreur chargement données.")).finally(() => setLoading(false));
    }, [fetchUnreadCount]);

    const handleExamModelChange = async (selectedOption) => {
        setSelectedExamModel(selectedOption);
        setSelectedEleveId('');
        setPlan([]);
        setAllSuggestions([]);
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };
        setLoading(true);
        try {
            if (selectedOption) {
                logFrontendActivity(`Contexte examen: ${selectedOption.label}`);
                const configExamen = examConfigs.find(c => c.id === selectedOption.value);
                if (configExamen && configExamen.configurations) {
                    const subjectIds = configExamen.configurations.map(c => c.matiere_id);
                    setSelectedMatiereIds(subjectIds);
                }
                const res = await axios.get(`/api/resultats/classement-details?typeExamen=${selectedOption.label}`, config);
                if (res.data && res.data.classement) {
                    setClassement(res.data.classement);
                    const map = new Map(res.data.classement.map(e => [e.id, e]));
                    setClassementMap(map);
                }
            } else {
                logFrontendActivity("Contexte Général.");
                setSelectedMatiereIds([]);
                const res = await axios.get(apiPaths.incognito.classementActuel, config);
                setClassement(res.data);
                const map = new Map(res.data.map(e => [e.id, e]));
                setClassementMap(map);
            }
        } catch (err) { setError("Erreur mise à jour classement."); } finally { setLoading(false); }
    };

    const examModelOptions = useMemo(() => examConfigs.map(c => ({ value: c.id, label: c.nom_modele })), [examConfigs]);

    const handleOpenLogModal = async () => {
        setShowLogModal(true);
        setLogLoading(true);
        setLogError('');
        logFrontendActivity("Ouverture du journal.");
        try {
            const token = localStorage.getItem('token');
            const config = { headers: { Authorization: `Bearer ${token}` } };
            const resUnread = await axios.get(apiPaths.logs.unread, config);

            if (resUnread.data.length > 0) {
                setActivityLogs(resUnread.data);
                setLogModalView('unread');
            } else {
                const resAll = await axios.get(apiPaths.logs.activites, config);
                setActivityLogs(resAll.data);
                setLogModalView('all');
            }
        } catch (error) { setLogError("Erreur chargement journal."); } finally { setLogLoading(false); }
    };

    const handleSwitchToAllLogs = async () => {
        setLogLoading(true);
        setLogModalView('all');
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get(apiPaths.logs.activites, { headers: { Authorization: `Bearer ${token}` } });
            setActivityLogs(res.data);
        } catch (error) { setLogError("Erreur historique."); } finally { setLogLoading(false); }
    };

    const handleMarkAllRead = async () => {
        try {
            const token = localStorage.getItem('token');
            await axios.put(apiPaths.logs.markAsRead, {}, { headers: { Authorization: `Bearer ${token}` } });
            setUnreadLogsCount(0);
            if(logModalView === 'unread') {
                handleSwitchToAllLogs();
            } else {
                const res = await axios.get(apiPaths.logs.activites, { headers: { Authorization: `Bearer ${token}` } });
                setActivityLogs(res.data);
            }
        } catch (error) {}
    };

    const eleveOptions = useMemo(() => classement.map(e => ({ value: e.id, label: `${e.rang}. ${e.prenom} ${e.nom} (${e.moyenne ? parseFloat(e.moyenne).toFixed(2) : 'N/A'})` })), [classement]);
    const selectedEleveData = useMemo(() => selectedEleveId ? classementMap.get(parseInt(selectedEleveId, 10)) : null, [selectedEleveId, classementMap]);

    const availableSuggestions = useMemo(() => {
        if (!allSuggestions.length) return [];
        const plannedDonneurIds = new Set(plan.map(p => p.donneur.id));
        const plannedMatiereIds = new Set(plan.map(p => p.matiere.id));
        return allSuggestions.filter(sugg => !plannedDonneurIds.has(sugg.donneur.id) && !plannedMatiereIds.has(sugg.matiere.id));
    }, [allSuggestions, plan]);

    const simulationResult = useMemo(() => {
        if (!selectedEleveData || plan.length === 0) return null;
        let simulatedMoyenne = parseFloat(selectedEleveData.moyenne || 0);
        const totalCoefficients = matieres.reduce((sum, m) => sum + parseFloat(m.coefficient_legacy || m.coefficient || 0), 0);
        if (totalCoefficients === 0) return null;
        plan.forEach(swap => {
            const matFound = matieres.find(m => m.id == swap.matiere.id);
            const coeffMatiere = parseFloat(matFound?.coefficient_legacy || matFound?.coefficient || 0);
            let noteActuelle = 0;
            if (selectedEleveData.notesDetail) {
                const detail = selectedEleveData.notesDetail[swap.matiere.id];
                if (typeof detail === 'object' && detail !== null && detail.note !== undefined) { noteActuelle = parseFloat(detail.note); }
                else if (typeof detail === 'string' || typeof detail === 'number') { noteActuelle = parseFloat(detail); }
            }
            const noteDonneur = parseFloat(swap.noteAEchanger);
            if (coeffMatiere > 0) {
                const ecartPoints = (noteDonneur - noteActuelle) * coeffMatiere;
                const impactMoyenne = ecartPoints / totalCoefficients;
                simulatedMoyenne += impactMoyenne;
            }
        });
        const otherEleves = classement.filter(e => e.id !== selectedEleveData.id);
        const newRank = otherEleves.filter(e => e && e.moyenne != null && parseFloat(e.moyenne) > simulatedMoyenne).length + 1;
        return { moyenne: simulatedMoyenne.toFixed(2), rang: newRank };
    }, [plan, selectedEleveData, classement, matieres]);

    const handleSearch = async (e) => {
        e.preventDefault();
        const isTargetValid = (targetType === 'moyenne' && moyenneVisee) || (targetType === 'rang' && rangVise);
        if (!selectedEleveId || !isTargetValid) { setError("Sélectionnez un élève et un objectif."); return; }

        logFrontendActivity(`Recherche pour ${selectedEleveData ? selectedEleveData.nom : selectedEleveId}. Cible: ${targetType} ${targetType==='moyenne' ? moyenneVisee : rangVise}.`);
        setLoading(true); setError(''); setAllSuggestions([]);

        const token = localStorage.getItem('token');
        try {
            const payload = { eleveCibleId: selectedEleveId, matiereIds: selectedMatiereIds, moyenneVisee: targetType === 'moyenne' ? moyenneVisee : null, rangVise: targetType === 'rang' ? rangVise : null };
            const response = await axios.post(apiPaths.incognito.suggestionsMoyenne, payload, { headers: { Authorization: `Bearer ${token}` } });
            setAllSuggestions(response.data);
            if (response.data.length === 0) { setError("Aucun échange trouvé."); }
        } catch (err) { setError(err.response?.data?.message || "Erreur."); } finally { setLoading(false); }
    };

    const addToPlan = (suggestion) => {
        logFrontendActivity(`Plan: Ajout échange ${suggestion.matiere.nom} (Note: ${suggestion.noteAEchanger}).`);
        setPlan(prev => [...prev, suggestion]);
    };

    const removeFromPlan = (suggestion) => {
        logFrontendActivity(`Plan: Retrait ${suggestion.matiere.nom}.`);
        setPlan(prev => prev.filter(s => s.donneur.copie_id !== suggestion.donneur.copie_id));
    };

    const handleExecutePlan = async () => {
        if (plan.length === 0) return;
        if (window.confirm(`Confirmer ${plan.length} échange(s)?`)) {
            setLoading(true); setError('');
            logFrontendActivity(`Exécution du plan confirmée.`);
            const token = localStorage.getItem('token');
            try {
                await axios.post(apiPaths.incognito.executerPlan, { plan }, { headers: { Authorization: `Bearer ${token}` } });
                alert("Succès !");
                window.location.reload();
            } catch (err) { setError(err.response?.data?.message || "Erreur exécution."); setLoading(false); }
        } else {
            logFrontendActivity("Exécution plan annulée.");
        }
    };

    const handleMatiereChange = (matiereId) => {
        const isAdding = !selectedMatiereIds.includes(matiereId);
        setSelectedMatiereIds(prevIds => isAdding ? [...prevIds, matiereId] : prevIds.filter(id => id !== matiereId));
    };

    const customSelectStyles = {
        control: (provided) => ({ ...provided, backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)', borderRadius: 'var(--border-radius)' }),
        singleValue: (provided) => ({ ...provided, color: 'var(--text-primary-color)' }),
        input: (provided) => ({ ...provided, color: 'var(--text-primary-color)' }),
        menu: (provided) => ({ ...provided, backgroundColor: 'var(--surface-color)', borderRadius: 'var(--border-radius)', zIndex: 5 }),
        option: (provided, state) => ({ ...provided, backgroundColor: state.isFocused ? 'var(--background-color)' : 'var(--surface-color)', color: 'var(--text-primary-color)' }),
    };

    return (
        <>
            <LogModal
                show={showLogModal}
                onClose={() => setShowLogModal(false)}
                logs={activityLogs}
                loading={logLoading}
                error={logError}
                view={logModalView}
                onSwitchToAll={handleSwitchToAllLogs}
                onMarkAllRead={handleMarkAllRead}
            />

            <div className="card strategic-mode-card">
                <div className="card-header">
                    <h2 className="card-header-title"><span className="icon">♟️</span>Mode Stratégique : Manuel</h2>
                    <div style={{display:'flex', gap:'10px'}}>
                        <button className="btn btn-primary" onClick={onSwitchToAnalyse} style={{backgroundColor: '#673ab7', borderColor: '#673ab7'}}>
                            🚀 Analyse Automatique
                        </button>
                        <button className="btn btn-secondary btn-log" onClick={handleOpenLogModal}>
                            Journal {unreadLogsCount > 0 && <span className="unread-badge">{unreadLogsCount}</span>}
                        </button>
                    </div>
                </div>
                <p className="warning-text">Construisez un plan d'échanges manuellement ou utilisez l'analyse automatique.</p>
                <form onSubmit={handleSearch}>
                     <div className="form-grid-tri">
                        <div className="form-group">
                            <label>1. Type d'Examen</label>
                            <Select options={examModelOptions} value={selectedExamModel} onChange={handleExamModelChange} placeholder={examConfigs.length === 0 ? "General" : "Choisir..."} isClearable styles={customSelectStyles} />
                        </div>
                        <div className="form-group">
                            <label>2. Élève Cible</label>
                            <Select options={eleveOptions} value={eleveOptions.find(o => o.value === selectedEleveId)} onChange={so => {
                                setSelectedEleveId(so ? so.value : '');
                                if(so) logFrontendActivity(`Sélection élève ID: ${so.value}`);
                            }} placeholder="Rechercher..." isClearable styles={customSelectStyles} isDisabled={loading} />
                        </div>
                        <div className="form-group">
                            <label>3. Objectif & Matières</label>
                            <div className="target-switcher" style={{marginBottom: '10px'}}>
                                <button type="button" className={targetType === 'moyenne' ? 'active' : ''} onClick={() => setTargetType('moyenne')}>Moyenne</button>
                                <button type="button" className={targetType === 'rang' ? 'active' : ''} onClick={() => setTargetType('rang')}>Rang</button>
                            </div>
                            {targetType === 'moyenne' ? (<input type="number" min="0" max="20" step="0.01" value={moyenneVisee} onChange={e => setMoyenneVisee(e.target.value)} placeholder="Ex: 13.50" required disabled={!selectedEleveId} style={{marginBottom: '10px'}} />) : (<input type="number" min="1" value={rangVise} onChange={e => setRangVise(e.target.value)} placeholder={`Ex: 5`} required disabled={!selectedEleveId} style={{marginBottom: '10px'}} />)}
                            <div className="checkbox-group" style={{ maxHeight: '100px', overflowY: 'auto', border: '1px solid var(--border-color)', padding: '10px', borderRadius: 'var(--border-radius)' }}>
                                {matieres.map(m => (<label key={m.id} className="checkbox-label"><input type="checkbox" checked={selectedMatiereIds.includes(m.id)} onChange={() => handleMatiereChange(m.id)} disabled={!selectedEleveId}/>{m.nom_matiere}</label>))}
                            </div>
                        </div>
                    </div>
                    {selectedEleveData && (<div className="current-info-centered">Infos Actuelles : <strong>Moyenne {selectedEleveData.moyenne ? parseFloat(selectedEleveData.moyenne).toFixed(2) : 'N/A'}</strong> / <strong>Rang {selectedEleveData.rang || 'N/A'}</strong></div>)}
                    <button type="submit" className="btn btn-primary" style={{width: '100%'}} disabled={loading || !selectedEleveId}>{loading ? 'Recherche...' : 'Chercher des options'}</button>
                </form>

                {error && <p className="error-message">{error}</p>}

                {(allSuggestions.length > 0 || plan.length > 0) && selectedEleveData && (
                    <div className="planner-section">
                        <div className="planner-column">
                            <h3>Échanges Disponibles</h3>
                            {availableSuggestions.map(sugg => (
                                <div key={sugg.donneur.copie_id} className="suggestion-item">
                                    <div className="suggestion-info">
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <strong>{sugg.matiere.nom}</strong>
                                            <span style={{fontSize: '0.9em', color: 'var(--text-secondary-color)'}}>Note à récupérer: <b>{parseFloat(sugg.noteAEchanger).toFixed(2)}</b></span>
                                        </div>
                                        <div style={{fontSize: '0.85em', marginTop: '8px', padding: '8px', backgroundColor: 'var(--background-color)', borderRadius: '4px', border: '1px solid var(--border-color)'}}>
                                            <div style={{fontWeight: 'bold', marginBottom: '4px'}}>
                                                Donneur: {sugg.donneur.prenom} {sugg.donneur.nom}
                                            </div>
                                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px'}}>
                                                <div>
                                                    <span style={{color: 'var(--text-secondary-color)'}}>Moyenne:</span><br/>
                                                    {sugg.donneur.moyenneActuelle} ➝ <strong>{sugg.donneur.moyenneSimulee}</strong>
                                                </div>
                                                <div>
                                                    <span style={{color: 'var(--text-secondary-color)'}}>Rang:</span><br/>
                                                    {sugg.donneur.rang_actuel} ➝ <strong>{sugg.donneur.rangSimule}</strong>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="suggestion-impact" style={{marginTop: '6px', backgroundColor: 'rgba(76, 175, 80, 0.1)', padding: '5px', borderRadius: '4px'}}>
                                            <span style={{color: '#4caf50', fontWeight: 'bold'}}>
                                                Moyenne : {parseFloat(selectedEleveData.moyenne).toFixed(2)} ➜ {sugg.simulation ? sugg.simulation.moyenneCible : '???'}
                                                {sugg.simulation && sugg.simulation.gainMoyenne && ` (+${sugg.simulation.gainMoyenne})`}
                                            </span>
                                        </div>
                                    </div>
                                    <button onClick={() => addToPlan(sugg)} className="btn-add">+</button>
                                </div>
                            ))}
                        </div>
                        <div className="planner-column">
                            <h3>Votre Plan ({plan.length})</h3>
                            {plan.map(sugg => (
                                <div key={sugg.donneur.copie_id} className="suggestion-item planned">
                                    <span><strong>{sugg.matiere.nom}</strong> : note {parseFloat(sugg.noteAEchanger).toFixed(2)}</span>
                                    <button onClick={() => removeFromPlan(sugg)} className="btn-remove">-</button>
                                </div>
                            ))}
                            {simulationResult && (
                                <div className="simulation-summary">
                                    <h4>Impact du Plan</h4>
                                    <p>Moyenne: {parseFloat(selectedEleveData.moyenne).toFixed(2)} → <strong>{simulationResult.moyenne}</strong></p>
                                    <p>Rang: {selectedEleveData.rang} → <strong>{simulationResult.rang}</strong></p>
                                </div>
                            )}
                            <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                                <button onClick={() => {
                                    setPlan([]);
                                    logFrontendActivity("Plan vidé manuellement.");
                                }} className="btn btn-secondary" disabled={plan.length === 0} style={{flex: 1}}>Vider</button>
                                <button onClick={handleExecutePlan} className="btn btn-primary btn-execute-plan" disabled={loading || plan.length === 0} style={{flex: 2}}>Exécuter le Plan</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default IncognitoMoyenne;
