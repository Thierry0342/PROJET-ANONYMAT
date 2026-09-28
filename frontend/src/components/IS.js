// Contenu pour src/components/IncognitoSwap.js (Adapté au style de App.css)

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiPaths from '../config/apiPaths';
// Le nouveau fichier CSS qui utilise les variables de App.css
import './IS.css';

const IncognitoSwap = () => {
    const [matieres, setMatieres] = useState([]);
    const [eleves, setEleves] = useState([]);
    const [selectedMatiere, setSelectedMatiere] = useState('');
    const [selectedEleve, setSelectedEleve] = useState('');
    const [noteVisee, setNoteVisee] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [currentInfo, setCurrentInfo] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const config = { headers: { Authorization: `Bearer ${token}` } };
        axios.get(apiPaths.matieres.base, config).then(res => setMatieres(res.data));
        axios.get(apiPaths.eleves.base, config).then(res => setEleves(res.data));
    }, []);

    useEffect(() => {
        const fetchCurrentInfo = async () => {
            if (selectedEleve && selectedMatiere) {
                const token = localStorage.getItem('token');
                try {
                    const res = await axios.get(apiPaths.resultats.base, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    const info = res.data.find(r => r.eleve_id == selectedEleve && r.matiere_id == selectedMatiere);
                    setCurrentInfo(info || { note: 'N/A', copie_id: null });
                } catch (e) {
                    setCurrentInfo({ note: 'Erreur', copie_id: null });
                }
            } else {
                setCurrentInfo(null);
            }
        };
        fetchCurrentInfo();
    }, [selectedEleve, selectedMatiere]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!selectedMatiere || !selectedEleve || !noteVisee) {
            setError("Veuillez remplir tous les champs.");
            return;
        }
        setLoading(true);
        setError('');
        setSuggestions([]);
        const token = localStorage.getItem('token');
        try {
            const response = await axios.post(apiPaths.incognito.suggestions, {
                matiereId: selectedMatiere,
                eleveCibleId: selectedEleve,
                noteVisee: noteVisee,
            }, { headers: { Authorization: `Bearer ${token}` } });
            setSuggestions(response.data);
            if (response.data.length === 0) {
                 setError("Aucune suggestion trouvée. Essayez une autre note visée.");
            }
        } catch (err) {
            setError(err.response?.data?.message || "Une erreur est survenue.");
        } finally {
            setLoading(false);
        }
    };

    const handleExecuteSwap = async (donneur) => {
        if (!currentInfo || !currentInfo.copie_id) {
            alert("Impossible de trouver la copie de l'élève cible. A-t-il bien une note dans cette matière ?");
            return;
        }
        const eleveCible = eleves.find(e => e.id == selectedEleve);
        const confirmation = window.confirm(
            `Êtes-vous certain de vouloir échanger les copies ?\n\n` +
            `CIBLE : ${eleveCible.prenom} ${eleveCible.nom} (Note actuelle: ${currentInfo.note})\n` +
            `DONNEUR : ${donneur.prenom} ${donneur.nom} (Note: ${donneur.note})\n\n` +
            `Après l'échange, ${eleveCible.nom} aura la note ${donneur.note} et ${donneur.nom} aura la note ${currentInfo.note}.\n`+
            `CETTE ACTION EST IRRÉVERSIBLE.`
        );

        if (confirmation) {
            setLoading(true);
            setError('');
            const token = localStorage.getItem('token');
            try {
                 await axios.post(apiPaths.incognito.executerEchange, {
                    copieIdCible: currentInfo.copie_id,
                    copieIdDonneur: donneur.copie_id,
                }, { headers: { Authorization: `Bearer ${token}` } });
                alert("L'échange a été effectué avec succès !");
                setSelectedEleve('');
                setNoteVisee('');
                setSuggestions([]);
                setCurrentInfo(null);
            } catch (err) {
                setError(err.response?.data?.message || "L'échange a échoué.");
            } finally {
                setLoading(false);
            }
        }
    };

    // La classe "incognito-container" a été retirée pour laisser "main-content" gérer l'espacement.
    // La classe "incognito-card" est remplacée par "card" pour hériter des styles globaux.
    return (
        <div className="card">
            <div className="incognito-header">
                <span className="incognito-icon">🤫</span>
                {/* Le h2 hérite maintenant des styles de .card h2 de App.css */}
                <h2>Mode Discret : Échange de Notes</h2>
            </div>
            <p className="warning-text">
                <strong>Attention :</strong> Cette interface permet de modifier les attributions de notes de manière irréversible. Utilisez avec une extrême prudence.
            </p>
            <form onSubmit={handleSearch}>
                <div className="form-grid">
                    {/* Les .form-group et les inputs/selects utiliseront les styles de App.css */}
                    <div className="form-group">
                        <label>1. Sélectionner une matière</label>
                        <select value={selectedMatiere} onChange={e => setSelectedMatiere(e.target.value)} required>
                            <option value="">-- Choisir une matière --</option>
                            {matieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label>2. Sélectionner l'élève à favoriser</label>
                        <select value={selectedEleve} onChange={e => setSelectedEleve(e.target.value)} required disabled={!selectedMatiere}>
                            <option value="">-- Choisir un élève --</option>
                            {eleves.map(e => <option key={e.id} value={e.id}>{e.prenom} {e.nom} ({e.numero_incorporation})</option>)}
                        </select>
                    </div>
                     {currentInfo && (
                        <div className="current-info">
                            Note actuelle de l'élève cible : <strong>{currentInfo.note}</strong>
                        </div>
                    )}
                    <div className="form-group">
                        <label>3. Saisir la note désirée</label>
                        <input type="number" min="0" max="20" step="0.25" value={noteVisee} onChange={e => setNoteVisee(e.target.value)} placeholder="Ex: 14.5" required disabled={!selectedEleve} />
                    </div>
                </div>
                {/* Le bouton utilise maintenant les classes globales .btn .btn-primary .btn-block */}
                <button type="submit" className="btn btn-primary btn-block" disabled={loading || !selectedEleve}>
                    {loading ? 'Recherche...' : 'Trouver des suggestions'}
                </button>
            </form>
            {error && <p className="error-message">{error}</p>}
            {suggestions.length > 0 && (
                <div className="suggestions-section">
                    <h3>4. Choisir une copie à échanger</h3>
                    <table className="suggestions-table">
                        <thead>
                            <tr>
                                <th>Prénom & Nom</th>
                                <th>N° Incorp.</th>
                                <th>Note Actuelle</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {suggestions.map(sugg => (
                                <tr key={sugg.copie_id}>
                                    <td>{sugg.prenom} {sugg.nom}</td>
                                    <td>{sugg.numero_incorporation}</td>
                                    <td className="note-value">{sugg.note}</td>
                                    <td>
                                        {/* Le bouton utilise maintenant les classes .btn .btn-danger */}
                                        <button className="btn btn-danger" onClick={() => handleExecuteSwap(sugg)} disabled={loading}>
                                            Échanger
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default IncognitoSwap;
