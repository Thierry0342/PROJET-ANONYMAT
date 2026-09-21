import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { FiCheckCircle, FiXCircle, FiRefreshCw, FiEdit2, FiSave, FiX } from 'react-icons/fi';
import './DashboardRedesign.css';

const ValidationNotes = ({ isAdmin }) => {
    const [saisies, setSaisies] = useState([]);
    const [selection, setSelection] = useState(new Set());
    const [afficherToutes, setAfficherToutes] = useState(isAdmin);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resultat, setResultat] = useState(null);

    // ── Édition en ligne ──
    const [editionId, setEditionId] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editAbsence, setEditAbsence] = useState(false);
    const [editMotif, setEditMotif] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    const headers = { Authorization: `Bearer ${localStorage.getItem('token')}` };

    const fetchSaisies = useCallback(async () => {
        setLoading(true);
        try {
            const mine = isAdmin && afficherToutes ? '' : '1';
            const res = await axios.get(`/api/copies-temporaires${mine ? `?mine=${mine}` : ''}`, { headers });
            setSaisies(res.data);
            setSelection(new Set());
            setEditionId(null);
        } catch (e) { }
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [afficherToutes]);

    useEffect(() => { fetchSaisies(); }, [fetchSaisies]);

    const toggleSelection = (id) => {
        setSelection(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleTout = () =>
        setSelection(prev => prev.size === saisies.length ? new Set() : new Set(saisies.map(s => s.id)));

    const handleValider = async () => {
        if (selection.size === 0) return;
        setSaving(true); setResultat(null);
        try {
            const res = await axios.post('/api/copies-temporaires/valider', { ids: [...selection] }, { headers });
            setResultat(res.data);
            fetchSaisies();
        } catch (e) {
            alert(e.response?.data?.message || "Erreur lors de la validation.");
        } finally { setSaving(false); }
    };

    const handleRejeter = async (id) => {
        if (!window.confirm("Rejeter (supprimer) cette saisie en attente ?")) return;
        try {
            await axios.delete(`/api/copies-temporaires/${id}`, { headers });
            fetchSaisies();
        } catch (e) { alert(e.response?.data?.message || "Erreur lors du rejet."); }
    };

    const ouvrirEdition = (s) => {
        setEditionId(s.id);
        setEditNote(s.note != null ? String(s.note) : '');
        setEditAbsence(!!s.est_absence);
        setEditMotif(s.motif_absence || '');
    };

    const enregistrerEdition = async (id) => {
        setSavingEdit(true);
        try {
            await axios.put(`/api/copies-temporaires/${id}`, {
                note: editNote,
                est_absence: editAbsence,
                motif_absence: editMotif
            }, { headers });
            setEditionId(null);
            fetchSaisies();
        } catch (e) {
            alert(e.response?.data?.message || "Erreur lors de la modification.");
        } finally { setSavingEdit(false); }
    };

    const nomEleve = (s) => {
        if (!s.eleve_nom) return <span style={{ color: '#999' }}>— non identifié —</span>;
        return (
            <>
                {(s.eleve_nom || '').toUpperCase()} {s.eleve_prenom || ''}
                <small style={{ color: '#666', display: 'block' }}>
                    N° {s.numero_incorporation || '-'}
                    {s.identifie_par_code ? ' (via code)' : ''}
                </small>
            </>
        );
    };

    return (
        <div className="dashboard-redesign-container">
            <div className="top-nav-bar">
                <h1>Validation des Notes</h1>
                {isAdmin && (
                    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600 }}>
                        <input type="checkbox" checked={afficherToutes}
                               onChange={e => setAfficherToutes(e.target.checked)} />
                        Voir les saisies de tout le monde
                    </label>
                )}
                <button className="btn-export pdf-btn" onClick={fetchSaisies}><FiRefreshCw /> Actualiser</button>
            </div>

            {resultat && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <p style={{ color: '#15803d', fontWeight: 700 }}>{resultat.valides.length} saisie(s) validée(s).</p>
                    {resultat.echecs.length > 0 && (
                        <ul style={{ color: '#dc3545' }}>
                            {resultat.echecs.map(e => <li key={e.id}>ID {e.id} : {e.message}</li>)}
                        </ul>
                    )}
                </div>
            )}

            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="checkbox"
                               checked={selection.size > 0 && selection.size === saisies.length}
                               onChange={toggleTout} />
                        Tout sélectionner ({saisies.length})
                    </label>
                    <button className="btn-export excel-btn" onClick={handleValider}
                            disabled={selection.size === 0 || saving}>
                        <FiCheckCircle /> {saving ? 'Validation...' : `Valider la sélection (${selection.size})`}
                    </button>
                </div>

                {loading ? <p>Chargement...</p> : (
                    <div className="table-responsive-dashboard">
                        <table>
                            <thead>
                                <tr>
                                    <th></th><th>Type</th><th>Code anonyme</th><th>Élève</th>
                                    <th>Matière</th><th>Examen</th><th>Note</th>
                                    <th>Saisi par</th><th>Date</th><th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {saisies.map(s => {
                                    const enEdition = editionId === s.id;
                                    return (
                                        <tr key={s.id}>
                                            <td><input type="checkbox" checked={selection.has(s.id)}
                                                       onChange={() => toggleSelection(s.id)} /></td>
                                            <td>{s.source === 'anonyme' ? 'Anonyme' : 'Directe'}</td>
                                            <td>{s.code_anonyme
                                                ? <strong style={{ fontFamily: 'monospace' }}>{s.code_anonyme}</strong>
                                                : <span style={{ color: '#999' }}>—</span>}</td>
                                            <td>{nomEleve(s)}</td>
                                            <td>{s.nom_matiere}</td>
                                            <td>{s.type_examen}</td>
                                            <td>
                                                {enEdition ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        <label style={{ fontSize: '0.8rem' }}>
                                                            <input type="checkbox" checked={editAbsence}
                                                                   onChange={e => setEditAbsence(e.target.checked)} /> Absent
                                                        </label>
                                                        {editAbsence ? (
                                                            <input type="text" value={editMotif} placeholder="Motif"
                                                                   onChange={e => setEditMotif(e.target.value)}
                                                                   style={{ width: '110px' }} />
                                                        ) : (
                                                            <input type="number" step="0.25" min="0" max="20"
                                                                   value={editNote}
                                                                   onChange={e => setEditNote(e.target.value)}
                                                                   style={{ width: '80px' }} autoFocus />
                                                        )}
                                                    </div>
                                                ) : (
                                                    s.est_absence
                                                        ? <em>Absent{s.motif_absence ? ` (${s.motif_absence})` : ''}</em>
                                                        : `${s.note} / 20`
                                                )}
                                            </td>
                                            <td>{s.saisi_par_nom}</td>
                                            <td>{new Date(s.date_saisie).toLocaleString('fr-FR')}</td>
                                            <td style={{ display: 'flex', gap: '6px' }}>
                                                {enEdition ? (
                                                    <>
                                                        <button className="btn-icon" title="Enregistrer"
                                                                disabled={savingEdit}
                                                                onClick={() => enregistrerEdition(s.id)}><FiSave /></button>
                                                        <button className="btn-icon" title="Annuler"
                                                                onClick={() => setEditionId(null)}><FiX /></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button className="btn-icon" title="Modifier"
                                                                onClick={() => ouvrirEdition(s)}><FiEdit2 /></button>
                                                        <button className="btn-icon delete" title="Rejeter"
                                                                onClick={() => handleRejeter(s.id)}><FiXCircle /></button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {saisies.length === 0 && (
                                    <tr><td colSpan="10" style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                                        Aucune saisie en attente.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ValidationNotes;