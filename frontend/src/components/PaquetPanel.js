import React, { useState } from 'react';
import {
    FaBoxOpen, FaPencilAlt, FaTrash, FaSave, FaTimes,
    FaListUl, FaCheck, FaChevronLeft, FaChevronRight
} from 'react-icons/fa';
import './PaquetPanel.css';

// Taille maximale d'un paquet (doit rester identique à MAX_PAQUET dans usePaquet.js)
const MAX_PAQUET = 20;

const messageErreur = (e) => e.response?.data?.message || e.message || 'Erreur';

// ── Démarrage / progression du paquet ────────────────────────────────────────
export default function PaquetProgress({ type, paquetCtl, contexte, peutDemarrer, onModifie }) {
    const { paquet, loaded, demarrer, transferer, annuler, toutVerifie, nonVerifiees } = paquetCtl;
    const [total, setTotal] = useState('');
    const [erreur, setErreur] = useState('');
    const [busy, setBusy] = useState(false);
    const libelle = type === 'liaison' ? 'liaison(s)' : 'note(s)';

    if (!loaded) return null;

    const handleDemarrer = async () => {
        const n = parseInt(total, 10);
        if (isNaN(n) || n < 1 || n > MAX_PAQUET) {
            setErreur(`Indiquez un nombre de copies entre 1 et ${MAX_PAQUET}.`);
            return;
        }
        setErreur(''); setBusy(true);
        try {
            await demarrer({ ...contexte, total: n });
            setTotal('');
            onModifie && onModifie();
        } catch (e) { setErreur(messageErreur(e)); }
        finally { setBusy(false); }
    };

    if (!paquet) {
        return (
            <div className="card paquet-card">
                <div className="paquet-header">
                    <FaBoxOpen /> <strong>Comptage de paquet</strong>
                    <span className="paquet-required">Obligatoire</span>
                </div>
                <p className="paquet-hint">
                    Indiquez le nombre de copies du paquet (maximum {MAX_PAQUET}) avant de commencer. Vos saisies resteront dans votre
                    liste d'attente (à vérifier) jusqu'à l'envoi en validation.
                </p>
                <div className="paquet-start">
                    <input
                        type="number" min="1" max={MAX_PAQUET} placeholder={`Nombre de copies (max ${MAX_PAQUET})`}
                        value={total}
                        onChange={e => {
                            // Empêche de dépasser le maximum dès la frappe
                            const v = e.target.value;
                            if (v !== '' && parseInt(v, 10) > MAX_PAQUET) { setTotal(String(MAX_PAQUET)); return; }
                            setTotal(v);
                        }}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleDemarrer(); } }}
                    />
                    <button className="btn btn-primary" onClick={handleDemarrer} disabled={!peutDemarrer || busy}>
                        Démarrer comptage paquet
                    </button>
                </div>
                {!peutDemarrer && <small className="paquet-hint">Sélectionnez d'abord la promotion, l'examen et la matière.</small>}
                {erreur && <div className="message error"><span>{erreur}</span></div>}
            </div>
        );
    }

    const nb = paquet.lignes.length;
    const complet = nb >= paquet.total_attendu;
    const pct = Math.min(100, Math.round((nb / paquet.total_attendu) * 100));

    const envoyer = async () => {
        const msg = complet
            ? `Envoyer les ${nb} ${libelle} en validation ?`
            : `Le paquet n'est pas complet (${nb}/${paquet.total_attendu}). Clôturer quand même avec ${nb} ${libelle} ?`;
        if (!window.confirm(msg)) return;
        setBusy(true); setErreur('');
        try {
            const res = await transferer();
            if (res.echecs && res.echecs.length > 0) {
                setErreur(`${res.transferes} envoyée(s), ${res.echecs.length} en échec (restées dans la liste) : ` +
                    res.echecs.map(x => `${x.code} → ${x.message}`).join(' | '));
            }
            onModifie && onModifie();
        } catch (e) { setErreur(messageErreur(e)); }
        finally { setBusy(false); }
    };

    const annulerPaquet = async () => {
        if (!window.confirm(`Annuler le paquet ? Les ${nb} saisie(s) de la liste d'attente seront supprimées.`)) return;
        setBusy(true); setErreur('');
        try { await annuler(); onModifie && onModifie(); }
        catch (e) { setErreur(messageErreur(e)); }
        finally { setBusy(false); }
    };

    return (
        <div className="card paquet-card">
            <div className="paquet-header">
                <FaBoxOpen /> <strong>Paquet en cours</strong>
                <span className="paquet-sub">
                    {paquet.nom_matiere} · {paquet.type_examen}{paquet.promotion ? ` · ${paquet.promotion}` : ''}
                </span>
            </div>
            <div className="paquet-counter"><span>{nb}</span> / {paquet.total_attendu}</div>
            <div className="paquet-bar"><div style={{ width: `${pct}%` }} /></div>

            {complet && (
                <div className="message success"><span>Paquet complet : vérifiez la liste d'attente puis envoyez-le en validation.</span></div>
            )}

            {nb > 0 && !toutVerifie && (
                <div className="message warning">
                    <span>
                        Vérifiez toutes les saisies avant l'envoi : il reste <strong>{nonVerifiees}</strong> saisie(s) à valider
                        dans « Liste d'attente » (bouton en bas à droite).
                    </span>
                </div>
            )}

            <div className="paquet-actions">
                <button
                    className={`btn ${complet ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={envoyer}
                    disabled={nb === 0 || busy || !toutVerifie}
                    title={!toutVerifie ? "Validez d'abord toutes les saisies de la liste d'attente" : ''}
                >
                    {complet ? 'Envoyer en validation' : `Clôturer avec ${nb}`}
                </button>
                <button className="btn btn-danger-outline" onClick={annulerPaquet} disabled={busy}>Annuler le paquet</button>
            </div>
            {erreur && <div className="message error"><span>{erreur}</span></div>}
        </div>
    );
}

// ── Liste d'attente : bouton flottant + vérification une par une ─────────────
export function PaquetListe({ type, paquetCtl, onModifie }) {
    const {
        paquet, modifierLigne, supprimerLigne, verifies, marquerVerifie,
        nonVerifiees, toutVerifie, attenteVerif
    } = paquetCtl;
    const [open, setOpen] = useState(false);
    const [index, setIndex] = useState(0);
    const [editing, setEditing] = useState(false);
    const [editNote, setEditNote] = useState('');
    const [erreur, setErreur] = useState('');

    if (!paquet) return null;

    const lignes = paquet.lignes;                 // dernière saisie en premier
    const i = Math.min(index, Math.max(0, lignes.length - 1));
    const l = lignes[i];
    const estVerifiee = !!l && verifies.includes(l.id);

    const ouvrir = () => {
        const premiere = lignes.findIndex(x => !verifies.includes(x.id));
        setIndex(premiere === -1 ? 0 : premiere);
        setEditing(false); setErreur('');
        setOpen(true);
    };

    const aller = (n) => {
        if (n < 0 || n >= lignes.length) return;
        setIndex(n); setEditing(false); setErreur('');
    };

    const valider = () => {
        if (!l) return;
        // 2 secondes minimum entre deux vérifications
        if (attenteVerif) return;
        const ok = marquerVerifie(l.id);
        if (!ok) return;
        const dejaOuIci = (x) => verifies.includes(x.id) || x.id === l.id;
        const suivante = lignes.findIndex((x, k) => k > i && !dejaOuIci(x));
        const premiere = lignes.findIndex(x => !dejaOuIci(x));
        const cible = suivante !== -1 ? suivante : premiere;
        setEditing(false);
        if (cible !== -1) aller(cible);   // sinon : tout est vérifié, on reste sur place
    };

    const sauver = async () => {
        const n = parseFloat(editNote);
        if (isNaN(n) || n < 0 || n > 20) { setErreur('La note doit être comprise entre 0 et 20.'); return; }
        try {
            await modifierLigne(l.id, n);
            setEditing(false); setErreur('');
            onModifie && onModifie();
        } catch (e) { setErreur(messageErreur(e)); }
    };

    const supprimer = async () => {
        if (!window.confirm("Retirer cette saisie de la liste d'attente ?")) return;
        try {
            await supprimerLigne(l.id);
            setErreur(''); setEditing(false);
            onModifie && onModifie();
        } catch (e) { setErreur(messageErreur(e)); }
    };

    const libelleValider = estVerifiee
        ? 'Déjà validée'
        : attenteVerif
            ? 'Patientez 2 s...'
            : (nonVerifiees > 1 ? 'Valider et suivant' : 'Valider');

    return (
        <>
            {/* Petit bouton en bas à droite */}
            <button type="button" className="paquet-fab" onClick={ouvrir} title="Liste d'attente à vérifier">
                <FaListUl />
                <span>Liste d'attente</span>
                <span className={`paquet-fab-badge ${toutVerifie ? 'ok' : ''}`}>
                    {toutVerifie ? <FaCheck /> : nonVerifiees}
                </span>
            </button>

            {open && (
                <div className="modal-overlay" onClick={() => setOpen(false)}>
                    <div className="modal-content paquet-review" onClick={e => e.stopPropagation()}>
                        <button type="button" className="modal-close" onClick={() => setOpen(false)}>&times;</button>
                        <h3>Vérification de la liste d'attente</h3>

                        {lignes.length === 0 ? (
                            <p>Aucune saisie pour le moment.</p>
                        ) : (
                            <>
                                <div className="paquet-review-progress">
                                    Saisie {i + 1} / {lignes.length} · Vérifiées : {lignes.length - nonVerifiees} / {lignes.length}
                                </div>
                                <div className="paquet-bar">
                                    <div style={{ width: `${((lignes.length - nonVerifiees) / lignes.length) * 100}%` }} />
                                </div>

                                {toutVerifie && (
                                    <div className="message success">
                                        <span>
                                            Toutes les saisies sont vérifiées. Vous pouvez maintenant envoyer le paquet en validation.
                                        </span>
                                        <button type="button" className="btn btn-primary" style={{ marginLeft: 12 }}
                                            onClick={() => setOpen(false)}>
                                            Fermer
                                        </button>
                                    </div>
                                )}

                                <div className={`paquet-review-card ${estVerifiee ? 'verifiee' : ''}`}>
                                    {i === 0 && <span className="paquet-review-tag">Dernière saisie</span>}
                                    {estVerifiee && <span className="paquet-review-tag ok"><FaCheck /> Vérifiée</span>}

                                    <div className="paquet-review-row">
                                        <label>Code</label>
                                        <strong className="paquet-review-big">{l.code_anonyme}</strong>
                                    </div>

                                    {type === 'note' ? (
                                        <div className="paquet-review-row">
                                            <label>Note</label>
                                            {editing ? (
                                                <input
                                                    type="number" step="0.25" min="0" max="20" autoFocus
                                                    value={editNote}
                                                    onChange={e => setEditNote(e.target.value)}
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); sauver(); } }}
                                                />
                                            ) : (
                                                <strong className="paquet-review-big">{parseFloat(l.note).toFixed(2)} / 20</strong>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="paquet-review-row">
                                            <label>Élève</label>
                                            <strong className="paquet-review-name">
                                                {l.numero_incorporation} - {(l.eleve_nom || '').toUpperCase()} {l.eleve_prenom}
                                                <small> ({l.escadron || '?'}/{l.peloton || '?'})</small>
                                            </strong>
                                        </div>
                                    )}

                                    <div className="paquet-review-row">
                                        <label>Heure</label>
                                        <span>{new Date(l.date_saisie).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                                {l.renvoi_motif && (
                                    <div className="message warning">
                                        <span><strong>À revérifier :</strong> {l.renvoi_motif}</span>
                                    </div>
                                )}

                                {erreur && <div className="message error"><span>{erreur}</span></div>}

                                <div className="paquet-review-actions">
                                    {editing ? (
                                        <>
                                            <button type="button" className="btn btn-primary" onClick={sauver}><FaSave /> Enregistrer</button>
                                            <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}><FaTimes /> Annuler</button>
                                        </>
                                    ) : (
                                        <>
                                            <button type="button" className="btn btn-primary" onClick={valider}
                                                disabled={attenteVerif || (estVerifiee && toutVerifie)}>
                                                <FaCheck /> {libelleValider}
                                            </button>
                                            {type === 'note' && (
                                                <button type="button" className="btn btn-secondary"
                                                    onClick={() => { setEditing(true); setEditNote(l.note); }}>
                                                    <FaPencilAlt /> Modifier
                                                </button>
                                            )}
                                            <button type="button" className="btn btn-danger-outline" onClick={supprimer}>
                                                <FaTrash /> Retirer
                                            </button>
                                        </>
                                    )}
                                </div>

                                <div className="paquet-review-nav">
                                    <button type="button" onClick={() => aller(i - 1)} disabled={i === 0}>
                                        <FaChevronLeft /> Plus récente
                                    </button>
                                    <button type="button" onClick={() => aller(i + 1)} disabled={i >= lignes.length - 1}>
                                        Plus ancienne <FaChevronRight />
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
}
