import React, { useMemo } from 'react';
import { FaInfoCircle } from 'react-icons/fa';

// ── Barème unique (seuils inchangés, le circuit garde la même longueur totale) ──
export const BAREME_PARCOURS = [
    { seuil: 1 * 3600 + 30 * 60 + 0, note: 20 },
    { seuil: 2 * 3600 + 14 * 60 + 0, note: 19 },
    { seuil: 2 * 3600 + 29 * 60 + 59, note: 18 },
    { seuil: 2 * 3600 + 44 * 60 + 59, note: 17 },
    { seuil: 2 * 3600 + 59 * 60 + 59, note: 16 },
    { seuil: 3 * 3600 + 14 * 60 + 59, note: 15 },
    { seuil: 3 * 3600 + 29 * 60 + 59, note: 14 },
    { seuil: 3 * 3600 + 44 * 60 + 59, note: 13 },
    { seuil: 3 * 3600 + 59 * 60 + 59, note: 12 },
];

export const CHECKPOINTS_PARCOURS_ANCIEN = [
    { key: 'rsa', label: 'RSA', arrivee: false, depart: true },
    { key: 'topo', label: 'TOPO', arrivee: true, depart: true },
    { key: 'tel', label: 'TEL', arrivee: true, depart: true },
    { key: 'eit', label: 'EIT', arrivee: true, depart: true },
    { key: 'secourisme', label: 'SECOURISME', arrivee: true, depart: true },
    { key: 'tir', label: 'TIR', arrivee: true, depart: true },
    { key: 'os', label: 'OS', arrivee: true, depart: false },
];

export const CHECKPOINTS_PARCOURS_NOUVEAU = [
    { key: '8km', label: '8 KMS', arrivee: true, depart: true, arriveeChainee: false },
    { key: 'rsa', label: 'RSA', arrivee: true, depart: true },
    { key: 'telecom', label: 'TELECOM', arrivee: true, depart: true },
    { key: 'topo', label: 'TOPO', arrivee: true, depart: true },
    { key: 'combat', label: 'COMBAT', arrivee: true, depart: true },
    { key: 'secourisme', label: 'SECOURISME', arrivee: true, depart: true },
    { key: 'arm', label: 'ARM', arrivee: true, depart: true },
    { key: 'tir', label: 'TIR', arrivee: true, depart: true },
    { key: 'os', label: 'OS', arrivee: true, depart: false },
];

const construireChampsTous = (checkpoints) => checkpoints.reduce((champs, cp) => {
    if (cp.arrivee) champs.push(`${cp.key}_arrivee`);
    if (cp.depart) champs.push(`${cp.key}_depart`);
    return champs;
}, []);

const construireChampsOrdonnes = (checkpoints) => checkpoints.reduce((champs, cp) => {
    if (cp.arrivee && cp.arriveeChainee !== false) champs.push(`${cp.key}_arrivee`);
    if (cp.depart) champs.push(`${cp.key}_depart`);
    return champs;
}, []);

export const VERSIONS_PARCOURS = {
    nouveau: {
        id: 'nouveau',
        label: 'Nouveau circuit',
        description: 'Fiche en vigueur à partir d\'aujourd\'hui (8 KMS, RSA, TELECOM, TOPO, COMBAT, SECOURISME, ARM, TIR, OS)',
        checkpoints: CHECKPOINTS_PARCOURS_NOUVEAU,
        bareme: BAREME_PARCOURS,
        champsTous: construireChampsTous(CHECKPOINTS_PARCOURS_NOUVEAU),
        champsOrdonnes: construireChampsOrdonnes(CHECKPOINTS_PARCOURS_NOUVEAU),
    },
    ancien: {
        id: 'ancien',
        label: 'Ancien circuit',
        description: 'Pour les fiches papier déjà remplies avant le changement (RSA, TOPO, TEL, EIT, SECOURISME, TIR, OS)',
        checkpoints: CHECKPOINTS_PARCOURS_ANCIEN,
        bareme: BAREME_PARCOURS,
        champsTous: construireChampsTous(CHECKPOINTS_PARCOURS_ANCIEN),
        champsOrdonnes: construireChampsOrdonnes(CHECKPOINTS_PARCOURS_ANCIEN),
    },
};

