import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FaUserCog, FaSave, FaEraser, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';
import './ConfigurationAssignation.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const GENERATED_PROMOTIONS = Array.from({ length: 81 }, (_, i) => `${i + 70}E`);

function ConfigurationAssignation() {
    const [users, setUsers] = useState([]);
    const [matieres, setMatieres] = useState([]);
    const [examTypes, setExamTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });

    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [resUsers, resMatieres, resExams] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/utilisateurs`, getAuthHeaders()),
                axios.get(`${API_BASE_URL}/api/matieres`, getAuthHeaders()),
                axios.get(`${API_BASE_URL}/api/examens`, getAuthHeaders())
            ]);
            setUsers(resUsers.data.filter(u => u.role !== 'admin'));
            setMatieres(resMatieres.data);
            setExamTypes(resExams.data);
        } catch (error) {
            console.error("Erreur de chargement", error);
        } finally {
            setLoading(false);
        }
    }, [getAuthHeaders]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

                <div className="table-responsive">
                    <table className="config-table">
                        <thead>
                            <tr>
                                <th>Utilisateur</th>
                                <th>Matière Assignée</th>
                                <th>Type d'Examen</th>
                                <th>Promotion</th>
                                <th>Population Cible</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(user => (
                                <UserRow
                                    key={user.id}
                                    user={user}
                                    matieres={matieres}
                                    examTypes={examTypes}
                                    onSave={handleUpdateAssignation}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function UserRow({ user, matieres, examTypes, onSave }) {
    const [matiereId, setMatiereId] = useState(user.assigned_matiere_id || '');
    const [typeExamen, setTypeExamen] = useState(user.assigned_type_examen || '');
    const [promotion, setPromotion] = useState(user.assigned_promotion || '');
    const [population, setPopulation] = useState(user.assigned_population || 'all');

    const isChanged =
        matiereId.toString() !== (user.assigned_matiere_id || '').toString() ||
        typeExamen !== (user.assigned_type_examen || '') ||
        promotion !== (user.assigned_promotion || '') ||
        population !== (user.assigned_population || 'all');

    return (
        <tr>
            <td>
                <strong>{user.prenom} {user.nom}</strong>
                <br /><small>@{user.nom_utilisateur}</small>
            </td>
            <td>
                <select value={matiereId} onChange={e => setMatiereId(e.target.value)}>
                    <option value="">-- Aucune --</option>
                    {matieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                </select>
            </td>
            <td>
                <select value={typeExamen} onChange={e => setTypeExamen(e.target.value)}>
                    <option value="">-- Aucun --</option>
                    {examTypes.map(et => <option key={et.id} value={et.nom_modele}>{et.nom_modele}</option>)}
                </select>
            </td>
            <td>
                <select value={promotion} onChange={e => setPromotion(e.target.value)}>
                    <option value="">-- Toutes --</option>
                    {GENERATED_PROMOTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </td>
            <td>
                <select 
                    value={population} 
                    onChange={e => setPopulation(e.target.value)}
                    style={{ 
                        backgroundColor: population !== 'all' ? '#eef2ff' : 'white',
                        fontWeight: population !== 'all' ? '600' : 'normal'
                    }}
                >
                    <option value="all">Tous les élèves</option>
                    <option value="actif">Liste Originale (Actifs)</option>
                    <option value="conseil">Liste Conseil (Ajournés/Red.)</option>
                </select>
            </td>
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
                    onClick={() => {
                        setMatiereId(''); setTypeExamen(''); setPromotion(''); setPopulation('all');
                        onSave(user.id, { matiereId: null, typeExamen: null, promotion: null, population: 'all' });
                    }}
                    title="Effacer l'assignation"
                >
                    <FaEraser />
                </button>
            </td>
        </tr>
    );
}

export default ConfigurationAssignation;
