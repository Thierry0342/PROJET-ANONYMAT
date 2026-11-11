import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

export default function usePaquet(type) {
    const [paquet, setPaquet] = useState(null);
    const [loaded, setLoaded] = useState(false);
    const [verifies, setVerifies] = useState([]);

    const headers = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    const storageKey = paquet ? `paquetVerifies_${paquet.id}` : null;

    // Recharger les lignes déjà vérifiées (survit au rafraîchissement)
    useEffect(() => {
        if (!storageKey) { setVerifies([]); return; }
        try { setVerifies(JSON.parse(localStorage.getItem(storageKey)) || []); }
        catch { setVerifies([]); }
    }, [storageKey]);

    const sauverVerifies = (ids) => {
        setVerifies(ids);
        if (storageKey) { try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch {} }
    };
    const marquerVerifie = (id) => { if (!verifies.includes(id)) sauverVerifies([...verifies, id]); };
    const retirerVerifie = (id) => sauverVerifies(verifies.filter(x => x !== id));

    const refresh = useCallback(async () => {
        try {
            const res = await axios.get(`${API_BASE_URL}/api/paquets/actif`, { ...headers(), params: { type } });
            setPaquet(res.data || null);
        } catch (e) { console.error(e); }
        finally { setLoaded(true); }
    }, [type, headers]);

    useEffect(() => { refresh(); }, [refresh]);

    const demarrer = async ({ promotion, typeExamen, matiereId, total }) => {
        await axios.post(`${API_BASE_URL}/api/paquets`, {
            type_saisie: type, promotion: promotion || '', type_examen: typeExamen, matiere_id: matiereId, total
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
        refresh, demarrer, ajouterLigne, modifierLigne, supprimerLigne, transferer, annuler
    };
}