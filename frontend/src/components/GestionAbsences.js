import React, { useState, useEffect } from 'react';
import axios from 'axios';
import apiPaths from '../config/apiPaths';
import { FaSearch, FaUserSlash, FaTrash, FaPlus, FaSave, FaTimes, FaEdit, FaListUl, FaUndo } from 'react-icons/fa';
import './GestionAbsences.css';

const GestionAbsences = () => {
    const [matieres, setMatieres] = useState([]);
    const [typesExamens, setTypesExamens] = useState([]); // NOUVEAU
    const [selectedTypeExamen, setSelectedTypeExamen] = useState(''); // NOUVEAU
    
    const [selectedMatieres, setSelectedMatieres] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedEleve, setSelectedEleve] = useState(null);
    const [motif, setMotif] = useState('');
    const [absencesTemporaires, setAbsencesTemporaires] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [listeAbsences, setListeAbsences] = useState([]);
    const [editingAbsence, setEditingAbsence] = useState(null);
    const [promotionsList, setPromotionsList] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('');
    const [filtrePromotion, setFiltrePromotion] = useState('');

    useEffect(() => {
        // Charger les matières
        axios.get('/api/promotions')
    .then(res => {
        setPromotionsList(res.data);
        if (res.data.length > 0) setSelectedPromotion(res.data[0]);
    })
    .catch(err => console.error('Erreur chargement promotions', err));
        axios.get(apiPaths.matieres.base)
            .then(res => setMatieres(res.data))
            .catch(err => setError('Erreur lors du chargement des matières.'));
            
        // Charger les types d'examens (NOUVEAU)
        axios.get('/api/examens')
            .then(res => setTypesExamens(res.data))
            .catch(err => console.error('Erreur chargement types examens', err));
    }, []);

    const clearMessages = () => {
        setError('');
        setSuccess('');
    };

    const resetForm = () => {
        setSelectedEleve(null);
        setSelectedMatieres({});
        setMotif('');
        setSearchTerm('');
        setSelectedTypeExamen(''); // Reset du type
        setSearchResults([]);
        if (document.getElementById('select-all-matieres')) {
            document.getElementById('select-all-matieres').checked = false;
        }
    };

    const handleSearch = async (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        if (value.length > 2) {
            try {
                const res = await axios.get(`${apiPaths.eleves.recherche}?q=${value}&promotion=${selectedPromotion}`);
                setSearchResults(res.data);
            } catch (err) { console.error("Erreur de recherche d'élève:", err); }
        } else {
            setSearchResults([]);
        }
    };

    const handleSelectEleve = (eleve) => {
        setSelectedEleve(eleve);
        setSearchTerm('');
        setSearchResults([]);
    };

    const handleAddAbsence = () => {
        clearMessages();
        const matieresAbsence = matieres.filter(m => selectedMatieres[m.id]);

        if (!selectedEleve) {
            setError("Veuillez d'abord sélectionner un élève.");
            return;
        }
        // Validation du type d'examen (NOUVEAU)
        if (!selectedTypeExamen) {
            setError("Veuillez sélectionner le type d'examen (ex: Partiel, Final...).");
            return;
        }
        if (matieresAbsence.length === 0) {
            setError("Veuillez sélectionner au moins une matière.");
            return;
        }

        // Vérification doublon local
        const existeDeja = absencesTemporaires.some(a => 
            a.eleve.id === selectedEleve.id && 
            a.type_examen === selectedTypeExamen && // On vérifie aussi le type
            a.matieres.some(m => matieresAbsence.map(ma => ma.id).includes(m.id))
        );

        if (existeDeja) {
            setError("Cet élève est déjà dans la liste pour ce type d'examen.");
            return;
        }

        setAbsencesTemporaires(prev => [
            ...prev, 
            { 
                eleve: selectedEleve, 
                matieres: matieresAbsence, 
                motif: motif.trim(),
                type_examen: selectedTypeExamen // AJOUT
            }
        ]);
        resetForm();
    };

    const handleRemoveAbsence = (index) => {
        // On supprime par index car un élève peut être là plusieurs fois pour des exams différents
        setAbsencesTemporaires(prev => prev.filter((_, i) => i !== index));
    };

    const handleSaveAll = async () => {
        if (absencesTemporaires.length === 0) {
            setError("La liste des absences à enregistrer est vide.");
            return;
        }
        setLoading(true);
        clearMessages();
        try {
            const res = await axios.post(apiPaths.absences.bulk, absencesTemporaires);
            setSuccess(res.data.message);
            setAbsencesTemporaires([]);
        } catch (err) {
            setError(err.response?.data?.message || "Une erreur est survenue.");
        } finally {
            setLoading(false);
        }
    };

