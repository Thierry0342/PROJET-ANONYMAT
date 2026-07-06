import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ConfigurationModal.css';

const ConfigurationModal = ({ matieres, onClose, promotions, defaultPromotion }) => {
    // ✅ Pré-sélectionner la promotion passée en prop (dernière promotion active)
    const [selectedPromotion, setSelectedPromotion] = useState(defaultPromotion || '');
    const [config, setConfig] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(null);
    const [newModelName, setNewModelName] = useState('');
    const [newDateDebut, setNewDateDebut] = useState('');
    const [newDateFin, setNewDateFin] = useState('');
    const [localMatieres, setLocalMatieres] = useState(matieres);
    const [newMatiereName, setNewMatiereName] = useState('');

    useEffect(() => {
        setLocalMatieres(matieres);
    }, [matieres]);

    // ─── Charger la config dès qu'une promotion est choisie ───────────────────
    const fetchConfig = (promo) => {
        if (!promo) return;
        setLoading(true);
        setConfig([]);
        setActiveTab(null);
        const token = localStorage.getItem('token');
        axios
            .get(`/api/configuration/examens?promotion=${promo}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then((response) => {
                setConfig(response.data);
                if (response.data.length > 0) {
                    setActiveTab(response.data[0].id);
                }
            })
            .catch((err) => console.error('Erreur chargement config', err))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchConfig(selectedPromotion);
    }, [selectedPromotion]);

    // ─── Handlers ─────────────────────────────────────────────────────────────
    const handleGlobalCoeffChange = (modeleId, value) => {
        setConfig((prev) =>
            prev.map((m) =>
                m.id === modeleId ? { ...m, coefficient_general: value } : m
            )
        );
    };

    const handleDateChange = (modeleId, field, value) => {
        setConfig((prev) =>
            prev.map((m) => (m.id === modeleId ? { ...m, [field]: value } : m))
        );
    };

    const handleCheckboxChange = (modeleId, matiereId, isChecked) => {
        setConfig((prev) =>
            prev.map((modele) => {
                if (modele.id !== modeleId) return modele;
                const newConfigurations = isChecked
                    ? [...modele.configurations, { matiere_id: matiereId, coefficient: 1 }]
                    : modele.configurations.filter((c) => c.matiere_id !== matiereId);
                return { ...modele, configurations: newConfigurations };
            })
        );
    };

    const handleMatiereCoeffChange = (modeleId, matiereId, value) => {
        setConfig((prev) =>
            prev.map((modele) => {
                if (modele.id !== modeleId) return modele;
                return {
                    ...modele,
                    configurations: modele.configurations.map((conf) =>
                        conf.matiere_id === matiereId
                            ? { ...conf, coefficient: value }
                            : conf
                    ),
                };
            })
        );
    };

    const handleSave = () => {
        const token = localStorage.getItem('token');
        axios
            .put('/api/configuration/examens', config, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then(() => {
                alert('Configuration sauvegardée avec succès.');
                fetchConfig(selectedPromotion);
            })
            .catch((err) =>
                alert('Erreur sauvegarde : ' + (err.response?.data?.message || err.message))
            );
    };

    const handleAddModel = () => {
        if (!newModelName.trim()) {
            alert('Le nom du modèle est requis.');
            return;
        }
        if (!selectedPromotion) {
            alert('Veuillez sélectionner une promotion.');
            return;
        }
        const token = localStorage.getItem('token');
        axios
            .post(
                '/api/configuration/examens',
                {
                    nom_modele: newModelName.trim(),
                    promotion: selectedPromotion,
                 
                },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            .then((response) => {
                setConfig((prev) => [...prev, response.data]);
                setActiveTab(response.data.id);
                setNewModelName('');
               
            })
            .catch((err) =>
                alert('Erreur création : ' + (err.response?.data?.message || err.message))
            );
    };

    const handleDeleteModel = (modeleId, modeleNom) => {
        if (!window.confirm(`Supprimer le modèle "${modeleNom}" pour la promotion ${selectedPromotion} ?`))
            return;
        const token = localStorage.getItem('token');
        axios
            .delete(`/api/configuration/examens/${modeleId}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            .then(() => {
                setConfig((prev) => {
                    const newConfig = prev.filter((m) => m.id !== modeleId);
                    setActiveTab(newConfig.length > 0 ? newConfig[0].id : null);
                    return newConfig;
                });
            })
            .catch((err) =>
                alert('Erreur suppression : ' + (err.response?.data?.message || err.message))
            );
    };

    const handleAddMatiere = () => {
        if (!newMatiereName.trim()) return;
        const token = localStorage.getItem('token');
        axios
            .post(
                '/api/matieres',
                { nom_matiere: newMatiereName },
                { headers: { Authorization: `Bearer ${token}` } }
            )
            .then((response) => {
                setLocalMatieres((prev) => [...prev, response.data]);
                setNewMatiereName('');
            })
            .catch((err) =>
                alert('Erreur matière : ' + (err.response?.data?.message || err.message))
            );
    };

    const getActiveModele = () => config.find((m) => m.id === activeTab);

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content large-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <h3>Configuration des Examens par Promotion</h3>
                    <button className="close-button" onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div className="modal-body">
                    {/* ── Sélecteur de promotion ── */}
                    <div
                        style={{
                            background: '#f0f4ff',
                            border: '1px solid #c7d2fe',
                            borderRadius: '8px',
                            padding: '14px 18px',
                            marginBottom: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '14px',
                        }}
                    >
                        <label
                            style={{ fontWeight: '700', color: '#3730a3', whiteSpace: 'nowrap' }}
                        >
                            Promotion à configurer :
                        </label>
                        <select
                            className="form-select"
                            value={selectedPromotion}
                            onChange={(e) => setSelectedPromotion(e.target.value)}
                            style={{ minWidth: '180px' }}
                        >
                            <option value="">-- Choisir --</option>
                            {(promotions || []).map((p) => (
                                <option key={p} value={p}>
                                    {p}
                                </option>
                            ))}
                        </select>

                        {selectedPromotion && (
                            <span
                                style={{
                                    background: '#4f46e5',
                                    color: 'white',
                                    padding: '4px 12px',
                                    borderRadius: '20px',
                                    fontSize: '0.82rem',
                                    fontWeight: '600',
                                }}
                            >
                                Promotion {selectedPromotion}
                            </span>
                        )}
                    </div>

                    {/* ── Message si aucune promotion sélectionnée ── */}
                    {!selectedPromotion && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '50px 20px',
                                color: '#94a3b8',
                            }}
                        >
                            <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🎓</div>
                            <p style={{ fontSize: '1rem' }}>
                                Sélectionnez une promotion pour voir ou créer sa configuration
                                d'examens.
                            </p>
                            <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>
                                Chaque promotion possède ses propres modèles d'examens et
                                coefficients.
                            </p>
                        </div>
                    )}

                    {/* ── Contenu config ── */}
                    {selectedPromotion && (
                        <>
                            {loading ? (
                                <p style={{ textAlign: 'center', padding: '30px' }}>
                                    Chargement...
                                </p>
                            ) : (
                                <div className="config-container">
                                    {/* ── Onglets des modèles ── */}
                                    <div className="config-tabs">
                                        {config.length === 0 && (
                                            <p
                                                style={{
                                                    color: '#94a3b8',
                                                    fontSize: '0.85rem',
                                                    padding: '8px',
                                                }}
                                            >
                                                Aucun modèle pour cette promotion.
                                            </p>
                                        )}
                                        {config.map((modele) => (
                                            <button
                                                key={modele.id}
                                                className={`tab-button ${
                                                    activeTab === modele.id ? 'active' : ''
                                                }`}
                                                onClick={() => setActiveTab(modele.id)}
                                            >
                                                {modele.nom_modele}
                                            </button>
                                        ))}

                                        {/* Formulaire ajout modèle */}
                                        <div
                                            className="add-model-form"
                                            style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                                        >
                                            <input
                                                type="text"
                                                placeholder="Nom du nouveau modèle..."
                                                value={newModelName}
                                                onChange={(e) => setNewModelName(e.target.value)}
                                                onKeyPress={(e) =>
                                                    e.key === 'Enter' && handleAddModel()
                                                }
                                            />
                                       
                                            <button onClick={handleAddModel}>+ Créer</button>
                                        </div>
                                    </div>

                                    {/* ── Contenu de l'onglet actif ── */}
                                    <div className="config-content">
                                        {!getActiveModele() && config.length > 0 && (
                                            <p style={{ color: '#94a3b8', padding: '20px' }}>
                                                Sélectionnez un modèle.
                                            </p>
                                        )}

                                        {getActiveModele() && (
                                            <div className="tab-pane active">
                                                {/* Paramètres généraux */}
                                                <div className="config-row">
                                                    <div className="form-group">
                                                        <label>
                                                            Coeff. Moyenne Générale :
                                                        </label>
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={getActiveModele().coefficient_general}
                                                            onChange={(e) =>
                                                                handleGlobalCoeffChange(
                                                                    getActiveModele().id,
                                                                    parseFloat(e.target.value) || 0
                                                                )
                                                            }
                                                        />
                                                    </div>
                                                   
                                                </div>

                                                {/* Promotion affichée en lecture seule */}
                                                <div
                                                    style={{
                                                        background: '#f8fafc',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: '6px',
                                                        padding: '8px 14px',
                                                        marginBottom: '12px',
                                                        fontSize: '0.85rem',
                                                        color: '#475569',
                                                    }}
                                                >
                                                    <strong>Promotion liée :</strong>{' '}
                                                    {getActiveModele().promotion || selectedPromotion}
                                                </div>

                                                <hr />

                                                {/* Créer une nouvelle matière */}
                                                <div className="add-matiere-form">
                                                    <input
                                                        type="text"
                                                        placeholder="Créer une nouvelle matière globale..."
                                                        value={newMatiereName}
                                                        onChange={(e) =>
                                                            setNewMatiereName(e.target.value)
                                                        }
                                                        onKeyPress={(e) =>
                                                            e.key === 'Enter' && handleAddMatiere()
                                                        }
                                                    />
                                                    <button onClick={handleAddMatiere}>
                                                        Créer et Ajouter
                                                    </button>
                                                </div>

                                                {/* Grille matières / coefficients */}
                                                <div className="matiere-coeffs-grid">
                                                    {localMatieres.map((matiere) => {
                                                        const configMatiere =
                                                            getActiveModele().configurations.find(
                                                                (c) => c.matiere_id === matiere.id
                                                            );
                                                        const isChecked = !!configMatiere;
                                                        return (
                                                            <div
                                                                key={matiere.id}
                                                                className="matiere-config-item"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    id={`check-${getActiveModele().id}-${matiere.id}`}
                                                                    checked={isChecked}
                                                                    onChange={(e) =>
                                                                        handleCheckboxChange(
                                                                            getActiveModele().id,
                                                                            matiere.id,
                                                                            e.target.checked
                                                                        )
                                                                    }
                                                                />
                                                                <label
                                                                    htmlFor={`check-${getActiveModele().id}-${matiere.id}`}
                                                                >
                                                                    {matiere.nom_matiere}
                                                                </label>
                                                                {isChecked && (
                                                                    <input
                                                                        type="number"
                                                                        step="0.1"
                                                                        min="0"
                                                                        value={configMatiere.coefficient}
                                                                        onChange={(e) =>
                                                                            handleMatiereCoeffChange(
                                                                                getActiveModele().id,
                                                                                matiere.id,
                                                                                parseFloat(e.target.value) || 0
                                                                            )
                                                                        }
                                                                    />
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Supprimer le modèle */}
                                                <div className="delete-model-section">
                                                    <button
                                                        className="btn-delete-model"
                                                        onClick={() =>
                                                            handleDeleteModel(
                                                                getActiveModele().id,
                                                                getActiveModele().nom_modele
                                                            )
                                                        }
                                                    >
                                                        Supprimer le modèle "
                                                        {getActiveModele().nom_modele}"
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="modal-actions">
                    <button
                        className="btn-save"
                        onClick={handleSave}
                        disabled={loading || !selectedPromotion || config.length === 0}
                    >
                        Sauvegarder
                    </button>
                    <button className="btn-cancel" onClick={onClose}>
                        Fermer
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfigurationModal;
