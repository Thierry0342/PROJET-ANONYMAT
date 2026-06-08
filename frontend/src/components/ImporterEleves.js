import React, { useState } from 'react';
import axios from 'axios';
import './ImporterEleves.css';
import apiPaths from '../config/apiPaths';

const ImporterEleves = () => {
    const [selectedFile, setSelectedFile] = useState(null);
    const [promotion, setPromotion] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const [previewData, setPreviewData] = useState(null);
    const [showModal, setShowModal] = useState(false);
    const [isConfirming, setIsConfirming] = useState(false);

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
        if (!promotion || promotion.trim() === '') {
            setError('Veuillez renseigner le nom de la promotion.');
            return;
        }

        setIsLoading(true);
        setError('');
        setMessage('');

        const formData = new FormData();
        formData.append('fichierEleves', selectedFile);
        formData.append('promotion', promotion.trim());

        const token = localStorage.getItem('token');

        try {
            const response = await axios.post('/api/eleves/importer-previsualisation', formData, {
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
        formData.append('fichierEleves', selectedFile);
        formData.append('promotion', promotion.trim());

        const token = localStorage.getItem('token');

        try {
            const response = await axios.post(apiPaths.eleves.importer, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    'Authorization': `Bearer ${token}`
                },
            });
            setMessage(response.data.message);
            setShowModal(false);
            setPreviewData(null);
            setSelectedFile(null);
            setPromotion('');
            document.getElementById('file-input').value = '';
        } catch (err) {
            setError(err.response?.data?.message || 'Une erreur est survenue lors de l\'importation.');
        } finally {
            setIsConfirming(false);
        }
    };

    return (
        <div className="importer-container">
            <div className="card">
                <h2>Importer la Liste des Élèves</h2>

                <div className="instructions">
                    <p>
                        Sélectionnez un fichier Excel (.xlsx, .xls). Le fichier doit respecter le format suivant (la première ligne est ignorée) :
                    </p>
                    <ul>
                        <li><strong>Colonne A :</strong> Numéro d'Incorporation (Obligatoire et unique)</li>
                        <li><strong>Colonne B :</strong> Nom et Prénom (Format : <code>NOM Prénom</code>)</li>
                        <li><strong>Colonne C :</strong> Sexe (<code>M</code> pour masculin, <code>F</code> pour féminin)</li>
                        <li><strong>Colonne D :</strong> Escadron (Numéro)</li>
                        <li><strong>Colonne E :</strong> Peloton (Numéro)</li>
                    </ul>
                    <div className="alert-info">
                        <strong>Information :</strong> L'importation n'effacera aucune donnée passée. Les élèves présents dans le fichier seront <strong>ajoutés</strong> en tant que nouvelles recrues sous la promotion que vous allez définir.
                    </div>
                </div>

                <form onSubmit={handlePreview} className="importer-form">
                    <div className="form-group">
                        <label htmlFor="promotion-input">Nom de la nouvelle Promotion :</label>
                        <input
                            type="text"
                            id="promotion-input"
                            placeholder="Ex: 79E..."
                            value={promotion}
                            onChange={(e) => { setPromotion(e.target.value); setError(''); setMessage(''); }}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="file-input">Fichier Excel :</label>
                        <input
                            type="file"
                            id="file-input"
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
                        <h3>Prévisualisation de l'importation</h3>
                        <p><strong>Promotion attribuée :</strong> {promotion.trim()}</p>
                        <p><strong>Total de nouveaux élèves reconnus :</strong> <span className="badge-total">{previewData.total}</span></p>

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
                                        <th>Sexe</th>
                                        <th>Escadron</th>
                                        <th>Peloton</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {previewData.donneesValides.slice(0, 30).map((d, i) => (
                                        <tr key={i}>
                                            <td>{d.numero_incorporation}</td>
                                            <td>{d.nom_prenom}</td>
                                            <td>{d.sexe === 'masculin' ? 'M' : d.sexe === 'feminin' ? 'F' : '-'}</td>
                                            <td>{d.escadron || '-'}</td>
                                            <td>{d.peloton || '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {previewData.total > 30 && (
                                <p className="preview-more">... et {previewData.total - 30} autres élèves non affichés.</p>
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

export default ImporterEleves;
