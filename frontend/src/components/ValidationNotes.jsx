import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { FiCheckCircle, FiXCircle, FiRefreshCw, FiEdit2, FiSave, FiX, FiSearch } from 'react-icons/fi';
import './DashboardRedesign.css';

const ONGLETS = [
    { id: 'toutes',   label: 'Toutes' },
    { id: 'directe',  label: 'Saisie directe' },
    { id: 'anonyme',  label: 'Saisie anonyme' },
    { id: 'liaison',  label: 'Liaisons' }
];

// Normalise pour une recherche insensible à la casse et aux accents
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const ValidationNotes = ({ isAdmin }) => {
    const [saisies, setSaisies] = useState([]);
    const [selection, setSelection] = useState(new Set());
    const [afficherToutes, setAfficherToutes] = useState(isAdmin);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resultat, setResultat] = useState(null);

    // ── Onglets + recherche (une recherche par onglet) ──
    const [onglet, setOnglet] = useState('toutes');
    const [recherches, setRecherches] = useState({ toutes: '', directe: '', anonyme: '', liaison: '' });

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

    // Compteurs par onglet
    const compteurs = useMemo(() => ({
        toutes:  saisies.length,
        directe: saisies.filter(s => s.source === 'directe').length,
        anonyme: saisies.filter(s => s.source === 'anonyme').length,
        liaison: saisies.filter(s => s.source === 'liaison').length
    }), [saisies]);

    // Liste filtrée : onglet + recherche
    const saisiesAffichees = useMemo(() => {
        const terme = norm(recherches[onglet]).trim();
        return saisies
            .filter(s => onglet === 'toutes' || s.source === onglet)
            .filter(s => {
                if (!terme) return true;
                const texte = norm([
                    s.eleve_nom, s.eleve_prenom, s.numero_incorporation,
                    s.code_anonyme, s.nom_matiere, s.type_examen,
                    s.saisi_par_nom, s.escadron, s.peloton, s.note, s.motif_absence
                ].join(' '));
                return terme.split(/\s+/).every(mot => texte.includes(mot));
            });
    }, [saisies, onglet, recherches]);

    const changerOnglet = (id) => {
        setOnglet(id);
        setSelection(new Set());   // évite de valider des lignes non visibles
        setEditionId(null);
    };

    const setRecherche = (valeur) => setRecherches(prev => ({ ...prev, [onglet]: valeur }));

    const toggleSelection = (id) => {
        setSelection(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toutSelectionne = saisiesAffichees.length > 0 && saisiesAffichees.every(s => selection.has(s.id));

    const toggleTout = () =>
        setSelection(prev => {
            const next = new Set(prev);
            if (toutSelectionne) saisiesAffichees.forEach(s => next.delete(s.id));
            else saisiesAffichees.forEach(s => next.add(s.id));
            return next;
        });

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

    // Colonnes visibles selon l'onglet
    const showType  = onglet === 'toutes';
    const showCode  = onglet !== 'directe';
    const showNote  = onglet !== 'liaison';
    const nbColonnes = 1 + (showType ? 1 : 0) + (showCode ? 1 : 0) + 1 + 1 + 1 + (showNote ? 1 : 0) + 1 + 1 + 1;

    const placeholderRecherche = {
        toutes:  "Rechercher (élève, N°, code, matière, opérateur...)",
        directe: "Rechercher un élève, N° d'incorporation, matière...",
        anonyme: "Rechercher un code anonyme, matière, opérateur...",
        liaison: "Rechercher un code, un élève, N° d'incorporation..."
    }[onglet];

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
                {/* ── Onglets ── */}
                <div style={{ display: 'flex', gap: '6px', borderBottom: '2px solid #e2e8f0', marginBottom: '14px', flexWrap: 'wrap' }}>
                    {ONGLETS.map(o => {
                        const actif = onglet === o.id;
                        return (
                            <button
                                key={o.id}
                                type="button"
                                onClick={() => changerOnglet(o.id)}
                                style={{
                                    padding: '10px 16px',
                                    border: 'none',
                                    background: 'transparent',
                                    cursor: 'pointer',
                                    fontWeight: actif ? 700 : 500,
                                    color: actif ? '#2c5282' : '#4a5568',
                                    borderBottom: actif ? '3px solid #2c5282' : '3px solid transparent',
                                    marginBottom: '-2px'
                                }}
                            >
                                {o.label}
                                <span style={{
                                    marginLeft: '8px',
                                    padding: '1px 8px',
                                    borderRadius: '10px',
                                    fontSize: '0.75rem',
                                    background: actif ? '#2c5282' : '#e2e8f0',
                                    color: actif ? '#fff' : '#4a5568'
                                }}>{compteurs[o.id]}</span>
                            </button>
                        );
                    })}
                </div>

                {/* ── Recherche (propre à chaque onglet) ── */}
                <div style={{ position: 'relative', marginBottom: '12px', maxWidth: '480px' }}>
                    <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }} />
                    <input
                        type="text"
                        value={recherches[onglet]}
                        onChange={e => setRecherche(e.target.value)}
                        placeholder={placeholderRecherche}
                        style={{ width: '100%', padding: '9px 32px 9px 32px', border: '1px solid #cbd5e0', borderRadius: '8px', boxSizing: 'border-box' }}
                    />
                    {recherches[onglet] && (
                        <button type="button" onClick={() => setRecherche('')} title="Effacer"
                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#718096' }}>
                            <FiX />
                        </button>
                    )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input type="checkbox"
                               checked={toutSelectionne}
                               onChange={toggleTout} />
                        Tout sélectionner ({saisiesAffichees.length})
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
                                    <th></th>
                                    {showType && <th>Type</th>}
                                    {showCode && <th>Code anonyme</th>}
                                    <th>Élève</th>
                                    <th>Matière</th>
                                    <th>Examen</th>
                                    {showNote && <th>Note</th>}
                                    <th>Saisi par</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {saisiesAffichees.map(s => {
                                    const enEdition = editionId === s.id;
                                    return (
                                        <tr key={s.id}>
                                            <td><input type="checkbox" checked={selection.has(s.id)}
                                                       onChange={() => toggleSelection(s.id)} /></td>
                                            {showType && (
                                                <td>{s.source === 'anonyme' ? 'Anonyme' : s.source === 'liaison' ? 'Liaison' : 'Directe'}</td>
                                            )}
                                            {showCode && (
                                                <td>{s.code_anonyme
                                                    ? <strong style={{ fontFamily: 'monospace' }}>{s.code_anonyme}</strong>
                                                    : <span style={{ color: '#999' }}>—</span>}</td>
                                            )}
                                            <td>{nomEleve(s)}</td>
                                            <td>{s.nom_matiere}</td>
                                            <td>{s.type_examen}</td>
                                            {showNote && (
                                                <td>
                                                    {s.source === 'liaison' ? (
                                                        <em>Liaison code → élève</em>
                                                    ) : enEdition ? (
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
                                            )}
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
                                                        {s.source !== 'liaison' && (
                                                            <button className="btn-icon" title="Modifier" onClick={() => ouvrirEdition(s)}><FiEdit2 /></button>
                                                        )}
                                                        <button className="btn-icon delete" title="Rejeter"
                                                                onClick={() => handleRejeter(s.id)}><FiXCircle /></button>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {saisiesAffichees.length === 0 && (
                                    <tr><td colSpan={nbColonnes} style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                                        {recherches[onglet].trim()
                                            ? 'Aucun résultat pour cette recherche.'
                                            : 'Aucune saisie en attente dans cet onglet.'}
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