export const MATIERE_PARCOURS_NOM = 'PG';

export const timeToSeconds = (hhmm) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 3600 + m * 60;
};

export const champsInvalides = (temps, champsTous) => {
    const invalides = new Set();
    for (let i = 1; i < champsTous.length; i++) {
        const champPrecedent = champsTous[i - 1];
        const champActuel = champsTous[i];
        const tPrec = timeToSeconds(temps[champPrecedent]);
        const tActuel = timeToSeconds(temps[champActuel]);
        if (tPrec !== null && tActuel !== null && tActuel <= tPrec) {
            invalides.add(champPrecedent);
            invalides.add(champActuel);
        }
    }
    return invalides;
};

export const calculerDureeTotale = (temps, champsOrdonnes) => {
    const valeurs = champsOrdonnes.map(id => timeToSeconds(temps[id]));
    if (valeurs.some(v => v === null)) return null;
    let total = 0;
    for (let i = 0; i < valeurs.length; i += 2) {
        const duree = valeurs[i + 1] - valeurs[i];
        if (duree <= 0) return null;
        total += duree;
    }
    return total;
};

export const noteDepuisBareme = (totalSecondes, bareme) => {
    if (totalSecondes === null) return null;
    let note = null;
    for (const { seuil, note: n } of bareme) {
        if (seuil <= totalSecondes) note = n;
        else break;
    }
    return note === null ? 20 : note;
};

export const formatDuree = (secondes) => {
    if (secondes === null) return '--h--m--s';
    const h = Math.floor(secondes / 3600);
    const m = Math.floor((secondes % 3600) / 60);
    const s = Math.floor(secondes % 60);
    return `${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
};

// Vue en lecture seule des heures enregistrées pour une copie donnée.
export const ParcoursDetailsView = ({ detailsParcours, versionId, note }) => {
    const version = VERSIONS_PARCOURS[versionId] || VERSIONS_PARCOURS.nouveau;

    // ✅ Tolère le cas où detailsParcours arrive en chaîne JSON au lieu d'un objet
    const detailsObj = useMemo(() => {
        if (!detailsParcours) return null;
        if (typeof detailsParcours === 'string') {
            try {
                const parsed = JSON.parse(detailsParcours);
                return parsed;
            } catch {
                return null;
            }
        }
        return detailsParcours;
    }, [detailsParcours]);

    const aDesHeures = detailsObj && Object.keys(detailsObj).length > 0;

    const duree = useMemo(() => {
        if (!aDesHeures) return null;
        return calculerDureeTotale(detailsObj, version.champsOrdonnes);
    }, [detailsObj, version, aDesHeures]);

    if (!aDesHeures) {
        return <p style={{ color: '#718096' }}>Aucune heure enregistrée pour cette note.</p>;
    }

    return (
        <div className="parcours-chrono-box">
            <p className="parcours-version-desc"><FaInfoCircle /> {version.label} — {version.description}</p>
            <table className="parcours-table">
                <thead>
                    <tr><th>Poste</th><th>Arrivée</th><th>Départ</th></tr>
                </thead>
                <tbody>
                    {version.checkpoints.map(cp => (
                        <tr key={cp.key}>
                            <td>{cp.label}</td>
                            <td>{cp.arrivee ? (detailsObj[`${cp.key}_arrivee`] || '—') : <span className="champ-absent">—</span>}</td>
                            <td>{cp.depart ? (detailsObj[`${cp.key}_depart`] || '—') : <span className="champ-absent">—</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="parcours-result">
                <span>Temps total : <strong>{formatDuree(duree)}</strong></span>
                <span>Note enregistrée : <strong>{note} / 20</strong></span>
            </div>
        </div>
    );
};