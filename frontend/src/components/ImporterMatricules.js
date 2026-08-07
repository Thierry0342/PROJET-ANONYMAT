import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './ImporterEleves.css'; // réutilise le même style

const ImporterMatricules = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [promotions, setPromotions] = useState([]);
    const [promotion, setPromotion] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const [previewData, setPreviewData] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

    useEffect(() => {
        const fetchPromotions = async () => {
            try {
                const token = localStorage.getItem('token');
                const res = await axios.get('/api/promotions', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setPromotions(res.data || []);
            } catch (err) {
                console.error("Erreur chargement promotions", err);
            }
        };
        fetchPromotions();
    }, []);

    const handleFileChange = (event) => {
        setSelectedFile(event.target.files[0]);
        setMessage('');
        setError('');
    };

    const handlePreview = async (event) => {
        event.preventDefault();
        if (!selectedFile) {
            setError('Veuillez sélectionner un fichier Excel.');
            return;
        }
        if (!promotion) {
            setError('Veuillez sélectionner une promotion.');
            return;
        }

        setIsLoading(true);
        setError('');
        setMessage('');

        const formData = new FormData();
        formData.append('fichierMatricules', selectedFile);
        formData.append('promotion', promotion);

        const token = localStorage.getItem('token');

        try {
            const response = await axios.post('/api/eleves/importer-matricules-previsualisation', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                },
            });
            setPreviewData(response.data);
            setShowModal(true);
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue lors de la prévisualisation.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmImport = async () => {
        setIsConfirming(true);
        setError('');

        const formData = new FormData();
        formData.append('fichierMatricules', selectedFile);
        formData.append('promotion', promotion);

        const token = localStorage.getItem('token');

        try {
            const response = await axios.post('/api/eleves/importer-matricules', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                },
            });
            setMessage(response.data.message);
            setShowModal(false);
            setPreviewData(null);
            setSelectedFile(null);
            document.getElementById('file-input-matricule').value = '';
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue lors de l\'importation.');
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <div className="importer-container">
            <div className="card">
                <h2>Importer les Matricules (MLE)</h2>

                <div className="instructions">
                    <p>
                        Sélectionnez un fichier Excel (.xlsx, .xls). Le fichier doit respecter le format suivant (la première ligne est ignorée) :
                    </p>
                    <ul>
                        <li><strong>Colonne A :</strong> Numéro d'Incorporation (doit déjà exister pour la promotion choisie)</li>
                        <li><strong>Colonne B :</strong> Matricule (MLE)</li>
                    </ul>
                    <div className="alert-info">
                        <strong>Information :</strong> Cette importation <strong>met à jour</strong> le matricule des élèves déjà présents dans la promotion sélectionnée. Les numéros d'incorporation introuvables seront listés en erreur et ignorés.
                    </div>
                </div>

                <form onSubmit={handlePreview} className="importer-form">
                    <div className="form-group">
                        <label htmlFor="promotion-select">Promotion concernée :</label>
                        <select
                            id="promotion-select"
                            value={promotion}
                            onChange={(e) => { setPromotion(e.target.value); setError(''); setMessage(''); }}
                            required
                        >
                            <option value="">-- Sélectionner une promotion --</option>
                            {promotions.map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group">
                        <label htmlFor="file-input-matricule">Fichier Excel :</label>
                        <input
                            type="file"
                            id="file-input-matricule"
                            accept=".xlsx, .xls"
                            onChange={handleFileChange}
                        />
                    </div>

                    <button type="submit" className="btn btn-primary btn-block" disabled={isLoading || !selectedFile || !promotion}>
                        {isLoading ? 'Analyse en cours...' : 'Prévisualiser l\'importation'}
                    </button>
                </form>

                {message && <div className="success-message">{message}</div>}
                {error && <div className="error-message">{error}</div>}
            </div>

            {/* MODALE DE PRÉVISUALISATION */}
            {showModal && previewData && (
                <div className="modal-overlay">
                    <div className="modal-content importer-modal">
                        <h3>Prévisualisation de l'importation des matricules</h3>
                        <p><strong>Promotion :</strong> {promotion}</p>
                        <p><strong>Total de matricules valides :</strong> <span className="badge-total">{previewData.total}</span></p>

                        {previewData.erreurs && previewData.erreurs.length > 0 && (
                            <div className="preview-errors">
                                <h4>⚠️ Problèmes détectés ({previewData.erreurs.length})</h4>
                                <ul>
                                    {previewData.erreurs.map((err, i) => (
                                        <li key={i}>Ligne {err.ligne} : {err.message}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="preview-table">
                            <table>
                                <thead>
                                    <tr>
                                        <th>N° Incorp</th>
                                        <th>Nom & Prénom</th>
                                        <th>Ancien Matricule</th>
                                        <th>Nouveau Matricule</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.donneesValides.slice(0, 30).map((d, i) => (
                                        <tr key={i}>
                                            <td>{d.numero_incorporation}</td>
                                            <td>{d.nom} {d.prenom}</td>
                                            <td style={{ color: '#888' }}>{d.ancienMatricule}</td>
                                            <td><strong>{d.matricule}</strong></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {previewData.total > 30 && (
                                <p className="preview-more">... et {previewData.total - 30} autres matricules non affichés.</p>
                            )}
                        </div>

                        <div className="modal-actions">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={isConfirming}>
                                Annuler
                            </button>
                            <button className="btn btn-primary" onClick={handleConfirmImport} disabled={isConfirming || previewData.total === 0}>
                                {isConfirming ? 'Enregistrement en cours...' : 'Valider et Importer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImporterMatricules;