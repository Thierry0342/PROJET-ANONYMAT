import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { FiCheckCircle, FiXCircle, FiRefreshCw, FiEdit2, FiSave, FiX, FiSearch, FiLink2, FiSend } from 'react-icons/fi';
import './DashboardRedesign.css';

const ONGLETS = [
    { id: 'toutes',   label: 'Toutes' },
    { id: 'directe',  label: 'Saisie directe' },
    { id: 'anonyme',  label: 'Saisie anonyme' },
    { id: 'liaison',  label: 'Liaisons' },
    { id: 'validees', label: 'Validées' }
];

// Opérateur : un seul onglet = les saisies renvoyées en vérification par le contrôleur
const ONGLETS_OPERATEUR = [
    { id: 'reverif', label: 'Revérification' }
];

const FILTRES_VIDES = { examen: '', matiere: '', escadron: '' };
const TOUS_FILTRES_VIDES = {
    toutes: FILTRES_VIDES, directe: FILTRES_VIDES, anonyme: FILTRES_VIDES,
    liaison: FILTRES_VIDES, validees: FILTRES_VIDES, reverif: FILTRES_VIDES
};

const STATUTS = [
    { id: 'tous',       label: 'Tous les statuts' },
    { id: 'a_verifier', label: 'Chez l\'opérateur (renvoyées)' },
    { id: 'verifie',    label: 'À valider (contrôleur)' },
    { id: 'renvoye',    label: 'Renvoyées en vérification' }
];

// Normalise pour une recherche insensible à la casse et aux accents
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const selectStyle = { padding: '9px 10px', border: '1px solid #cbd5e0', borderRadius: '8px' };

// ═══════════════════ Onglet « Validées » ═══════════════════
const TYPES_VALIDEES = [
    { id: 'tous',          label: 'Toutes' },
    { id: 'anonyme',       label: 'Code + note (non liées)' },
    { id: 'lie',           label: 'Code + élève (liées)' },
    { id: 'lie_sans_note', label: 'Code + élève sans note' },
    { id: 'non_lie',       label: 'Élèves non liés à un code' },
    { id: 'directe',       label: 'Saisie directe' }
];

const typeDe = (r) => (r.non_lie_eleve
    ? 'non_lie'
    : (!r.code_anonyme ? 'directe' : r.eleve_id ? 'lie' : 'anonyme'));
const sansNote = (r) => r.note === null || r.note === undefined;

