import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { FiX, FiPaperclip, FiDownload, FiTrash2, FiUpload } from 'react-icons/fi';
import PieceViewerModal from './PieceViewerModal';
import { EXTERNAL_API_BASE_URL } from '../config/apiConfig';

const DEFAULT_AVATAR_URL = "https://www.w3schools.com/w3images/avatar_hat.jpg";

const formatNom = (nom) => nom ? nom.toUpperCase() : '';
const formatPrenom = (prenom) => {
    if (!prenom) return '';
    return prenom.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};
const formatTaille = (bytes) => {
    if (!bytes) return '0 Ko';
    const ko = bytes / 1024;
    return ko < 1024 ? `${ko.toFixed(0)} Ko` : `${(ko / 1024).toFixed(1)} Mo`;
};
const CATEGORIES_PIECE = [
    { value: 'certificat_visite', label: 'Certificat de Visite' },
    { value: 'pv_conseil', label: 'Extrait PV Conseil' },
    { value: 'autre', label: 'Autre' }
];
const calculateDaysBetween = (start, end) => {
    if (!start || !end) return 0;
    const s = new Date(start), e = new Date(end);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
    return Math.ceil(Math.abs(e - s) / (1000 * 60 * 60 * 24));
};

const ConseilEleveModal = ({ decision, headers, examensDisponibles, onClose }) => {
    const [pieces, setPieces] = useState([]);
    const [loadingPieces, setLoadingPieces] = useState(true);
    const [fichier, setFichier] = useState(null);
    const [categorie, setCategorie] = useState('certificat_visite');
    const [typeExamenCible, setTypeExamenCible] = useState(examensDisponibles[0]?.nom_modele || 'General');
    const [uploading, setUploading] = useState(false);
    const [viewingPiece, setViewingPiece] = useState(null);

    // ── Fiche élève (photo + infos + moyennes) ──
    const [studentDetails, setStudentDetails] = useState(null);
    const [photoUrl, setPhotoUrl] = useState(DEFAULT_AVATAR_URL);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [examResults, setExamResults] = useState([]);
    const [healthSummary, setHealthSummary] = useState(null); // { sanctions, consultationDays, absenceDays }

    const currentIncorp = String(decision.numero_incorporation || '').trim();
    const courNormalise = decision.promotion ? decision.promotion.replace(/[^0-9]/g, '') : '';

    // Photo + infos personnelles + résumé médical/discipline (source externe, condensé)
    useEffect(() => {
        const fetchProfile = async () => {
            setLoadingProfile(true);
            try {
                const [detailsRes, sancRes, consultRes, absenceRes] = await Promise.allSettled([
                    axios.get(`${EXTERNAL_API_BASE_URL}/api/eleve/incorporation/${currentIncorp}?cour=${courNormalise}`),
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/sanctions/bulk`, { incorporations: [currentIncorp], cour: courNormalise }, { timeout: 5000 }),
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/consultation/bulk`, { incorporations: [currentIncorp], cour: courNormalise }, { timeout: 5000 }),
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/absence/bulk`, { incorporations: [currentIncorp], cour: courNormalise }, { timeout: 5000 })
                ]);

                if (detailsRes.status === 'fulfilled' && detailsRes.value.data?.eleve) {
                    const eleveInfo = detailsRes.value.data.eleve;
                    setStudentDetails(eleveInfo);
                    if (eleveInfo.image) setPhotoUrl(`${EXTERNAL_API_BASE_URL}${eleveInfo.image}`);
                }

                const sanctions = sancRes.status === 'fulfilled' ? (sancRes.value.data || []).filter(s => String(s.Eleve?.numeroIncorporation).trim() === currentIncorp) : [];
                const consultations = consultRes.status === 'fulfilled' ? (consultRes.value.data || []).filter(c => String(c.Eleve?.numeroIncorporation || '').trim() === currentIncorp) : [];
                const absences = absenceRes.status === 'fulfilled' ? (absenceRes.value.data || []).filter(a => String(a.Eleve?.numeroIncorporation || '').trim() === currentIncorp) : [];

                const consultationDays = consultations.reduce((sum, c) => {
                    const arrivee = c.dateArrive || new Date().toISOString();
                    return sum + calculateDaysBetween(c.dateDepart, arrivee);
                }, 0);

                setHealthSummary({
                    sanctions: sanctions.length,
                    consultations: consultations.length,
                    consultationDays,
                    absences: absences.length
                });
            } catch (e) { }
            finally { setLoadingProfile(false); }
        };
        if (currentIncorp) fetchProfile();
    }, [currentIncorp, courNormalise]);

    // Moyennes / rangs pour tous les examens de l'élève
    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await axios.get(`/api/resultats/stats-eleve/${decision.eleve_id}`, { headers });
                setExamResults(res.data || []);
            } catch (e) { }
        };
        fetchStats();
    }, [decision.eleve_id, headers]);

    const fetchPieces = useCallback(async () => {
        try {
            setLoadingPieces(true);
            const res = await axios.get(`/api/conseil/pieces-jointes/eleve/${decision.eleve_id}`, { headers });
            setPieces(res.data);
        } catch (e) { }
        finally { setLoadingPieces(false); }
    }, [decision.eleve_id, headers]);

    useEffect(() => { fetchPieces(); }, [fetchPieces]);

    const handleUpload = async () => {
        if (!fichier) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('fichier', fichier);
            formData.append('promotion', decision.promotion);
            formData.append('type_examen', typeExamenCible);
            formData.append('eleve_id', decision.eleve_id);
            formData.append('categorie', categorie);
            await axios.post('/api/conseil/pieces-jointes', formData, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
            setFichier(null);
            fetchPieces();
        } catch (e) {
            alert(e.response?.data?.message || "Erreur lors de l'envoi du fichier.");
        } finally { setUploading(false); }
    };

    const deletePiece = async (id) => {
        if (!window.confirm("Supprimer cette pièce jointe ?")) return;
        try {
            await axios.delete(`/api/conseil/pieces-jointes/${id}`, { headers });
            fetchPieces();
        } catch (e) { alert("Erreur lors de la suppression."); }
    };

    const displayStudent = studentDetails || decision;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
            <div style={{ background: '#fff', borderRadius: '14px', width: '680px', maxWidth: '94vw', maxHeight: '88vh', overflowY: 'auto', padding: '24px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                <FiX style={{ position: 'absolute', top: '18px', right: '18px', cursor: 'pointer', fontSize: '1.4rem' }} onClick={onClose} />

                {/* ── En-tête : photo + identité ── */}
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '10px' }}>
                    <img
                        src={photoUrl}
                        alt="Photo élève"
                        onError={() => setPhotoUrl(DEFAULT_AVATAR_URL)}
                        style={{ width: '72px', height: '72px', borderRadius: '10px', objectFit: 'cover', border: '2px solid #eee', background: '#f1f5f9' }}
                    />
                    <div>
                        <h2 style={{ margin: 0 }}>{formatNom(decision.nom)} {formatPrenom(decision.prenom)}</h2>
                        <p style={{ color: '#666', margin: '4px 0 0 0', fontSize: '0.85rem' }}>
                            N° {decision.numero_incorporation} • Promotion {decision.promotion}
                            {decision.escadron && ` • Esc. ${decision.escadron}`} {decision.peloton && `/ Pon ${decision.peloton}`}
                            {displayStudent.matricule && ` • MLE ${displayStudent.matricule}`}
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', margin: '12px 0' }}>
                    <span className="status-badge" style={{ backgroundColor: '#3751FF' }}>
                        {decision.type_examen ? `${decision.type_examen.replace(/_/g, ' ')} — ` : ''}{decision.type_decision.replace(/_/g, ' ').toUpperCase()}
                    </span>
                    <span style={{ background: '#eee', padding: '4px 10px', borderRadius: '20px', fontSize: '0.85rem' }}>
                        Motif : {decision.motif || 'Non renseigné'}
                    </span>
                </div>

                {/* ── Moyennes par examen ── */}
                <h5 style={{ margin: '14px 0 8px 0' }}>📊 Moyennes</h5>
                {examResults.length === 0 ? (
                    <p className="conseil-empty-text">Aucune moyenne disponible.</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px', marginBottom: '14px' }}>
                        {examResults.map(r => {
                            const passed = parseFloat(r.moyenne) >= 12;
                            return (
                                <div key={r.type_examen} style={{
                                    background: '#f8f9fa', borderRadius: '8px', padding: '8px 10px',
                                    borderLeft: `4px solid ${r.moyenne == null ? '#94a3b8' : passed ? '#28a745' : '#dc3545'}`
                                }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '700', color: '#555' }}>{r.type_examen.replace(/_/g, ' ')}</div>
                                    <div style={{ fontSize: '1rem', fontWeight: '800', color: r.moyenne == null ? '#94a3b8' : passed ? '#28a745' : '#dc3545' }}>
                                        {r.moyenne ?? 'N/A'} {r.moyenne != null && '/20'}
                                    </div>
                                    {r.rang && <div style={{ fontSize: '0.7rem', color: '#666' }}>Rang {r.rang}</div>}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Résumé absences / santé / discipline (condensé) ── */}
                <h5 style={{ margin: '14px 0 8px 0' }}>🩺 Résumé Absences & Discipline</h5>
                {loadingProfile ? (
                    <p className="conseil-empty-text">Chargement...</p>
                ) : healthSummary ? (
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        <span style={{ background: '#fee2e2', color: '#991b1b', padding: '6px 12px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}>
                            <i className="fa fa-gavel" style={{ marginRight: '6px' }}></i>{healthSummary.sanctions} sanction(s)
                        </span>
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '6px 12px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}>
                            <i className="fa fa-heartbeat" style={{ marginRight: '6px' }}></i>{healthSummary.consultationDays} j. consultation
                        </span>
                        <span style={{ background: '#e0e7ff', color: '#3730a3', padding: '6px 12px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: '700' }}>
                            <i className="fa fa-calendar-times-o" style={{ marginRight: '6px' }}></i>{healthSummary.absences} absence(s)
                        </span>
                    </div>
                ) : (
                    <p className="conseil-empty-text">Données externes indisponibles.</p>
                )}

                <hr style={{ margin: '16px 0' }} />

                {/* ── Pièces jointes ── */}
                <h4 style={{ marginBottom: '10px' }}><FiPaperclip /> Pièces jointes de l'élève</h4>

                <div className="conseil-upload-row" style={{ marginBottom: '14px' }}>
                    <select className="search-input" value={typeExamenCible} onChange={e => setTypeExamenCible(e.target.value)}>
                        {examensDisponibles.map(ex => (
                            <option key={ex.id ?? ex.nom_modele} value={ex.nom_modele}>{ex.nom_modele.replace(/_/g, ' ')}</option>
                        ))}
                    </select>
                    <select className="search-input" value={categorie} onChange={e => setCategorie(e.target.value)}>
                        {CATEGORIES_PIECE.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    <input type="file" onChange={e => setFichier(e.target.files[0])} />
                    <button className="btn-export pdf-btn" onClick={handleUpload} disabled={!fichier || uploading}>
                        <FiUpload /> {uploading ? 'Envoi...' : 'Envoyer'}
                    </button>
                </div>

                {loadingPieces ? (
                    <p>Chargement des pièces jointes...</p>
                ) : pieces.length === 0 ? (
                    <p className="conseil-empty-text">Aucune pièce jointe pour cet élève.</p>
                ) : (
                    <ul className="conseil-pieces-list">
                        {pieces.map(p => (
                            <li key={p.id} className="piece-item">
                                <div className="piece-item-info" style={{ cursor: 'pointer' }} onClick={() => setViewingPiece(p)}>
                                    <FiPaperclip />
                                    <div>
                                        <div className="piece-item-name">{p.nom_fichier}</div>
                                        <small>{p.type_examen.replace(/_/g, ' ')} • {CATEGORIES_PIECE.find(c => c.value === p.categorie)?.label || p.categorie} • {formatTaille(p.taille)}</small>
                                    </div>
                                </div>
                                <div className="piece-item-actions">
                                    <button className="btn-icon" style={{ color: '#3751FF' }} onClick={() => setViewingPiece(p)}><FiDownload /></button>
                                    <button className="btn-icon delete" onClick={() => deletePiece(p.id)}><FiTrash2 /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {viewingPiece && <PieceViewerModal piece={viewingPiece} headers={headers} onClose={() => setViewingPiece(null)} />}
        </div>
    );
};

export default ConseilEleveModal;