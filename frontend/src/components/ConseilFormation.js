import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { FiEdit, FiTrash2, FiPlusCircle, FiPaperclip, FiDownload, FiUpload, FiChevronDown, FiChevronUp, FiEye } from 'react-icons/fi';
import ConseilEleveModal from './ConseilEleveModal';
import PieceViewerModal from './PieceViewerModal';
import './DashboardRedesign.css';
import './ConseilFormation.css';

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
    { value: 'pv_conseil', label: 'PV de Conseil' },
    { value: 'fiche_presence', label: 'Fiche de Présence' },
    { value: 'certificat_visite', label: 'Certificat de Visite' },
    { value: 'autre', label: 'Autre' }
];

const DECISIONS_FINALES = [
    { value: 'ajournement_3m', label: 'Ajournement 3 mois', key: 'ajour3', badgeLabel: 'Ajournement 3m' },
    { value: 'ajournement_6m', label: 'Ajournement 6 mois', key: 'ajour6', badgeLabel: 'Ajournement 6m' },
    { value: 'redoublement', label: 'Redoublement', key: 'redouble', badgeLabel: 'Redoublement' },
    { value: 'radiation', label: 'Remise à la famille', key: 'radiation', badgeLabel: 'Remise Famille' }
];
const DECISIONS_EXAMEN = [
    { value: 'ad_famille_traitement', label: 'AD Famille (traitement)' },
    { value: 'proposition_radiation', label: 'Proposition Radiation' }
];
const MOTIFS_EXAMEN = ['Santé', 'Discipline', 'Inaptitude Physique', 'Phénomène paranormal', 'Autre'];