const ValideesPanel = ({ canModifier, canAgir, promotion, onChange }) => {
    const [rows, setRows] = useState([]);
    const [nonLies, setNonLies] = useState([]);
    const [matieres, setMatieres] = useState([]);
    const [examens, setExamens] = useState([]);
    const [matieresExamen, setMatieresExamen] = useState(null);
    const [loading, setLoading] = useState(false);
    const [erreur, setErreur] = useState(null);
    const [examen, setExamen] = useState('');
    const [matiereId, setMatiereId] = useState('');
    const [typeFiltre, setTypeFiltre] = useState('tous');
    const [q, setQ] = useState('');
    const [qEnvoye, setQEnvoye] = useState('');
    const [editId, setEditId] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editMotif, setEditMotif] = useState('');
    const [busy, setBusy] = useState(false);
    const [renvoi, setRenvoi] = useState(null); // { r, cible, motif }
    const [page, setPage] = useState(1);
    const [taillePage, setTaillePage] = useState(50);

    const cfg = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

    useEffect(() => {
        axios.get('/api/matieres', cfg()).then(r => setMatieres(r.data)).catch(() => {});
    }, []);

    useEffect(() => {
        axios.get('/api/examens', { ...cfg(), params: { promotion: promotion || undefined } })
            .then(r => {
                const noms = [...new Set((r.data || []).map(e => e.nom_modele))]
                    .sort((a, b) => String(a).localeCompare(String(b), 'fr'));
                setExamens(noms);
                setExamen(prev => (prev && !noms.includes(prev) ? '' : prev));
            })
            .catch(() => {});
    }, [promotion]);

    useEffect(() => {
        if (!examen) { setMatieresExamen(null); return; }
        axios.get('/api/matieres-par-examen', { ...cfg(), params: { typeExamen: examen, promotion: promotion || undefined } })
            .then(r => {
                const uniques = [...new Map((r.data || []).map(m => [m.id, m])).values()];
                setMatieresExamen(uniques);
                setMatiereId(prev => (prev && !uniques.some(m => String(m.id) === String(prev)) ? '' : prev));
            })
            .catch(() => setMatieresExamen([]));
    }, [examen, promotion]);

    useEffect(() => {
        const t = setTimeout(() => setQEnvoye(q), 350);
        return () => clearTimeout(t);
    }, [q]);

    const charger = useCallback(async () => {
        setLoading(true); setErreur(null);
        try {
            const res = await axios.get('/api/copies/validees', {
                ...cfg(),
                params: {
                    matiereId: matiereId || undefined,
                    typeExamen: examen || undefined,
                    promotion: promotion || undefined,
                    q: qEnvoye || undefined,
                    type: typeFiltre === 'lie_sans_note' ? 'lie_sans_note' : undefined
                }
            });
            setRows(res.data);

            // Élèves non liés à un code : uniquement si un examen ET une matière sont choisis
            if (examen && matiereId) {
                const r2 = await axios.get('/api/copies/eleves-non-lies', {
                    ...cfg(),
                    params: {
                        matiereId,
                        typeExamen: examen,
                        promotion: promotion || undefined,
                        q: qEnvoye || undefined
                    }
                });
                const nomMatiere = (matieresExamen ?? matieres)
                    .find(m => String(m.id) === String(matiereId))?.nom_matiere || '';
                setNonLies((r2.data || []).map(e => ({
                    ...e,
                    copie_id: `nl-${e.eleve_id}`,
                    non_lie_eleve: true,
                    code_anonyme: null,
                    note: null,
                    type_examen: examen,
                    nom_matiere: nomMatiere,
                    saisi_par: null,
                    note_saisie_a: null
                })));
            } else {
                setNonLies([]);
            }

            setEditId(null);
        } catch (e) {
            setRows([]);
            setNonLies([]);
            setErreur(e.response?.data?.message || "Impossible de charger les saisies validées.");
        } finally { setLoading(false); }
    }, [matiereId, examen, qEnvoye, promotion, typeFiltre, matieresExamen, matieres]);

    useEffect(() => { charger(); }, [charger]);

    const affichees = useMemo(() => {
        const base = rows.filter(r => {
            if (typeFiltre === 'tous') return true;
            if (typeFiltre === 'non_lie') return false;
            if (typeFiltre === 'lie_sans_note') return typeDe(r) === 'lie' && sansNote(r);
            return typeDe(r) === typeFiltre;
        });
        const ajout = (typeFiltre === 'tous' || typeFiltre === 'non_lie') ? nonLies : [];
        return [...base, ...ajout];
    }, [rows, nonLies, typeFiltre]);

    // ── Pagination (côté client : toutes les lignes sont chargées) ──
    const totalPages = Math.max(1, Math.ceil(affichees.length / taillePage));
    const pageCourante = Math.min(page, totalPages);
    const debut = (pageCourante - 1) * taillePage;
    const lignesPage = useMemo(
        () => affichees.slice(debut, debut + taillePage),
        [affichees, debut, taillePage]
    );

    // Retour à la page 1 quand les données ou les filtres changent
    useEffect(() => { setPage(1); }, [rows, nonLies, typeFiltre, taillePage]);

    // Liste de pages à afficher : 1 … 4 5 [6] 7 8 … 20
    const pagesVisibles = useMemo(() => {
        const liste = [];
        for (let i = 1; i <= totalPages; i++) {
            if (i === 1 || i === totalPages || Math.abs(i - pageCourante) <= 2) liste.push(i);
            else if (liste[liste.length - 1] !== '…') liste.push('…');
        }
        return liste;
    }, [totalPages, pageCourante]);

    const ouvrirEdition = (r) => { setEditId(r.copie_id); setEditNote(String(r.note)); setEditMotif(''); };

    const enregistrer = async (r) => {
        const n = parseFloat(editNote);
        if (isNaN(n) || n < 0 || n > 20) { alert('La note doit être comprise entre 0 et 20.'); return; }
        if (!editMotif.trim()) { alert('Le motif de la modification est obligatoire.'); return; }
        setBusy(true);
        try {
            await axios.put(`/api/resultats/${r.copie_id}`, {
                nouvelle_note: n,
                motif: `Modification: ${r.note} -> ${n}. Raison: ${editMotif.trim()}`
            }, cfg());
            charger();
        } catch (e) { alert(e.response?.data?.message || 'Erreur lors de la modification.'); }
        finally { setBusy(false); }
    };

    const supprimer = async (r) => {
        const quoi = r.nom ? `${r.nom} ${r.prenom || ''}` : (r.code_anonyme || 'cette saisie');
        if (!window.confirm(`Supprimer la note de ${quoi} ? La liaison avec l'élève sera aussi retirée.`)) return;
        try {
            await axios.delete(`/api/resultats/${r.copie_id}`, cfg());
            charger();
        } catch (e) { alert(e.response?.data?.message || 'Erreur lors de la suppression.'); }
    };

    const delier = async (r) => {
        const msg = sansNote(r)
            ? `Retirer la liaison entre le code ${r.code_anonyme} et l'élève ?`
            : `Retirer seulement la liaison entre le code ${r.code_anonyme} et l'élève ? La note est conservée.`;
        if (!window.confirm(msg)) return;
        try {
            await axios.delete(`/api/copies/delier/${r.copie_id}`, cfg());
            charger();
        } catch (e) { alert(e.response?.data?.message || 'Erreur lors de la déliaison.'); }
    };

    const ouvrirRenvoi = (r) => setRenvoi({ r, cible: sansNote(r) ? 'liaison' : 'note', motif: '' });

    const confirmerRenvoi = async () => {
        if (!renvoi.motif.trim()) { alert('Le motif du renvoi est obligatoire.'); return; }
        setBusy(true);
        try {
            const res = await axios.post(`/api/copies/${renvoi.r.copie_id}/renvoyer-verification`,
                { cible: renvoi.cible, motif: renvoi.motif.trim() }, cfg());
            alert(res.data.message);
            setRenvoi(null);
            charger();
            if (onChange) onChange();   // rafraîchit la liste d'attente
        } catch (e) { alert(e.response?.data?.message || 'Erreur lors du renvoi.'); }
        finally { setBusy(false); }
    };

    const listeMatieres = matieresExamen ?? matieres;
    const nbColonnes = canAgir ? 8 : 7;

    return (
        <div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '480px' }}>
                    <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }} />
                    <input
                        type="text" value={q} onChange={e => setQ(e.target.value)}
                        placeholder="Rechercher un nom, N° d'incorporation ou code..."
                        style={{ width: '100%', padding: '9px 32px', border: '1px solid #cbd5e0', borderRadius: '8px', boxSizing: 'border-box' }}
                    />
                    {q && (
                        <button type="button" onClick={() => setQ('')} title="Effacer"
                                style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: '#718096' }}>
                            <FiX />
                        </button>
                    )}
                </div>

                <select value={examen} onChange={e => { setExamen(e.target.value); setMatiereId(''); }}
                        style={{ ...selectStyle, minWidth: '170px' }}>
                    <option value="">Tous les examens</option>
                    {examens.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                </select>

                <select value={matiereId} onChange={e => setMatiereId(e.target.value)}
                        style={{ ...selectStyle, minWidth: '180px' }}>
                    <option value="">{examen ? `Matières de ${examen}` : 'Toutes les matières'}</option>
                    {listeMatieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                </select>

                <select value={typeFiltre} onChange={e => setTypeFiltre(e.target.value)}
                        style={{ ...selectStyle, minWidth: '200px' }}>
                    {TYPES_VALIDEES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>

                <span style={{ fontSize: '0.85rem', color: '#4a5568' }}>
                    {affichees.length} résultat(s)
                </span>
            </div>

            {(typeFiltre === 'non_lie' && !(examen && matiereId)) && (
                <div style={{ color: '#d69e2e', fontWeight: 600, marginBottom: '10px', fontSize: '0.9rem' }}>
                    Sélectionnez un examen et une matière pour afficher les élèves non liés à un code.
                </div>
            )}

            {erreur && <div style={{ color: '#dc3545', fontWeight: 600, marginBottom: '10px' }}>{erreur}</div>}

            {loading ? <p>Chargement...</p> : (
                <div className="table-responsive-dashboard">
                    <table>
                        <thead>
                            <tr>
                                <th>Code anonyme</th>
                                <th>Élève</th>
                                <th>Matière</th>
                                <th>Examen</th>
                                <th>Note</th>
                                <th>Saisi par</th>
                                <th>Date</th>
                                {canAgir && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {lignesPage.map(r => {
                                const enEdition = editId === r.copie_id;
                                return (
                                    <tr key={r.copie_id}>
                                        <td>{r.code_anonyme
                                            ? <strong style={{ fontFamily: 'monospace' }}>{r.code_anonyme}</strong>
                                            : <span style={{ color: '#999' }}>—</span>}</td>
                                        <td>
                                            {r.nom ? (
                                                <>
                                                    {r.nom.toUpperCase()} {r.prenom || ''}
                                                    <small style={{ color: '#666', display: 'block' }}>N° {r.numero_incorporation || '-'}</small>
                                                </>
                                            ) : <span style={{ color: '#999' }}>— non lié —</span>}
                                        </td>
                                        <td>{r.nom_matiere}</td>
                                        <td>{r.type_examen}</td>
                                        <td>
                                            {enEdition ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <input type="number" step="0.25" min="0" max="20" value={editNote}
                                                           onChange={e => setEditNote(e.target.value)}
                                                           style={{ width: '80px' }} autoFocus />
                                                    <input type="text" placeholder="Motif (obligatoire)" value={editMotif}
                                                           onChange={e => setEditMotif(e.target.value)}
                                                           style={{ width: '150px' }} />
                                                </div>
                                            ) : r.non_lie_eleve
                                                ? <em style={{ color: '#d69e2e' }}>— non lié à un code —</em>
                                            : sansNote(r)
                                                ? <em style={{ color: '#718096' }}>— pas de note —</em>
                                                : `${parseFloat(r.note).toFixed(2)} / 20`}
                                        </td>
                                        <td>{r.saisi_par || '—'}</td>
                                        <td>{r.note_saisie_a ? new Date(r.note_saisie_a).toLocaleString('fr-FR') : '—'}</td>
                                        {canAgir && r.non_lie_eleve && <td></td>}
                                        {canAgir && !r.non_lie_eleve && (
                                            <td style={{ display: 'flex', gap: '6px' }}>
                                                {enEdition ? (
                                                    <>
                                                        <button className="btn-icon" title="Enregistrer" disabled={busy}
                                                                onClick={() => enregistrer(r)}><FiSave /></button>
                                                        <button className="btn-icon" title="Annuler"
                                                                onClick={() => setEditId(null)}><FiX /></button>
                                                    </>
                                                ) : (
                                                    <>
                                                        {canModifier && !sansNote(r) && (
                                                            <button className="btn-icon" title="Modifier la note"
                                                                    onClick={() => ouvrirEdition(r)}><FiEdit2 /></button>
                                                        )}
                                                        <button className="btn-icon" title="Renvoyer à l'opérateur pour vérification"
                                                                onClick={() => ouvrirRenvoi(r)}><FiSend /></button>
                                                        {typeDe(r) === 'lie' && (
                                                            <button className="btn-icon"
                                                                    title={sansNote(r) ? 'Retirer la liaison' : 'Retirer la liaison (garde la note)'}
                                                                    onClick={() => delier(r)}><FiLink2 /></button>
                                                        )}
                                                        {!sansNote(r) && (
                                                            <button className="btn-icon delete" title="Supprimer la note"
                                                                    onClick={() => supprimer(r)}><FiXCircle /></button>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        )}
                                    </tr>
                                );
                            })}
                            {affichees.length === 0 && (
                                <tr><td colSpan={nbColonnes} style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                                    Aucune saisie validée pour cette recherche.
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Pagination ── */}
            {!loading && affichees.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '12px' }}>
                    <span style={{ fontSize: '0.85rem', color: '#4a5568' }}>
                        {debut + 1}–{Math.min(debut + taillePage, affichees.length)} sur {affichees.length}
                    </span>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button type="button" disabled={pageCourante === 1} onClick={() => setPage(pageCourante - 1)}
                                style={{ padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '6px', background: '#fff', cursor: pageCourante === 1 ? 'not-allowed' : 'pointer', opacity: pageCourante === 1 ? 0.5 : 1 }}>
                            ‹ Précédent
                        </button>
                        {pagesVisibles.map((p, i) => p === '…' ? (
                            <span key={`e${i}`} style={{ padding: '0 4px', color: '#718096' }}>…</span>
                        ) : (
                            <button key={p} type="button" onClick={() => setPage(p)}
                                    style={{
                                        minWidth: '34px', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                                        border: '1px solid ' + (p === pageCourante ? '#2c5282' : '#cbd5e0'),
                                        background: p === pageCourante ? '#2c5282' : '#fff',
                                        color: p === pageCourante ? '#fff' : '#4a5568',
                                        fontWeight: p === pageCourante ? 700 : 500
                                    }}>
                                {p}
                            </button>
                        ))}
                        <button type="button" disabled={pageCourante === totalPages} onClick={() => setPage(pageCourante + 1)}
                                style={{ padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: '6px', background: '#fff', cursor: pageCourante === totalPages ? 'not-allowed' : 'pointer', opacity: pageCourante === totalPages ? 0.5 : 1 }}>
                            Suivant ›
                        </button>
                    </div>

                    <label style={{ fontSize: '0.85rem', color: '#4a5568', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Lignes par page
                        <select value={taillePage} onChange={e => setTaillePage(Number(e.target.value))}
                                style={{ ...selectStyle, padding: '5px 8px' }}>
                            {[25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </label>
                </div>
            )}

            {/* ── Fenêtre de renvoi en vérification ── */}
            {renvoi && (
                <div onClick={() => setRenvoi(null)}
                     style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div onClick={e => e.stopPropagation()}
                         style={{ background: '#fff', borderRadius: '10px', padding: '20px', width: '420px', maxWidth: '92vw' }}>
                        <h3 style={{ marginTop: 0 }}>Renvoyer pour vérification</h3>
                        <p style={{ fontSize: '0.9rem', color: '#4a5568' }}>
                            {renvoi.r.code_anonyme ? <>Code <strong>{renvoi.r.code_anonyme}</strong></> : 'Saisie directe'}
                            {renvoi.r.nom ? <> — {renvoi.r.nom.toUpperCase()} {renvoi.r.prenom || ''}</> : null}
                            {' '}· {renvoi.r.nom_matiere}
                            {!sansNote(renvoi.r) && <> · note {parseFloat(renvoi.r.note).toFixed(2)}</>}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                            {!sansNote(renvoi.r) && (
                                <label>
                                    <input type="radio" checked={renvoi.cible === 'note'}
                                           onChange={() => setRenvoi({ ...renvoi, cible: 'note' })} />
                                    {' '}{renvoi.r.code_anonyme ? 'Code + note' : 'La note'}
                                </label>
                            )}
                            {typeDe(renvoi.r) === 'lie' && (
                                <>
                                    <label>
                                        <input type="radio" checked={renvoi.cible === 'liaison'}
                                               onChange={() => setRenvoi({ ...renvoi, cible: 'liaison' })} />
                                        {' '}Code + nom (liaison)
                                    </label>
                                    {!sansNote(renvoi.r) && (
                                        <label>
                                            <input type="radio" checked={renvoi.cible === 'les_deux'}
                                                   onChange={() => setRenvoi({ ...renvoi, cible: 'les_deux' })} />
                                            {' '}Les deux
                                        </label>
                                    )}
                                </>
                            )}
                        </div>

                        <input type="text" placeholder="Motif du renvoi (obligatoire)" value={renvoi.motif}
                               onChange={e => setRenvoi({ ...renvoi, motif: e.target.value })}
                               style={{ width: '100%', padding: '9px 10px', border: '1px solid #cbd5e0', borderRadius: '8px', boxSizing: 'border-box', marginBottom: '14px' }}
                               autoFocus />

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button type="button" onClick={() => setRenvoi(null)}
                                    style={{ padding: '8px 14px', border: '1px solid #cbd5e0', borderRadius: '8px', background: '#fff', cursor: 'pointer' }}>
                                Annuler
                            </button>
                            <button type="button" className="btn-export excel-btn" onClick={confirmerRenvoi} disabled={busy}>
                                <FiSend /> {busy ? 'Envoi...' : 'Renvoyer'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ═══════════════════ Page principale ═══════════════════
// Workflow :
//  - L'opérateur saisit (Noter / Lier / Saisie directe) puis envoie son paquet en validation :
//    les lignes arrivent DIRECTEMENT chez le contrôleur (statut « verifie »).
//  - Le contrôleur valide (écriture dans « copies ») ou RENVOIE en vérification avec un motif.
//  - Une saisie renvoyée revient chez l'opérateur : c'est la seule chose qu'il voit ici
//    (onglet « Revérification »). Il la corrige puis la retransmet au contrôleur.
const ValidationNotes = () => {
    // ── Rôle (lu en premier : sert à initialiser les états) ──
    const { role, userId } = (() => {
        try {
            const d = jwtDecode(localStorage.getItem('token'));
            return { role: d.role, userId: d.id };
        } catch { return { role: null, userId: null }; }
    })();
    const isOperateur = ['operateur_note', 'operateur_code'].includes(role);
    const canAgirValidees = ['admin', 'controleur'].includes(role);   // renvoyer / délier / supprimer
    const canModifierValidees = role === 'admin';                     // plus de modification pour le contrôleur

    const [saisies, setSaisies] = useState([]);
    const [selection, setSelection] = useState(new Set());
    const [soloMine, setSoloMine] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [resultat, setResultat] = useState(null);
    const [erreur, setErreur] = useState(null);
    const [diag, setDiag] = useState(null);

    const [promotions, setPromotions] = useState([]);
    const [promotion, setPromotion] = useState('');

    const [onglet, setOnglet] = useState(isOperateur ? 'reverif' : 'toutes');
    const [recherches, setRecherches] = useState({ toutes: '', directe: '', anonyme: '', liaison: '', validees: '', reverif: '' });
    const [filtres, setFiltres] = useState(TOUS_FILTRES_VIDES);

    const [editionId, setEditionId] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editAbsence, setEditAbsence] = useState(false);
    const [editMotif, setEditMotif] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    const getCfg = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });

    // Filtre statut : le contrôleur / admin voit d'abord ce qui l'attend (saisies vérifiées)
    const [statutFiltre, setStatutFiltre] = useState(isOperateur ? 'tous' : 'verifie');

    const fetchSaisies = useCallback(async () => {
        setLoading(true);
        setErreur(null);
        const cfg = getCfg();
        try {
            const res = await axios.get('/api/copies-temporaires', {
                ...cfg,
                params: soloMine ? { mine: 1 } : {}
            });
            if (!Array.isArray(res.data)) {
                throw new Error("Réponse inattendue du serveur (ce n'est pas une liste). Le backend est-il redémarré ?");
            }
            setSaisies(res.data);
            setSelection(new Set());
            setEditionId(null);
        } catch (e) {
            setSaisies([]);
            setErreur(
                (e.response ? `Erreur ${e.response.status} : ` : '') +
                (e.response?.data?.message || e.message || "Impossible de charger les saisies.")
            );
        }
        // Diagnostic : réservé au contrôleur / admin
        if (!isOperateur) {
            try {
                const d = await axios.get('/api/copies-temporaires/diagnostic', cfg);
                setDiag(d.data);
            } catch {
                setDiag(null);
            }
        }
        setLoading(false);
    }, [soloMine, isOperateur]);

    useEffect(() => { fetchSaisies(); }, [fetchSaisies]);

    useEffect(() => {
        axios.get('/api/promotions', getCfg())
            .then(res => {
                const liste = res.data || [];
                setPromotions(liste);
                if (liste.length > 0) setPromotion(liste[0]); // triée DESC → la plus récente
            })
            .catch(() => setPromotions([]));
    }, []);

    const changerPromotion = (valeur) => {
        setPromotion(valeur);
        setSelection(new Set());
        setEditionId(null);
        setFiltres(TOUS_FILTRES_VIDES);
    };

    const changerStatut = (valeur) => {
        setStatutFiltre(valeur);
        setSelection(new Set());
    };

    const estVerifie = (s) => s.statut_validation === 'verifie';

    // Promotion + statut
    const saisiesPromo = useMemo(
        () => saisies
            .filter(s => !promotion || s.promotion === promotion)
            .filter(s => {
                if (statutFiltre === 'tous') return true;
                if (statutFiltre === 'verifie') return estVerifie(s);
                if (statutFiltre === 'a_verifier') return !estVerifie(s);
                if (statutFiltre === 'renvoye') return !estVerifie(s) && !!s.renvoi_motif;
                return true;
            }),
        [saisies, promotion, statutFiltre]
    );

    // Une ligne est sélectionnable selon le rôle et son statut
    const selectionnable = useCallback((s) => (
        isOperateur
            ? !estVerifie(s)
            : (estVerifie(s) || s.saisi_par_utilisateur_id === userId)
    ), [isOperateur, userId]);

    const compteurs = useMemo(() => ({
        toutes:  saisiesPromo.length,
        directe: saisiesPromo.filter(s => s.source === 'directe').length,
        anonyme: saisiesPromo.filter(s => s.source === 'anonyme').length,
        liaison: saisiesPromo.filter(s => s.source === 'liaison').length,
        reverif: saisiesPromo.length
    }), [saisiesPromo]);

    const saisiesOnglet = useMemo(
        () => saisiesPromo.filter(s => onglet === 'toutes' || onglet === 'reverif' || s.source === onglet),
        [saisiesPromo, onglet]
    );

    const filtreCourant = filtres[onglet];

    const optionsExamens = useMemo(() => {
        const set = new Set();
        saisiesOnglet.forEach(s => { if (s.type_examen) set.add(s.type_examen); });
        return [...set].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
    }, [saisiesOnglet]);

    const optionsMatieres = useMemo(() => {
        const map = new Map();
        saisiesOnglet
            .filter(s => !filtreCourant.examen || s.type_examen === filtreCourant.examen)
            .forEach(s => { if (s.matiere_id != null) map.set(String(s.matiere_id), s.nom_matiere); });
        return [...map.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1]), 'fr'));
    }, [saisiesOnglet, filtreCourant.examen]);

    const { optionsEscadrons, aDesSansEscadron } = useMemo(() => {
        const set = new Set();
        let sans = false;
        saisiesOnglet.forEach(s => {
            if (s.escadron != null && s.escadron !== '') set.add(String(s.escadron));
            else sans = true;
        });
        const liste = [...set].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
        return { optionsEscadrons: liste, aDesSansEscadron: sans };
    }, [saisiesOnglet]);

    const setFiltre = (cle, valeur) =>
        setFiltres(prev => ({ ...prev, [onglet]: { ...prev[onglet], [cle]: valeur } }));

    const changerExamen = (valeur) =>
        setFiltres(prev => ({ ...prev, [onglet]: { ...prev[onglet], examen: valeur, matiere: '' } }));

    const filtresActifs = !!(filtreCourant.examen || filtreCourant.matiere || filtreCourant.escadron || recherches[onglet].trim());
    const reinitialiserFiltres = () => {
        setFiltres(prev => ({ ...prev, [onglet]: FILTRES_VIDES }));
        setRecherches(prev => ({ ...prev, [onglet]: '' }));
    };

    const saisiesAffichees = useMemo(() => {
        const terme = norm(recherches[onglet]).trim();
        const { examen, matiere, escadron } = filtres[onglet];
        return saisiesOnglet
            .filter(s => !examen || s.type_examen === examen)
            .filter(s => !matiere || String(s.matiere_id) === matiere)
            .filter(s => {
                if (!escadron) return true;
                if (escadron === '__aucun__') return s.escadron == null || s.escadron === '';
                return String(s.escadron) === escadron;
            })
            .filter(s => {
                if (!terme) return true;
                const texte = norm([
                    s.eleve_nom, s.eleve_prenom, s.numero_incorporation,
                    s.code_anonyme, s.nom_matiere, s.type_examen,
                    s.saisi_par_nom, s.escadron, s.peloton, s.note, s.motif_absence, s.renvoi_motif
                ].join(' '));
                return terme.split(/\s+/).every(mot => texte.includes(mot));
            });
    }, [saisiesOnglet, onglet, recherches, filtres]);

    const lignesSelectionnables = useMemo(
        () => saisiesAffichees.filter(selectionnable),
        [saisiesAffichees, selectionnable]
    );

    // Seules les lignes sélectionnées, visibles ET sélectionnables sont traitées
    const idsAValider = useMemo(
        () => lignesSelectionnables.filter(s => selection.has(s.id)).map(s => s.id),
        [lignesSelectionnables, selection]
    );

    const changerOnglet = (id) => {
        setOnglet(id);
        setSelection(new Set());
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

    const toutSelectionne = lignesSelectionnables.length > 0 && lignesSelectionnables.every(s => selection.has(s.id));

    const toggleTout = () =>
        setSelection(prev => {
            const next = new Set(prev);
            if (toutSelectionne) lignesSelectionnables.forEach(s => next.delete(s.id));
            else lignesSelectionnables.forEach(s => next.add(s.id));
            return next;
        });

    const handleValider = async () => {
        if (idsAValider.length === 0) return;
        setSaving(true); setResultat(null);
        try {
            const res = await axios.post('/api/copies-temporaires/valider', { ids: idsAValider }, getCfg());
            setResultat(res.data);
            fetchSaisies();
        } catch (e) {
            alert(e.response?.data?.message || "Erreur lors de la validation.");
        } finally { setSaving(false); }
    };

    const handleRejeter = async (id) => {
        if (!window.confirm("Rejeter (supprimer) cette saisie en attente ?")) return;
        try {
            await axios.delete(`/api/copies-temporaires/${id}`, getCfg());
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
            }, getCfg());
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

    const badgeStatut = (s) => {
        if (estVerifie(s)) {
            return (
                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', background: '#c6f6d5', color: '#276749', whiteSpace: 'nowrap' }}>
                    {isOperateur ? 'Transmise au contrôleur' : 'À valider'}
                </span>
            );
        }
        if (s.renvoi_motif) {
            return (
                <span title={s.renvoi_motif}
                      style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', background: '#fed7d7', color: '#9b2c2c', whiteSpace: 'nowrap' }}>
                    {isOperateur ? 'À revérifier' : 'Renvoyée à l\'opérateur'} : {s.renvoi_motif}
                </span>
            );
        }
        // Un opérateur ne voit jamais « En attente opérateur » : ce statut n'existe plus pour lui
        return (
            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.75rem', background: '#edf2f7', color: '#4a5568', whiteSpace: 'nowrap' }}>
                {isOperateur ? 'À vérifier' : 'Chez l\'opérateur'}
            </span>
        );
    };

    // Colonnes visibles selon l'onglet
    const showType  = onglet === 'toutes' || onglet === 'reverif';
    const showCode  = onglet !== 'directe';
    const showNote  = onglet !== 'liaison';
    const nbColonnes = 1 + (showType ? 1 : 0) + (showCode ? 1 : 0) + 1 + 1 + 1 + (showNote ? 1 : 0) + 1 + 1 + 1 + 1;

    const placeholderRecherche = {
        toutes:  "Rechercher (élève, N°, code, matière, opérateur...)",
        directe: "Rechercher un élève, N° d'incorporation, matière...",
        anonyme: "Rechercher un code anonyme, matière, opérateur...",
        liaison: "Rechercher un code, un élève, N° d'incorporation...",
        reverif: "Rechercher une saisie renvoyée (élève, code, matière, motif...)"
    }[onglet];

    const listeOnglets = isOperateur ? ONGLETS_OPERATEUR : ONGLETS;

    return (
        <div className="dashboard-redesign-container">
            <div className="top-nav-bar">
                <h1>Validation des Notes</h1>

                <select value={promotion} onChange={e => changerPromotion(e.target.value)}
                        style={{ ...selectStyle, minWidth: '170px', fontWeight: 600 }}>
                    <option value="">Toutes les promotions</option>
                    {promotions.map(p => <option key={p} value={p}>Promotion {p}</option>)}
                </select>

                {!isOperateur && (
                    <select value={statutFiltre} onChange={e => changerStatut(e.target.value)}
                            style={{ ...selectStyle, minWidth: '200px' }}>
                        {STATUTS.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                    </select>
                )}

                {!isOperateur && (
                    <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontWeight: 600 }}>
                        <input type="checkbox" checked={soloMine}
                               onChange={e => setSoloMine(e.target.checked)} />
                        Seulement mes saisies
                    </label>
                )}
                <button className="btn-export pdf-btn" onClick={fetchSaisies}><FiRefreshCw /> Actualiser</button>
            </div>

            {erreur && (
                <div className="card" style={{ marginBottom: '16px', color: '#dc3545', fontWeight: 600 }}>
                    {erreur}
                </div>
            )}

            {diag && !isOperateur && (
                <div style={{ marginBottom: '12px', fontSize: '0.85rem', color: '#4a5568' }}>
                    Rôle : <strong>{diag.role || '(vide)'}</strong> · en base : <strong>{diag.totalTable}</strong> ·
                    les miennes : <strong>{diag.miennes}</strong> · affichées : <strong>{saisiesPromo.length}</strong>
                </div>
            )}

            {resultat && (
                <div className="card" style={{ marginBottom: '16px' }}>
                    <p style={{ color: '#15803d', fontWeight: 700 }}>
                        {resultat.etape === 'transmission'
                            ? `${resultat.valides.length} saisie(s) renvoyée(s) au contrôleur.`
                            : `${resultat.valides.length} saisie(s) validée(s).`}
                    </p>
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
                    {listeOnglets.map(o => {
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
                                {compteurs[o.id] !== undefined && (
                                    <span style={{
                                        marginLeft: '8px',
                                        padding: '1px 8px',
                                        borderRadius: '10px',
                                        fontSize: '0.75rem',
                                        background: actif ? '#2c5282' : '#e2e8f0',
                                        color: actif ? '#fff' : '#4a5568'
                                    }}>{compteurs[o.id]}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {onglet === 'validees' && !isOperateur ? (
                    <ValideesPanel
                        canModifier={canModifierValidees}
                        canAgir={canAgirValidees}
                        promotion={promotion}
                        onChange={fetchSaisies}
                    />
                ) : (
                    <>
                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
                            <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '480px' }}>
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

                            <select
                                value={filtreCourant.examen}
                                onChange={e => changerExamen(e.target.value)}
                                style={{ ...selectStyle, minWidth: '170px' }}
                            >
                                <option value="">Tous les examens</option>
                                {optionsExamens.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                            </select>

                            <select
                                value={filtreCourant.matiere}
                                onChange={e => setFiltre('matiere', e.target.value)}
                                style={{ ...selectStyle, minWidth: '180px' }}
                            >
                                <option value="">
                                    {filtreCourant.examen ? `Matières de ${filtreCourant.examen}` : 'Toutes les matières'}
                                </option>
                                {optionsMatieres.map(([id, nom]) => <option key={id} value={id}>{nom}</option>)}
                            </select>

                            <select
                                value={filtreCourant.escadron}
                                onChange={e => setFiltre('escadron', e.target.value)}
                                style={{ ...selectStyle, minWidth: '160px' }}
                            >
                                <option value="">Tous les escadrons</option>
                                {optionsEscadrons.map(esc => <option key={esc} value={esc}>Escadron {esc}</option>)}
                                {aDesSansEscadron && <option value="__aucun__">Non identifié / sans escadron</option>}
                            </select>

                            {filtresActifs && (
                                <button type="button" onClick={reinitialiserFiltres}
                                        style={{ padding: '9px 12px', border: '1px solid #cbd5e0', borderRadius: '8px', background: '#fff', cursor: 'pointer' }}>
                                    Réinitialiser
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
                            <label style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <input type="checkbox"
                                       checked={toutSelectionne}
                                       onChange={toggleTout} />
                                Tout sélectionner ({lignesSelectionnables.length})
                            </label>
                            <button className="btn-export excel-btn" onClick={handleValider}
                                    disabled={idsAValider.length === 0 || saving}>
                                <FiCheckCircle />{' '}
                                {saving
                                    ? (isOperateur ? 'Envoi...' : 'Validation...')
                                    : (isOperateur
                                        ? `Renvoyer au contrôleur (${idsAValider.length})`
                                        : `Valider la sélection (${idsAValider.length})`)}
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
                                            <th>Statut</th>
                                            <th>Saisi par</th>
                                            <th>Date</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {saisiesAffichees.map(s => {
                                            const enEdition = editionId === s.id;
                                            const verrouille = isOperateur && estVerifie(s);
                                            return (
                                                <tr key={s.id}>
                                                    <td><input type="checkbox"
                                                               checked={selection.has(s.id)}
                                                               disabled={!selectionnable(s)}
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
                                                    <td>{badgeStatut(s)}</td>
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
                                                                    <button className="btn-icon" title="Modifier"
                                                                            disabled={verrouille}
                                                                            onClick={() => ouvrirEdition(s)}><FiEdit2 /></button>
                                                                )}
                                                                <button className="btn-icon delete" title="Rejeter"
                                                                        disabled={verrouille}
                                                                        onClick={() => handleRejeter(s.id)}><FiXCircle /></button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {saisiesAffichees.length === 0 && (
                                            <tr><td colSpan={nbColonnes} style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                                                {filtresActifs
                                                    ? 'Aucun résultat pour cette recherche / ces filtres.'
                                                    : (isOperateur
                                                        ? 'Aucune saisie renvoyée en vérification.'
                                                        : 'Aucune saisie en attente dans cet onglet.')}
                                            </td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default ValidationNotes;
