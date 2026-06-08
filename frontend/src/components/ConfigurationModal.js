import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ConfigurationModal.css';

const ConfigurationModal = ({ matieres, onClose }) => {
    const [config, setConfig] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState(null);
    const [newModelName, setNewModelName] = useState('');
    const [localMatieres, setLocalMatieres] = useState(matieres);
    const [newMatiereName, setNewMatiereName] = useState('');

    useEffect(() => {
        setLocalMatieres(matieres);
    }, [matieres]);

    const fetchConfig = () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        axios.get('/api/configuration/examens', { headers: { Authorization: `Bearer ${token}` } })
            .then(response => {
                setConfig(response.data);
                if (activeTab === null && response.data.length > 0) {
                    setActiveTab(response.data[0].id);
                } else if (response.data.length === 0) {
                    setActiveTab(null);
                }
            })
            .catch(error => console.error("Erreur chargement", error))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const handleGlobalCoeffChange = (modeleId, value) => {
        setConfig(prev => prev.map(m => m.id === modeleId ? { ...m, coefficient_general: value } : m));
    };

    const handlePopulationCibleChange = (modeleId, value) => {
        setConfig(prev => prev.map(m => m.id === modeleId ? { ...m, population_cible: value } : m));
    };

    const handleCheckboxChange = (modeleId, matiereId, isChecked) => {
         setConfig(prev => prev.map(modele => {
            if (modele.id === modeleId) {
                let newConfigurations;
                if (isChecked) {
                    newConfigurations = [...modele.configurations, { matiere_id: matiereId, coefficient: 1 }];
                } else {
                    newConfigurations = modele.configurations.filter(conf => conf.matiere_id !== matiereId);
                }
                return { ...modele, configurations: newConfigurations };
            }
            return modele;
        }));
    };

    const handleMatiereCoeffChange = (modeleId, matiereId, value) => {
        setConfig(prev => prev.map(modele => {
            if (modele.id === modeleId) {
                return {
                    ...modele,
                    configurations: modele.configurations.map(conf =>
                        conf.matiere_id === matiereId ? { ...conf, coefficient: value } : conf
                    )
                };
            }
            return modele;
        }));
    };

    const handleSave = () => {
        const token = localStorage.getItem('token');
        axios.put('/api/configuration/examens', config, { headers: { Authorization: `Bearer ${token}` } })
            .then(() => {
                alert('Configuration sauvegardée avec succès.');
                onClose();
            })
            .catch(error => alert('Erreur sauvegarde: ' + (error.response?.data?.message || error.message)));
    };

    const handleAddModel = () => {
        if (!newModelName.trim()) return;
        const token = localStorage.getItem('token');
        axios.post('/api/configuration/examens', { nom_modele: newModelName }, { headers: { Authorization: `Bearer ${token}` } })
            .then(response => {
                setConfig(prev => [...prev, response.data]);
                setActiveTab(response.data.id);
                setNewModelName('');
            })
            .catch(error => alert('Erreur création: ' + (error.response?.data?.message || error.message)));
    };

    const handleDeleteModel = (modeleId, modeleNom) => {
        if (window.confirm(`Supprimer le modèle "${modeleNom}" ?`)) {
            const token = localStorage.getItem('token');
            axios.delete(`/api/configuration/examens/${modeleId}`, { headers: { Authorization: `Bearer ${token}` } })
                .then(() => {
                    setConfig(prev => {
                        const newConfig = prev.filter(m => m.id !== modeleId);
                        if (activeTab === modeleId) setActiveTab(newConfig.length > 0 ? newConfig[0].id : null);
                        return newConfig;
                    });
                })
                .catch(error => alert('Erreur suppression: ' + (error.response?.data?.message || error.message)));
        }
    };

    const handleAddMatiere = () => {
        if (!newMatiereName.trim()) return;
        const token = localStorage.getItem('token');
        axios.post('/api/matieres', { nom_matiere: newMatiereName }, { headers: { Authorization: `Bearer ${token}` } })
            .then(response => {
                setLocalMatieres(prev => [...prev, response.data]);
                setNewMatiereName('');
            })
            .catch(error => alert('Erreur matière: ' + (error.response?.data?.message || error.message)));
    };

    const getActiveModele = () => config.find(m => m.id === activeTab);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Configuration des Examens</h3>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    {loading ? <p>Chargement...</p> : (
                        <div className="config-container">
                            <div className="config-tabs">
                                {config.map(modele => (
                                    <button
                                        key={modele.id}
                                        className={`tab-button ${activeTab === modele.id ? 'active' : ''}`}
                                        onClick={() => setActiveTab(modele.id)}
                                    >
                                        {modele.nom_modele}
                                    </button>
                                ))}
                                <div className="add-model-form">
                                    <input
                                        type="text"
                                        placeholder="Nouveau modèle..."
                                        value={newModelName}
                                        onChange={e => setNewModelName(e.target.value)}
                                        onKeyPress={e => e.key === 'Enter' && handleAddModel()}
                                    />
                                    <button onClick={handleAddModel}>+</button>
                                </div>
                            </div>
                            <div className="config-content">
                                {getActiveModele() && (
                                    <div className="tab-pane active">
                                        <div className="config-row">
                                            <div className="form-group">
                                                <label>Population Cible :</label>
                                                <select 
                                                    value={getActiveModele().population_cible || 'all'} 
                                                    onChange={(e) => handlePopulationCibleChange(getActiveModele().id, e.target.value)}
                                                >
                                                    <option value="all">Tous les élèves (Actifs + Conseil)</option>
                                                    <option value="actif">Uniquement les Actifs</option>
                                                    <option value="conseil">Uniquement le Conseil</option>
                                                </select>
                                            </div>
                                            <div className="form-group">
                                                <label>Coeff. Moyenne Générale :</label>
                                                <input
                                                    type="number"
                                                    step="0.1"
                                                    value={getActiveModele().coefficient_general}
                                                    onChange={e => handleGlobalCoeffChange(getActiveModele().id, parseFloat(e.target.value) || 0)}
                                                />
                                            </div>
                                        </div>
                                        <hr/>
                                        <div className="add-matiere-form">
                                            <input
                                                type="text"
                                                placeholder="Créer une nouvelle matière..."
                                                value={newMatiereName}
                                                onChange={e => setNewMatiereName(e.target.value)}
                                                onKeyPress={e => e.key === 'Enter' && handleAddMatiere()}
                                            />
                                            <button onClick={handleAddMatiere}>Créer et Ajouter</button>
                                        </div>
                                        <div className="matiere-coeffs-grid">
                                            {localMatieres.map(matiere => {
                                                const configMatiere = getActiveModele().configurations.find(c => c.matiere_id === matiere.id);
                                                const isChecked = !!configMatiere;
                                                return (
                                                    <div key={matiere.id} className="matiere-config-item">
                                                        <input
                                                            type="checkbox"
                                                            id={`check-${getActiveModele().id}-${matiere.id}`}
                                                            checked={isChecked}
                                                            onChange={(e) => handleCheckboxChange(getActiveModele().id, matiere.id, e.target.checked)}
                                                        />
                                                        <label htmlFor={`check-${getActiveModele().id}-${matiere.id}`}>{matiere.nom_matiere}</label>
                                                        {isChecked && (
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                value={configMatiere.coefficient}
                                                                onChange={e => handleMatiereCoeffChange(getActiveModele().id, matiere.id, parseFloat(e.target.value) || 0)}
                                                            />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="delete-model-section">
                                             <button className="btn-delete-model" onClick={() => handleDeleteModel(getActiveModele().id, getActiveModele().nom_modele)}>
                                                Supprimer le modèle "{getActiveModele().nom_modele}"
                                             </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="modal-actions">
                    <button className="btn-save" onClick={handleSave} disabled={loading}>Sauvegarder</button>
                    <button className="btn-cancel" onClick={onClose}>Fermer</button>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationModal;