// ═══════════════════ Panneau de décisions (tableau cliquable) ═══════════════════
const DecisionPanel = ({ mode, typeExamen, promotion, headers, decisionsSaved, onChanged, quotas, setQuotas, onOpenEleve }) => {
    const [searchStudent, setSearchStudent] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [selectedType, setSelectedType] = useState(mode === 'final' ? 'ajournement_3m' : 'ad_famille_traitement');
    const [selectedMotif, setSelectedMotif] = useState('');
    const [editingDecision, setEditingDecision] = useState(null);

    const handleSearchEleve = async (query) => {
        setSearchStudent(query);
        if (query.length > 1) {
            try {
                const res = await axios.get(`/api/eleves/recherche?q=${query}&promotion=${promotion}`, { headers });
                setSearchResults(res.data);
            } catch (e) { }
        } else setSearchResults([]);
    };

    const handleSelectFromSearch = async (eleve) => {
        try {
            await axios.post('/api/decisions-conseil', {
                eleve_id: eleve.id, type_decision: selectedType, motif: selectedMotif, type_examen: typeExamen
            }, { headers });
            onChanged();
            setSearchStudent('');
            setSearchResults([]);
            setSelectedMotif('');
        } catch (e) { alert("Erreur : l'élève est peut-être déjà inscrit pour cet examen."); }
    };

    const handleUpdate = async () => {
        if (!editingDecision) return;
        try {
            await axios.put(`/api/decisions-conseil/${editingDecision.id}`, {
                type_decision: selectedType, motif: selectedMotif
            }, { headers });
            setEditingDecision(null);
            setSearchStudent('');
            setSelectedMotif('');
            onChanged();
        } catch (e) { }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Supprimer cette décision ?")) return;
        try {
            await axios.delete(`/api/decisions-conseil/${id}`, { headers });
            onChanged();
        } catch (e) { }
    };

    const handleEditClick = (e, d) => {
        e.stopPropagation();
        setEditingDecision(d);
        setSelectedType(d.type_decision);
        setSelectedMotif(d.motif || '');
        setSearchStudent(`${formatNom(d.nom)} ${formatPrenom(d.prenom)}`);
    };

    // ✅ Filtre strict : type d'examen ET promotion, pour éviter les fuites entre promotions
    const decisionsExamen = decisionsSaved.filter(
        d => d.type_examen === typeExamen && String(d.promotion) === String(promotion)
    );
    const getCount = (type) => decisionsExamen.filter(d => d.type_decision === type).length;

    const options = mode === 'final' ? DECISIONS_FINALES : DECISIONS_EXAMEN;
    const motifs = mode === 'final'
        ? ['Santé', 'Insuffisance Intellectuelle', 'Discipline', 'Inaptitude Physique']
        : MOTIFS_EXAMEN;

    return (
        <div className="decision-panel">
            {mode === 'final' && (
                <div className="quota-mini-row">
                    {options.map(opt => {
                        const restant = (quotas[opt.key] ?? 0) - getCount(opt.value);
                        return (
                            <div key={opt.value} className={`quota-mini-card ${restant < 0 ? 'danger' : ''}`}>
                                <span className="quota-mini-label">{opt.badgeLabel}</span>
                                <span className="quota-mini-val">{getCount(opt.value)}</span>
                                <span className="quota-mini-restant">Reste : {restant}</span>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="decision-panel-body">
                <div className="decision-form-col">
                    <div className="card">
                        <h4 style={{ marginBottom: '12px', fontSize: '0.95rem' }}>{editingDecision ? '📝 Modifier' : '➕ Ajouter un élève'}</h4>

                        {editingDecision && <div className="editing-name">Modification de : <strong>{searchStudent}</strong></div>}

                        <div className="form-group">
                            <label>Type de décision</label>
                            <select className="search-input" value={selectedType} onChange={e => setSelectedType(e.target.value)}>
                                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>

                        <div className="form-group">
                            <label>Motif</label>
                            <select className="search-input" value={selectedMotif} onChange={e => setSelectedMotif(e.target.value)}>
                                <option value="">Non renseigné</option>
                                {motifs.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        {!editingDecision ? (
                            <div className="form-group search-wrapper">
                                <label>Rechercher l'élève (par nom)</label>
                                <input type="text" className="search-input" placeholder="Tapez le nom..."
                                    value={searchStudent} onChange={e => handleSearchEleve(e.target.value)} />
                                {searchResults.length > 0 && (
                                    <div className="search-results-dropdown">
                                        {searchResults.map(e => (
                                            <div key={e.id} className="result-item" onClick={() => handleSelectFromSearch(e)}>
                                                <span>{formatNom(e.nom)} {formatPrenom(e.prenom)}</span>
                                                <FiPlusCircle style={{ color: '#28a745' }} />
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button className="btn-export excel-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={handleUpdate}>Enregistrer</button>
                                <button className="btn-export pdf-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setEditingDecision(null); setSearchStudent(''); setSelectedMotif(''); }}>Annuler</button>
                            </div>
                        )}
                    </div>

                    {mode === 'final' && (
                        <div className="card">
                            <h4 style={{ fontSize: '0.85rem', marginBottom: '12px' }}>⚙️ Quotas</h4>
                            <div className="quota-inputs">
                                {DECISIONS_FINALES.map(opt => (
                                    <label key={opt.key} style={{ fontSize: '0.72rem', fontWeight: '600' }}>
                                        {opt.badgeLabel}
                                        <input type="number" className="stat-input" style={{ width: '100%', marginTop: '4px' }}
                                            value={quotas[opt.key]}
                                            onChange={e => setQuotas({ ...quotas, [opt.key]: parseInt(e.target.value) || 0 })} />
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="decision-table-col ranking-card">
                    <div className="ranking-card-header">
                        <h3 style={{ fontSize: '1rem' }}>Décisions — {typeExamen.replace(/_/g, ' ')} ({decisionsExamen.length})</h3>
                    </div>
                    <div className="table-responsive-dashboard decision-table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>N° INC</th><th>NOM COMPLET</th><th>DÉCISION</th><th>MOTIF</th>
                                    <th style={{ textAlign: 'center' }}>ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {decisionsExamen.map(d => (
                                    <tr key={d.id} className="clickable-row" onClick={() => onOpenEleve(d)} title="Cliquer pour voir la fiche élève">
                                        <td><strong>{d.numero_incorporation}</strong></td>
                                        <td>{formatNom(d.nom)} {formatPrenom(d.prenom)}</td>
                                        <td><span className={`status-badge badge-${d.type_decision}`}>{d.type_decision.replace(/_/g, ' ').toUpperCase()}</span></td>
                                        <td>{d.motif || <em style={{ color: '#999' }}>Non renseigné</em>}</td>
                                        <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                            <button className="btn-icon" style={{ color: '#3751FF' }} onClick={() => onOpenEleve(d)} title="Voir la fiche"><FiEye /></button>
                                            <button className="btn-icon edit" onClick={(e) => handleEditClick(e, d)}><FiEdit /></button>
                                            <button className="btn-icon delete" onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}><FiTrash2 /></button>
                                        </td>
                                    </tr>
                                ))}
                                {decisionsExamen.length === 0 && (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', color: '#999', padding: '20px' }}>Aucune décision pour cet examen.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ═══════════════════ Panneau type d'examen — pleine largeur, accordéon ═══════════════════
const ExamenConseilPanel = ({ examen, promotion, headers, statsExamen, decisionsSaved, onDecisionsChanged, quotas, setQuotas, onOpenEleve }) => {
    const isGeneral = examen.nom_modele === 'General';
    const [expanded, setExpanded] = useState(isGeneral);
    const [conclusion, setConclusion] = useState({ date_conseil: '', lieu: '', president: '', texte_conclusion: '' });
    const [pieces, setPieces] = useState([]);
    const [fichier, setFichier] = useState(null);
    const [categorie, setCategorie] = useState('pv_conseil');
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [viewingPiece, setViewingPiece] = useState(null);

    const fetchDetails = useCallback(async () => {
        try {
            const [resConclusions, resPieces] = await Promise.all([
                axios.get(`/api/conseil/conclusions?promotion=${promotion}`, { headers }),
                axios.get(`/api/conseil/pieces-jointes?promotion=${promotion}&type_examen=${examen.nom_modele}&scope=general`, { headers })
            ]);
            const existante = resConclusions.data.find(c => c.type_examen === examen.nom_modele);
            if (existante) {
                setConclusion({
                    date_conseil: existante.date_conseil ? existante.date_conseil.split('T')[0] : '',
                    lieu: existante.lieu || '',
                    president: existante.president || '',
                    texte_conclusion: existante.texte_conclusion || ''
                });
            } else {
                setConclusion({ date_conseil: '', lieu: '', president: '', texte_conclusion: '' });
            }
            setPieces(resPieces.data);
        } catch (e) { }
    }, [promotion, examen.nom_modele, headers]);

    useEffect(() => { if (expanded) fetchDetails(); }, [expanded, fetchDetails, promotion]);

    const handleSaveConclusion = async () => {
        setSaving(true);
        try {
            await axios.put('/api/conseil/conclusions', { promotion, type_examen: examen.nom_modele, ...conclusion }, { headers });
        } catch (e) { alert("Erreur lors de l'enregistrement de la conclusion."); }
        finally { setSaving(false); }
    };

    const handleUpload = async () => {
        if (!fichier) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('fichier', fichier);
            formData.append('promotion', promotion);
            formData.append('type_examen', examen.nom_modele);
            formData.append('categorie', categorie);
            await axios.post('/api/conseil/pieces-jointes', formData, { headers: { ...headers, 'Content-Type': 'multipart/form-data' } });
            setFichier(null);
            fetchDetails();
        } catch (e) {
            alert(e.response?.data?.message || "Erreur lors de l'envoi du fichier.");
        } finally { setUploading(false); }
    };

    const deletePiece = async (id) => {
        if (!window.confirm("Supprimer cette pièce jointe ?")) return;
        try {
            await axios.delete(`/api/conseil/pieces-jointes/${id}`, { headers });
            fetchDetails();
        } catch (e) { alert("Erreur lors de la suppression."); }
    };

    return (
        <div className={`conseil-exam-panel ${isGeneral ? 'is-general' : ''}`}>
            <div className="conseil-exam-panel-header" onClick={() => setExpanded(!expanded)}>
                <div className="conseil-exam-panel-title">
                    <h4>{isGeneral ? '🎓 Fin de Formation (General)' : examen.nom_modele.replace(/_/g, ' ')}</h4>
                    {statsExamen && (
                        <div className="conseil-exam-stats-inline">
                            <span>Moy. <strong>{statsExamen.moyenne}</strong></span>
                            <span>Min <strong>{statsExamen.min}</strong></span>
                            <span>Max <strong>{statsExamen.max}</strong></span>
                            <span>{statsExamen.complets}/{statsExamen.totalEleves} complets</span>
                        </div>
                    )}
                </div>
                <button className="conseil-toggle-icon">{expanded ? <FiChevronUp /> : <FiChevronDown />}</button>
            </div>

            {expanded && (
                <div className="conseil-exam-panel-body">
                    <DecisionPanel
                        mode={isGeneral ? 'final' : 'exam'}
                        typeExamen={examen.nom_modele}
                        promotion={promotion}
                        headers={headers}
                        decisionsSaved={decisionsSaved}
                        onChanged={onDecisionsChanged}
                        quotas={quotas}
                        setQuotas={setQuotas}
                        onOpenEleve={onOpenEleve}
                    />

                    <div className="conseil-exam-expanded">
                        <div className="conseil-exam-expanded-col">
                            <h5>📝 Conclusion du Conseil</h5>
                            <div className="form-group-row">
                                <div className="form-group">
                                    <label>Date du conseil</label>
                                    <input type="date" className="search-input" value={conclusion.date_conseil}
                                        onChange={e => setConclusion({ ...conclusion, date_conseil: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Lieu</label>
                                    <input type="text" className="search-input" value={conclusion.lieu}
                                        onChange={e => setConclusion({ ...conclusion, lieu: e.target.value })} />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Président du conseil</label>
                                <input type="text" className="search-input" value={conclusion.president}
                                    onChange={e => setConclusion({ ...conclusion, president: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Avis / Conclusion des membres</label>
                                <textarea className="search-input" rows={4} value={conclusion.texte_conclusion}
                                    onChange={e => setConclusion({ ...conclusion, texte_conclusion: e.target.value })}
                                    placeholder="Ex: Résultat variant de X à Y sur 20, moyenne générale de Z/20..." />
                            </div>
                            <button className="btn-export excel-btn" onClick={handleSaveConclusion} disabled={saving}>
                                {saving ? 'Enregistrement...' : 'Enregistrer la conclusion'}
                            </button>
                        </div>

                        <div className="conseil-exam-expanded-col">
                            <h5>📎 Pièces jointes (PV, fiches, certificats)</h5>
                            <div className="conseil-upload-row">
                                <select className="search-input" value={categorie} onChange={e => setCategorie(e.target.value)}>
                                    {CATEGORIES_PIECE.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                                <input type="file" onChange={e => setFichier(e.target.files[0])} />
                                <button className="btn-export pdf-btn" onClick={handleUpload} disabled={!fichier || uploading}>
                                    <FiUpload /> {uploading ? 'Envoi...' : 'Envoyer'}
                                </button>
                            </div>
                            {pieces.length === 0 ? (
                                <p className="conseil-empty-text">Aucune pièce jointe pour cet examen.</p>
                            ) : (
                                <ul className="conseil-pieces-list">
                                    {pieces.map(p => (
                                        <li key={p.id} className="piece-item">
                                            <div className="piece-item-info" style={{ cursor: 'pointer' }} onClick={() => setViewingPiece(p)}>
                                                <FiPaperclip />
                                                <div>
                                                    <div className="piece-item-name">{p.nom_fichier}</div>
                                                    <small>{CATEGORIES_PIECE.find(c => c.value === p.categorie)?.label || p.categorie} • {formatTaille(p.taille)}</small>
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
                    </div>
                </div>
            )}

            {viewingPiece && <PieceViewerModal piece={viewingPiece} headers={headers} onClose={() => setViewingPiece(null)} />}
        </div>
    );
};

const ConseilFormation = () => {
    const [decisionsSaved, setDecisionsSaved] = useState([]);
    const [loading, setLoading] = useState(true);
    const [quotas, setQuotas] = useState(() => {
        const saved = localStorage.getItem('conseil_quotas');
        return saved ? JSON.parse(saved) : { ajour3: 10, ajour6: 10, redouble: 10, radiation: 10 };
    });
    const [promotions, setPromotions] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('all');
    const [examensPromotion, setExamensPromotion] = useState([]);
    const [statsParExamen, setStatsParExamen] = useState({});
    const [selectedEleve, setSelectedEleve] = useState(null);

    const token = localStorage.getItem('token');
    const headers = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

    // ✅ Récupère les décisions filtrées par promotion (évite toute fuite entre promotions)
    const fetchDecisions = useCallback(async () => {
        if (!selectedPromotion || selectedPromotion === 'all') { setDecisionsSaved([]); return; }
        try {
            setLoading(true);
            const res = await axios.get(`/api/decisions-conseil?promotion=${selectedPromotion}`, { headers });
            setDecisionsSaved(res.data);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [headers, selectedPromotion]);

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const resPromo = await axios.get('/api/promotions', { headers });
                setPromotions(resPromo.data);
                if (resPromo.data.length > 0) setSelectedPromotion(resPromo.data[0]);
            } catch (e) {}
        };
        fetchInitialData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => { localStorage.setItem('conseil_quotas', JSON.stringify(quotas)); }, [quotas]);

    useEffect(() => {
        if (!selectedPromotion || selectedPromotion === 'all') return;
        fetchDecisions();
        const fetchExamens = async () => {
            try {
                const resExamens = await axios.get(`/api/examens?promotion=${selectedPromotion}`, { headers });
                setExamensPromotion([{ id: 0, nom_modele: 'General' }, ...resExamens.data]);

                const resStats = await axios.get(`/api/dashboard/summary-by-exam-type?promotion=${selectedPromotion}&population=all`, { headers });
                const statsMap = {};
                (resStats.data || []).forEach(s => { statsMap[s.typeExamen] = s.stats; });
                setStatsParExamen(statsMap);
            } catch (e) {}
        };
        fetchExamens();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPromotion, headers]);

    if (loading) return <div className="loader-wrapper"><p className="text">Chargement...</p></div>;

    return (
        <div className="dashboard-redesign-container conseil-page">
            <div className="top-nav-bar">
                <Link to="/dashboard/general" className="back-link">&larr; Retour</Link>
                <h1>Conseil de Formation</h1>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span style={{ backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 'bold', fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px' }}>
                        🎓 Fin de Formation
                    </span>
                    <label style={{ fontWeight: '600' }}>Promotion :</label>
                    <select className="search-input" value={selectedPromotion} onChange={(e) => setSelectedPromotion(e.target.value)}>
                        <option value="all">Sélectionner...</option>
                        {promotions.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            {/* ✅ Panneaux pleine largeur empilés — plus de grille contrainte */}
            {selectedPromotion !== 'all' && examensPromotion.length > 0 && (
                <div className="conseil-exam-panels-list">
                    <h3 style={{ marginBottom: '12px' }}>📋 Conseils par Type d'Examen — {selectedPromotion}</h3>
                    {examensPromotion.map(ex => (
                        <ExamenConseilPanel
                            key={ex.id ?? ex.nom_modele}
                            examen={ex}
                            promotion={selectedPromotion}
                            headers={headers}
                            statsExamen={statsParExamen[ex.nom_modele]}
                            decisionsSaved={decisionsSaved}
                            onDecisionsChanged={fetchDecisions}
                            quotas={quotas}
                            setQuotas={setQuotas}
                            onOpenEleve={setSelectedEleve}
                        />
                    ))}
                </div>
            )}

            {selectedEleve && (
                <ConseilEleveModal
                    decision={selectedEleve}
                    headers={headers}
                    examensDisponibles={examensPromotion}
                    onClose={() => setSelectedEleve(null)}
                />
            )}
        </div>
    );
};

export default ConseilFormation;