const fetchAbsences = async (promotion = '') => {
    setLoading(true);
    try {
        const params = promotion ? `?promotion=${promotion}` : '';
        const res = await axios.get(`/api/absences${params}`);
        setListeAbsences(res.data);
    } catch (err) {
        setError("Impossible de charger la liste des absences.");
    } finally {
        setLoading(false);
    }
};

    const handleOpenModal = () => {
        clearMessages();
        fetchAbsences();
        setFiltrePromotion('');
        setIsModalOpen(true);
    };

    const handleDeleteFromList = async (eleveId) => {
        if (window.confirm("Êtes-vous sûr de vouloir supprimer toutes les absences pour cet élève ?")) {
            clearMessages();
            try {
                await axios.delete(`/api/absences/${eleveId}`);
                setSuccess("Absence supprimée.");
                fetchAbsences();
            } catch (err) {
                setError("Erreur lors de la suppression.");
            }
        }
    };

    // La fonction d'édition est simplifiée ici (désactivée pour le changement de type pour éviter les conflits complexes)
    // Idéalement, il faut supprimer et recréer si on s'est trompé de type d'examen.

    return (
        <div className="gestion-absences-container">
            <div className="header-with-button">
                <h1><FaUserSlash /> Gérer les Absences aux Examens</h1>
                <button className="btn btn-info" onClick={handleOpenModal}>
                    <FaListUl /> Voir la liste des absents
                </button>
            </div>

            <p className="description">
                Cette page permet de marquer un ou plusieurs élèves comme 'Absent' pour un type d'examen précis.
            </p>

            {error && <div className="alert alert-danger">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}
            <div className="form-section">
                <h3>Promotion</h3>
                <div className="form-group">
                    <select
                        className="form-control"
                        value={selectedPromotion}
                        onChange={(e) => {
                            setSelectedPromotion(e.target.value);
                            setFiltrePromotion(e.target.value);
                            fetchAbsences(e.target.value);
                            setSelectedEleve(null);
                            setSearchTerm('');
                            setSearchResults([]);
                        }}
                    >
                        <option value="">-- Toutes les promotions --</option>
                        {promotionsList.map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="form-section">
                <h3>Étape 1 : Chercher et sélectionner l'élève</h3>
                <div className="search-box">
                    <FaSearch className="search-icon" />
                    <input type="text" className="form-control" placeholder="Chercher par N° d'incorporation, nom ou prénom..." value={searchTerm} onChange={handleSearch} />
                    {searchResults.length > 0 && <ul className="search-results">{searchResults.map(eleve => (<li key={eleve.id} onClick={() => handleSelectEleve(eleve)}>{eleve.numero_incorporation} - {eleve.nom} {eleve.prenom}</li>))}</ul>}
                </div>

                {selectedEleve && (
                    <div className="selected-eleve-info">
                        <p><strong>N° Incorp. :</strong> {selectedEleve.numero_incorporation}</p>
                        <p><strong>Nom & Prénom :</strong> {selectedEleve.nom} {selectedEleve.prenom}</p>
                    </div>
                )}
            </div>

            <div className="form-section">
                <h3>Étape 2 : Type d'examen, matières et motif</h3>
                
                {/* NOUVEAU SELECTEUR TYPE EXAMEN */}
                <div className="form-group mb-3">
                    <label><strong>Type d'examen *</strong></label>
                    <select 
                        className="form-control" 
                        value={selectedTypeExamen} 
                        onChange={(e) => setSelectedTypeExamen(e.target.value)}
                    >
                        <option value="">-- Sélectionner le type --</option>
                        {typesExamens.map(type => (
                            <option key={type.id} value={type.nom_modele}>{type.nom_modele}</option>
                        ))}
                    </select>
                </div>

                <div className="matieres-selection">
                    <div className="form-check">
                        <input className="form-check-input" type="checkbox" id="select-all-matieres" onChange={(e) => setSelectedMatieres(matieres.reduce((acc, m) => ({...acc, [m.id]: e.target.checked}), {}))}/>
                        <label className="form-check-label" htmlFor="select-all-matieres"><strong>Toutes les matières</strong></label>
                    </div>
                    <hr />
                    <div className="matieres-list">{matieres.map(matiere => (<div key={matiere.id} className="form-check form-check-inline"><input className="form-check-input" type="checkbox" id={`matiere-${matiere.id}`} checked={!!selectedMatieres[matiere.id]} onChange={() => setSelectedMatieres(prev => ({ ...prev, [matiere.id]: !prev[matiere.id] }))} /><label className="form-check-label" htmlFor={`matiere-${matiere.id}`}>{matiere.nom_matiere}</label></div>))}</div>
                </div>
                <div className="form-group mt-3">
                    <label>Motif (optionnel)</label>
                    <input type="text" className="form-control" placeholder="Ex: Raison médicale, permission..." value={motif} onChange={(e) => setMotif(e.target.value)} />
                </div>
            </div>

            <button className="btn btn-primary btn-lg" onClick={handleAddAbsence} disabled={!selectedEleve || !selectedTypeExamen || Object.values(selectedMatieres).filter(Boolean).length === 0}><FaPlus /> Ajouter à la liste</button>

            {absencesTemporaires.length > 0 && (
                <div className="temp-table-section">
                    <h3>Liste des absences à enregistrer</h3>
                    <table className="table table-striped table-hover">
                        <thead><tr><th>N° Incorp.</th><th>Nom & Prénom</th><th>Type Examen</th><th>Matières</th><th>Motif</th><th>Actions</th></tr></thead>
                        <tbody>{absencesTemporaires.map((absence, index) => (
                            <tr key={index}>
                                <td>{absence.eleve.numero_incorporation}</td>
                                <td>{absence.eleve.nom} {absence.eleve.prenom}</td>
                                <td><span className="badge badge-info">{absence.type_examen}</span></td>
                                <td><ul className="matieres-tags">{absence.matieres.map(m => <li key={m.id}>{m.nom_matiere}</li>)}</ul></td>
                                <td>{absence.motif || <span className="text-muted">Aucun</span>}</td>
                                <td><button className="btn btn-danger btn-sm" onClick={() => handleRemoveAbsence(index)}><FaTrash /></button></td>
                            </tr>
                        ))}</tbody>
                    </table>
                    <button className="btn btn-success btn-block mt-3" onClick={handleSaveAll} disabled={loading}>{loading ? 'Enregistrement en cours...' : <><FaSave /> Enregistrer toutes les absences</>}</button>
                </div>
            )}

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>Liste des élèves absents</h2>
                            <button className="close-button" onClick={() => setIsModalOpen(false)}><FaTimes /></button>
                        </div>
                        <div className="modal-body">
                            <div className="form-group mb-3"> 
                                 <select
                                    className="form-control"
                                    value={filtrePromotion}
                                   onChange={(e) => {
                                        setFiltrePromotion(e.target.value);
                                        fetchAbsences(e.target.value); 
                                    }}
                                >
                                    <option value="">-- Toutes les promotions --</option>
                                    {promotionsList.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                            
                            
                            
                            {loading ? <p>Chargement...</p> : (
                                <table className="table table-bordered">
                                    <thead><tr><th>N° Incorp.</th><th>Nom & Prénom</th><th>Détails (Type : Matière)</th><th>Motif</th><th>Actions</th></tr></thead>
                                  <tbody>
                                    {listeAbsences.length > 0 
                                        ? listeAbsences.map(absence => (
                                            <tr key={absence.eleve.id}>
                                                <td>{absence.eleve.numero_incorporation}</td>
                                                <td>{`${absence.eleve.nom} ${absence.eleve.prenom}`}</td>
                                                <td>
                                                    <ul className="matieres-tags">
                                                        {absence.details && absence.details.map((d, i) => (
                                                            <li key={i}>
                                                                <strong>{d.type_examen}</strong> : {d.nom_matiere}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </td>
                                                <td>{absence.motif || <span className="text-muted">Aucun</span>}</td>
                                                <td className="actions-cell">
                                                    <button 
                                                        className="btn btn-danger btn-sm" 
                                                        onClick={() => handleDeleteFromList(absence.eleve.id)}
                                                    >
                                                        <FaTrash />
                                                    </button>
                                                </td>
                                            </tr>
                                        )) : (
                                            <tr><td colSpan="5" className="text-center">Aucune absence pour cette promotion.</td></tr>
                                        )
                                    }
                                </tbody>
                                </table>
                            )}
                        </div>
                        
                    </div>
                </div>
            )}
        </div>
    );
};

export default GestionAbsences;
