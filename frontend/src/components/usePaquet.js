import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// Taille maximale d'un paquet
export const MAX_PAQUET = 20;
// Délai minimal entre deux vérifications de copie dans la liste d'attente
export const DELAI_VERIF_MS = 2000;

export default function usePaquet(type) {
    const [paquet, setPaquet] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [verifies, setVerifies] = useState([]);
    // true pendant les 2 s qui suivent une vérification (pour désactiver les boutons)
    const [attenteVerif, setAttenteVerif] = useState(false);
    const derniereVerifRef = useRef(0);
    const verifiesRef = useRef([]);

    const headers = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    const storageKey = paquet ? `paquetVerifies_${paquet.id}` : null;

    // Recharger les lignes déjà vérifiées (survit au rafraîchissement)
    useEffect(() => {
        if (!storageKey) { setVerifies([]); verifiesRef.current = []; return; }
        try {
            const ids = JSON.parse(localStorage.getItem(storageKey)) || [];
            setVerifies(ids);
            verifiesRef.current = ids;
        } catch { setVerifies([]); verifiesRef.current = []; }
    }, [storageKey]);

    const sauverVerifies = (ids) => {
        verifiesRef.current = ids;
        setVerifies(ids);
        if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch {} }
    };

    // Retourne true si la vérification est prise en compte, false si trop rapide (< 2 s)
    const marquerVerifie = (id) => {
        if (verifiesRef.current.includes(id)) return true;
        const maintenant = Date.now();
        if (maintenant - derniereVerifRef.current < DELAI_VERIF_MS) return false;
        derniereVerifRef.current = maintenant;
        setAttenteVerif(true);
        setTimeout(() => setAttenteVerif(false), DELAI_VERIF_MS);
        sauverVerifies([...verifiesRef.current, id]);
        return true;
    };
    const retirerVerifie = (id) => sauverVerifies(verifiesRef.current.filter(x => x !== id));

    const refresh = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/paquets/actif`, { ...headers(), params: { type } });
            setPaquet(res.data || null);
        } catch (e) { console.error(e); }
        finally { setLoaded(true); }
    }, [type, headers]);

    useEffect(() => { refresh(); }, [refresh]);

    const demarrer = async ({ promotion, typeExamen, matiereId, total }) => {
        const nb = parseInt(total, 10);
        if (!nb || nb < 1) throw new Error('Nombre de copies invalide');
        if (nb > MAX_PAQUET) throw new Error(`Un paquet ne peut pas dépasser ${MAX_PAQUET} copies`);
        await axios.post(`${API_BASE_URL}/api/paquets`, {
            type_saisie: type, promotion: promotion || '', type_examen: typeExamen, matiere_id: matiereId, total: nb
        }, headers());
        await refresh();
    };

    const ajouterLigne = async (payload) => {
        if (!paquet) throw new Error('Aucun paquet');
        await axios.post(`${API_BASE_URL}/api/paquets/${paquet.id}/lignes`, payload, headers());
        await refresh();
    };

    const modifierLigne = async (ligneId, note) => {
        await axios.put(`${API_BASE_URL}/api/paquets/${paquet.id}/lignes/${ligneId}`, { note }, headers());
        await refresh();
    };

    const supprimerLigne = async (ligneId) => {
        await axios.delete(`${API_BASE_URL}/api/paquets/${paquet.id}/lignes/${ligneId}`, headers());
        retirerVerifie(ligneId);
        await refresh();
    };

    const transferer = async () => {
        const res = await axios.post(`${API_BASE_URL}/api/paquets/${paquet.id}/transferer`, {}, headers());
        await refresh();
        return res.data;
    };

    const annuler = async () => {
        await axios.delete(`${API_BASE_URL}/api/paquets/${paquet.id}`, headers());
        if (storageKey) { try { localStorage.removeItem(storageKey); } catch {} }
        await refresh();
    };

    const nbSaisies = paquet ? paquet.lignes.length : 0;
    const complet = !!paquet && nbSaisies >= paquet.total_attendu;
    const nonVerifiees = paquet ? paquet.lignes.filter(l => !verifies.includes(l.id)).length : 0;
    const toutVerifie = nbSaisies > 0 && nonVerifiees === 0;

    return {
        paquet, loaded, nbSaisies, complet,
        verifies, nonVerifiees, toutVerifie, marquerVerifie, retirerVerifie,
        attenteVerif,
        refresh, demarrer, ajouterLigne, modifierLigne, supprimerLigne, transferer, annuler
    };
}
