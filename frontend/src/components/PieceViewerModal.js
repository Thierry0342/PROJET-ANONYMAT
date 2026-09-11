import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { FiX, FiDownload, FiAlertTriangle } from 'react-icons/fi';

const PieceViewerModal = ({ piece, headers, onClose }) => {
    const [blobUrl, setBlobUrl] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let objectUrl = null;
        let cancelled = false;

    const load = async () => {
    setLoading(true);
    setError('');
    try {
        const res = await axios.get(`/api/conseil/pieces-jointes/${piece.id}/telecharger`, {
            headers, responseType: 'blob'
        });
        if (!res.data || res.data.size === 0) throw new Error("Fichier vide.");

        const type = res.headers['content-type'] || piece.mime_type || 'application/octet-stream';

        // ✅ Si le serveur renvoie du JSON (page d'erreur) avec un statut 200,
        // le blob contient en fait un message d'erreur texte, pas le fichier.
        if (type.includes('application/json')) {
            const text = await res.data.text();
            throw new Error(JSON.parse(text)?.message || "Réponse invalide du serveur.");
        }

        const blob = new Blob([res.data], { type });
        objectUrl = window.URL.createObjectURL(blob);
        if (!cancelled) setBlobUrl(objectUrl);
    } catch (e) {
        //  Log complet en console pour diagnostiquer précisément
        console.error('Erreur chargement pièce jointe:', e.response?.status, e.response?.data, e.message);
        if (!cancelled) {
            const status = e.response?.status;
            if (status === 401) setError("Session expirée, veuillez vous reconnecter.");
            else if (status === 404) setError("Fichier introuvable (peut-être supprimé).");
            else setError(e.message || "Impossible de charger ce fichier.");
        }
    } finally {
        if (!cancelled) setLoading(false);
    }
};
        load();

        return () => {
            cancelled = true;
            if (objectUrl) window.URL.revokeObjectURL(objectUrl);
        };
    }, [piece.id, headers, piece.mime_type]);

    const isPdf = (piece.mime_type || '').includes('pdf');
    const isImage = (piece.mime_type || '').startsWith('image/');

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
           <div style={{ background: '#fff', borderRadius: '8px', width: '98vw', height: '96vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', borderBottom: '1px solid #eee' }}>
                    <strong style={{ fontSize: '0.9rem' }}>{piece.nom_fichier}</strong>
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                        {blobUrl && (
                            <a href={blobUrl} download={piece.nom_fichier} style={{ color: '#3751FF' }} title="Télécharger">
                                <FiDownload />
                            </a>
                        )}
                        <FiX style={{ cursor: 'pointer', fontSize: '1.3rem' }} onClick={onClose} />
                    </div>
                </div>
                <div style={{ flex: 1, overflow: 'auto', background: '#f8f9fa' }}>
                    {loading && <p style={{ padding: '30px', textAlign: 'center' }}>Chargement du fichier...</p>}
                    {!loading && error && (
                        <div style={{ padding: '30px', textAlign: 'center', color: '#dc3545' }}>
                            <FiAlertTriangle style={{ fontSize: '2rem', marginBottom: '10px' }} />
                            <p>{error}</p>
                        </div>
                    )}
                    {!loading && !error && blobUrl && isPdf && (
                        <iframe src={blobUrl} title={piece.nom_fichier} style={{ width: '100%', height: '100%', border: 'none' }} />
                    )}
                    {!loading && !error && blobUrl && isImage && (
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
                            <img src={blobUrl} alt={piece.nom_fichier} style={{ maxWidth: '100%', maxHeight: '75vh' }} />
                        </div>
                    )}
                    {!loading && !error && blobUrl && !isPdf && !isImage && (
                        <div style={{ padding: '30px', textAlign: 'center' }}>
                            <p>Aperçu non disponible pour ce type de fichier.</p>
                            <a href={blobUrl} download={piece.nom_fichier} className="btn-export pdf-btn" style={{ display: 'inline-flex', marginTop: '10px' }}>
                                <FiDownload /> Télécharger
                            </a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PieceViewerModal;