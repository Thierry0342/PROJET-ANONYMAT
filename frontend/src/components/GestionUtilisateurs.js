import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
    FaUsers, FaUserClock, FaUserTag, FaTrashAlt, 
    FaUserEdit, FaCheck, FaTimes, FaSave, FaUserPlus, FaShieldAlt 
} from 'react-icons/fa';
import './GestionUtilisateurs.css';

const GestionUtilisateurs = () => {
    const [users, setUsers] = useState([]);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [roleSelections, setRoleSelections] = useState({});
    const [editingUserId, setEditingUserId] = useState(null);
    const [newRole, setNewRole] = useState('');

    const pendingUsers = users.filter(user => user.statut === 'en_attente');
    const activeUsers = users.filter(user => user.statut !== 'en_attente');
    const ROLES = ['admin', 'operateur_code', 'operateur_note'];

    const getAuthHeaders = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    const fetchUsers = async () => {
        try {
            const response = await axios.get('/api/utilisateurs', getAuthHeaders());
            setUsers(response.data);
        } catch (err) {
            setError('Erreur de chargement des données.');
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const handleDelete = async (userId) => {
        if (window.confirm('Supprimer cet utilisateur ?')) {
            try {
                await axios.delete(`/api/utilisateurs/${userId}`, getAuthHeaders());
                setSuccess('Utilisateur supprimé.');
                fetchUsers();
            } catch (err) { setError('Erreur de suppression.'); }
            setTimeout(() => setSuccess(''), 3000);
        }
    };

    const handleApprove = async (user) => {
        const role = roleSelections[user.id];
        if (!role) return alert('Attribuez un rôle d\'abord.');
        try {
            await axios.put(`/api/utilisateurs/${user.id}/approuver`, { role }, getAuthHeaders());
            setSuccess('Utilisateur approuvé !');
            fetchUsers();
            if (pendingUsers.length === 1) setIsModalOpen(false);
        } catch (err) { setError('Erreur approbation.'); }
        setTimeout(() => setSuccess(''), 3000);
    };

    const handleSaveRole = async (userToUpdate) => {
        try {
            await axios.put(`/api/utilisateurs/${userToUpdate.id}`, {
                role: newRole,
                nom_utilisateur: userToUpdate.nom_utilisateur,
                assigned_matiere_id: userToUpdate.assigned_matiere_id,
                assigned_type_examen: userToUpdate.assigned_type_examen,
                assigned_promotion: userToUpdate.assigned_promotion
            }, getAuthHeaders());
            setSuccess('Rôle mis à jour.');
            setEditingUserId(null);
            fetchUsers();
        } catch (err) { setError('Erreur mise à jour.'); }
        setTimeout(() => setSuccess(''), 3000);
    };

    const getInitials = (nom, prenom) => {
        return `${nom ? nom[0] : ''}${prenom ? prenom[0] : ''}`.toUpperCase();
    };

    return (
        <div className="gu-main-wrapper">
            <div className="gu-dashboard-header">
                <div className="gu-header-info">
                    <div className="gu-icon-box">
                        <FaShieldAlt />
                    </div>
                    <div>
                        <h1 className="gu-title">Gestion des Utilisateurs</h1>
                        <p className="gu-subtitle">Contrôle des accès et habilitations du personnel</p>
                    </div>
                </div>
                
                <button 
                    className={`gu-pending-trigger ${pendingUsers.length > 0 ? 'gu-pulse' : ''}`} 
                    onClick={() => setIsModalOpen(true)}
                >
                    <FaUserPlus />
                    <span>Demandes en attente</span>
                    {pendingUsers.length > 0 && <span className="gu-notif-badge">{pendingUsers.length}</span>}
                </button>
            </div>

            {error && <div className="gu-alert gu-alert-error"><FaTimes /> {error}</div>}
            {success && <div className="gu-alert gu-alert-success"><FaCheck /> {success}</div>}

            <div className="gu-content-card">
                <div className="gu-card-header">
                    <FaUsers /> <span>Personnel Actif ({activeUsers.length})</span>
                </div>
                <div className="gu-table-container">
                    <table className="gu-table">
                        <thead>
                            <tr>
                                <th>Utilisateur</th>
                                <th>Identifiant</th>
                                <th>Rôle & Privilèges</th>
                                <th>Statut</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activeUsers.map((user) => (
                                <tr key={user.id} className={editingUserId === user.id ? 'gu-row-editing' : ''}>
                                    <td className="gu-td-user">
                                        <div className="gu-avatar">{getInitials(user.nom, user.prenom)}</div>
                                        <div className="gu-name-stack">
                                            <span className="gu-full-name">{user.nom} {user.prenom}</span>
                                        </div>
                                    </td>
                                    <td className="gu-username">@{user.nom_utilisateur}</td>
                                    <td>
                                        {editingUserId === user.id ? (
                                            <select className="gu-role-select" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                                                {ROLES.map(role => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
                                            </select>
                                        ) : (
                                            <span className={`gu-role-badge gu-role-${user.role}`}>
                                                <FaUserTag /> {user.role?.replace('_', ' ')}
                                            </span>
                                        )}
                                    </td>
                                    <td>
                                        <span className={`gu-status-pill gu-status-${user.statut}`}>
                                            {user.statut}
                                        </span>
                                    </td>
                                    <td className="gu-actions-cell">
                                        {editingUserId === user.id ? (
                                            <div className="gu-btn-group">
                                                <button className="gu-btn-circle gu-save" onClick={() => handleSaveRole(user)} title="Sauvegarder"><FaSave /></button>
                                                <button className="gu-btn-circle gu-cancel" onClick={() => setEditingUserId(null)} title="Annuler"><FaTimes /></button>
                                            </div>
                                        ) : (
                                            <div className="gu-btn-group">
                                                <button className="gu-btn-circle gu-edit" onClick={() => {setEditingUserId(user.id); setNewRole(user.role);}} title="Modifier"><FaUserEdit /></button>
                                                <button className="gu-btn-circle gu-delete" onClick={() => handleDelete(user.id)} title="Supprimer"><FaTrashAlt /></button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {isModalOpen && (
                <div className="gu-modal-overlay">
                    <div className="gu-modal-box">
                        <div className="gu-modal-header">
                            <h3><FaUserClock /> Inscriptions à valider</h3>
                            <button className="gu-close-btn" onClick={() => setIsModalOpen(false)}><FaTimes /></button>
                        </div>
                        <div className="gu-modal-body">
                            {pendingUsers.length === 0 ? (
                                <div className="gu-empty-state">Toutes les demandes ont été traitées.</div>
                            ) : (
                                <table className="gu-table gu-modal-table">
                                    <thead>
                                        <tr>
                                            <th>Utilisateur</th>
                                            <th>Rôle à définir</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingUsers.map((user) => (
                                            <tr key={user.id}>
                                                <td>
                                                    <div className="gu-full-name">{user.nom} {user.prenom}</div>
                                                    <small className="gu-username">@{user.nom_utilisateur}</small>
                                                </td>
                                                <td>
                                                    <select className="gu-role-select" value={roleSelections[user.id] || ''} onChange={(e) => setRoleSelections({...roleSelections, [user.id]: e.target.value})}>
                                                        <option value="">Choisir un rôle...</option>
                                                        {ROLES.map(role => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
                                                    </select>
                                                </td>
                                                <td className="gu-actions-cell">
                                                    <button className="gu-action-btn gu-approve-btn" onClick={() => handleApprove(user)}><FaCheck /> Valider</button>
                                                    <button className="gu-action-btn gu-reject-btn" onClick={() => axios.put(`/api/utilisateurs/${user.id}/rejeter`, {}, getAuthHeaders()).then(fetchUsers)}><FaTimes /> Rejeter</button>
                                                </td>
                                            </tr>
                                        ))}
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

export default GestionUtilisateurs;
