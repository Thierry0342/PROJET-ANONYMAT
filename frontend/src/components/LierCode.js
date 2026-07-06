import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import Counter from './Counter';
import {
    FaCheckCircle,
    FaExclamationTriangle,
    FaPencilAlt,
    FaTrash,
    FaSave,
    FaTimes,
    FaQuestionCircle,
    FaLock,
    FaInfoCircle,
    FaUsers
} from 'react-icons/fa';
import FizzyButton from './FizzyButton';
import './LierCode.css';
import './NoterCopie.css';
import Joyride, { STATUS } from 'react-joyride';
import Toast from './Toast';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

function LierCode() {
    const [statsTotal, setStatsTotal]           = useState(0);
    const [statsParMatiere, setStatsParMatiere] = useState(0);
    const [statsUtilisateur, setStatsUtilisateur] = useState(0);
    const [matieres, setMatieres]               = useState([]);
    const [examens, setExamens]                 = useState([]);
    const [selectedExamen, setSelectedExamen]   = useState('');
    const [rechercheEleve, setRechercheEleve]   = useState('');
    const [elevesTrouves, setElevesTrouves]     = useState([]);
    const [selectedMatiere, setSelectedMatiere] = useState('');
    const [selectedEleve, setSelectedEleve]     = useState(null);
    const [codePrefix, setCodePrefix]           = useState('');
    const [codeSuffix, setCodeSuffix]           = useState('');
    const [message, setMessage]                 = useState('');
    const [isError, setIsError]                 = useState(false);
    const [isLoading, setIsLoading]             = useState(false);
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [isModalOpen, setIsModalOpen]         = useState(false);
    const [mesLiages, setMesLiages]             = useState([]);
    const [isLoadingModal, setIsLoadingModal]   = useState(false);
    const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
    const [milestoneCount, setMilestoneCount]   = useState(0);
    const [runTour, setRunTour]                 = useState(false);
    const [toast]                               = useState({ show: false, message: '' });
    const [assignment, setAssignment]           = useState(null);

    // ── Sélecteurs cascadés (mode libre) ─────────────────────────────────────
    const [promotionsList, setPromotionsList]       = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('');
    const [filteredExamens, setFilteredExamens]     = useState([]);
    const [filteredMatieres, setFilteredMatieres]   = useState([]);
    const [loadingExam, setLoadingExam]             = useState(false);
    const [loadingMat, setLoadingMat]               = useState(false);

    const rechercheEleveInputRef = useRef(null);
    const codeInputRef           = useRef(null);
    const prevStatsUtilisateur   = useRef(0);

    const tourSteps = [
        { target: '.compteurs-grid',   content: "Bienvenue !",              placement: 'bottom' },
        { target: '.lier-code-form',   content: "Liez un élève à son code.", placement: 'top'    },
        { target: '#recherche_field',  content: "Cherchez l'élève.",         placement: 'bottom' },
        { target: '.code-input-wrapper', content: "Saisissez le code.",      placement: 'bottom' },
    ];

    const getPopulationLabel = (pop) => {
        switch (pop) {
            case 'actif':   return 'LISTE ORIGINALE (Élèves Actifs)';
            case 'conseil': return 'LISTE CONSEIL (Ajournés & Redoublants)';
            default:        return 'TOUTE LA PROMOTION (Mixte)';
        }
    };

    const handleJoyrideCallback = (data) => {
        const { status } = data;
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            setRunTour(false);
            localStorage.setItem('hasSeenLierCodeTutorial', 'true');
        }
    };

    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    const fetchAllStats = useCallback(async (currentMatiereId, currentExamen) => {
        try {
            let urlStatsUser = `${API_BASE_URL}/api/stats/liaisons-utilisateur`;
            const params = [];
            if (currentMatiereId) params.push(`matiere_id=${currentMatiereId}`);
            if (currentExamen)    params.push(`type_examen=${encodeURIComponent(currentExamen)}`);
            if (params.length > 0) urlStatsUser += `?${params.join('&')}`;

            const [resTotal, resUser] = await Promise.all([
                axios.get(`${API_BASE_URL}/api/stats/non-lies-total`, getAuthHeaders()),
                axios.get(urlStatsUser, getAuthHeaders())
            ]);
            setStatsTotal(resTotal.data.totalRestant);
            setStatsUtilisateur(resUser.data.liaisonsCreees);

            if (currentMatiereId) {
                let url = `${API_BASE_URL}/api/matieres/${currentMatiereId}/eleves-restants`;
                if (currentExamen) url += `?type_examen=${encodeURIComponent(currentExamen)}`;
                const resMatiere = await axios.get(url, getAuthHeaders());
                setStatsParMatiere(resMatiere.data.restants);
            } else {
                setStatsParMatiere(0);
            }
        } catch (error) { console.error(error); }
    }, [getAuthHeaders]);

    // ── Chargement initial ────────────────────────────────────────────────────
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;
                const decoded = jwtDecode(token);

                const [resMatieres, resExamens, resPromotions] = await Promise.all([
                    axios.get(`${API_BASE_URL}/api/matieres`,    getAuthHeaders()),
                    axios.get(`${API_BASE_URL}/api/examens`,     getAuthHeaders()),
                    axios.get(`${API_BASE_URL}/api/promotions`,  getAuthHeaders())
                ]);

                setMatieres(resMatieres.data);
                setExamens(resExamens.data);

                const promoList = resPromotions.data || [];
                setPromotionsList(promoList);

                if (decoded && decoded.assigned_matiere_id) {
                    // ── Mode opérateur assigné ──
                    const assignedId   = decoded.assigned_matiere_id;
                    const assignedExam = decoded.assigned_type_examen;
                    const assignedPromo = decoded.assigned_promotion;
                    const assignedPop  = decoded.assigned_population || 'all';
                    const matiereObj   = resMatieres.data.find(m => m.id === assignedId);

                    setAssignment({
                        matiereNom: matiereObj ? matiereObj.nom_matiere : 'Inconnue',
                        examen: assignedExam,
                        promotion: assignedPromo,
                        population: assignedPop
                    });

                    setSelectedMatiere(assignedId);
                    setSelectedExamen(assignedExam);
                    if (matiereObj?.code_prefixe)
                        setCodePrefix(matiereObj.code_prefixe.trim().toUpperCase());
                    fetchAllStats(assignedId, assignedExam);
                } else {
                    // ── Mode libre : présélectionner la dernière promo ──
                    if (promoList.length > 0) setSelectedPromotion(promoList[0]);
                    fetchAllStats(null, null);
                }
            } catch (error) { console.error(error); }
        };
        fetchInitialData();
    }, [fetchAllStats, getAuthHeaders]);

    // ── Charger les examens selon la promotion (mode libre) ───────────────────
    useEffect(() => {
        if (assignment) return;
        if (!selectedPromotion) {
            setFilteredExamens([]);
            setSelectedExamen('');
            setSelectedMatiere('');
            setCodePrefix('');
            setFilteredMatieres([]);
            return;
        }
        setLoadingExam(true);
        axios.get(`${API_BASE_URL}/api/examens?promotion=${selectedPromotion}`, getAuthHeaders())
            .then(res => {
                setFilteredExamens(res.data);
                setSelectedExamen(prev => {
                    const exists = res.data.find(e => e.nom_modele === prev);
                    if (!exists) {
                        setSelectedMatiere('');
                        setCodePrefix('');
                        setFilteredMatieres([]);
                        return '';
                    }
                    return prev;
                });
            })
            .catch(() => { setFilteredExamens([]); setSelectedExamen(''); })
            .finally(() => setLoadingExam(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedPromotion, assignment]);

    // ── Charger les matières selon l'examen + promotion (mode libre) ──────────
    useEffect(() => {
        if (assignment) return;
        if (!selectedExamen || !selectedPromotion) {
            setFilteredMatieres([]);
            setSelectedMatiere('');
            setCodePrefix('');
            return;
        }
        setLoadingMat(true);
        axios.get(
            `${API_BASE_URL}/api/matieres-par-examen?typeExamen=${selectedExamen}&promotion=${selectedPromotion}`,
            getAuthHeaders()
        )
            .then(res => {
                setFilteredMatieres(res.data);
                setSelectedMatiere(prev => {
                    if (!prev) return prev;
                    const exists = res.data.find(m => m.id.toString() === prev.toString());
                    if (!exists) { setCodePrefix(''); return ''; }
                    return prev;
                });
            })
            .catch(() => { setFilteredMatieres([]); setSelectedMatiere(''); setCodePrefix(''); })
            .finally(() => setLoadingMat(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedExamen, selectedPromotion, assignment]);

    useEffect(() => {
        const isMilestone  = statsUtilisateur > 0 && statsUtilisateur % 100 === 0;
        const hasIncreased = statsUtilisateur > prevStatsUtilisateur.current;
        if (isMilestone && hasIncreased) {
            setMilestoneCount(statsUtilisateur);
            setIsMilestoneModalOpen(true);
        }
        prevStatsUtilisateur.current = statsUtilisateur;
    }, [statsUtilisateur]);

    const formatNomEleve = useCallback((eleve) => {
        if (!eleve) return '';
        return `${eleve.numero_incorporation || 'N/A'}-${eleve.nom ? eleve.nom.toUpperCase() : ''} ${eleve.prenom || ''} (${eleve.escadron || '?'}/${eleve.peloton || '?'})`;
    }, []);

    const handleSelectEleve = useCallback((eleve) => {
        setSelectedEleve(eleve);
        setRechercheEleve(formatNomEleve(eleve));
        setElevesTrouves([]);
        setIsSearchFocused(false);
        codeInputRef.current?.focus();
    }, [formatNomEleve]);

    useEffect(() => {
        const chercher = async () => {
            if (rechercheEleve.trim() === '' || (selectedEleve && formatNomEleve(selectedEleve) === rechercheEleve)) {
                setElevesTrouves([]); return;
            }
            try {
                let url = `${API_BASE_URL}/api/eleves/recherche?q=${encodeURIComponent(rechercheEleve)}`;
                const promo = assignment?.promotion || selectedPromotion;
                const pop   = assignment?.population;
                if (promo) url += `&promotion=${encodeURIComponent(promo)}`;
                if (pop)   url += `&population=${encodeURIComponent(pop)}`;
                const res = await axios.get(url, getAuthHeaders());
                setElevesTrouves(res.data);
            } catch (error) { console.error(error); }
        };
        const debounce = setTimeout(() => chercher(), 300);
        return () => clearTimeout(debounce);
    }, [rechercheEleve, selectedEleve, formatNomEleve, getAuthHeaders, assignment, selectedPromotion]);

    const handleMatiereChange = (e) => {
        const matiereId = e.target.value;
        setSelectedMatiere(matiereId);
        const matiereList   = assignment ? matieres : filteredMatieres;
        const matiereChoisie = matiereId
            ? matiereList.find(m => m.id.toString() === matiereId)
            : undefined;
        setCodePrefix(matiereChoisie?.code_prefixe
            ? matiereChoisie.code_prefixe.trim().toUpperCase()
            : '');
        setCodeSuffix(''); setRechercheEleve(''); setSelectedEleve(null);
        fetchAllStats(matiereId || null, selectedExamen);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const fullCode = `${codePrefix}${codeSuffix}`;
        if (!selectedEleve || !selectedMatiere || !selectedExamen || !codeSuffix.trim()) return;
        setIsLoading(true); setMessage('');
        try {
            const response = await axios.put(`${API_BASE_URL}/api/lier-copie`, {
                eleve_id:     selectedEleve.id,
                matiere_id:   selectedMatiere,
                code_anonyme: fullCode,
                type_examen:  selectedExamen
            }, getAuthHeaders());
            setMessage(response.data.message);
            setIsError(false);
            setCodeSuffix(''); setRechercheEleve(''); setSelectedEleve(null);
            rechercheEleveInputRef.current?.focus();
            fetchAllStats(selectedMatiere, selectedExamen);
        } catch (error) {
            setMessage(error.response?.data?.message || 'Erreur');
            setIsError(true);
        } finally { setIsLoading(false); }
    };

    const handleOpenMesLiagesModal = async () => {
        setIsModalOpen(true); setIsLoadingModal(true);
        try {
            const params = new URLSearchParams();
            if (selectedMatiere) params.append('matiere_id', selectedMatiere);
            if (selectedExamen)  params.append('type_examen', selectedExamen);
            const res = await axios.get(`${API_BASE_URL}/api/copies/mes-liages?${params.toString()}`, getAuthHeaders());
            setMesLiages(res.data);
        } catch (error) { setMesLiages([]); } finally { setIsLoadingModal(false); }
    };

    return (
        <div className="lier-code-container">
            <Toast message={toast.message} show={toast.show} />
            <Joyride callback={handleJoyrideCallback} continuous run={runTour} steps={tourSteps} styles={{ options: { zIndex: 10000, primaryColor: '#2c5282' } }} />
            <button className="help-button" onClick={() => setRunTour(true)}><FaQuestionCircle /></button>

            <div className="compteurs-grid">
                <div className="stat-box large"><span className="stat-label">Total restant</span><Counter value={statsTotal} places={[10000, 1000, 100, 10, 1]} fontSize={56} /></div>
                <div className="stat-box"><span className="stat-label">Restant (Matière)</span><Counter value={statsParMatiere} places={[1000, 100, 10, 1]} fontSize={48} /></div>
                <div className="stat-box clickable" onClick={handleOpenMesLiagesModal}><span className="stat-label">Vos liages</span><Counter value={statsUtilisateur} places={[1000, 100, 10, 1]} fontSize={48} /></div>
            </div>

            <div className="card lier-code-form">
                <form onSubmit={handleSubmit}>
                    <h2>Lier une copie anonyme</h2>

                    {/* ── Mode opérateur assigné ── */}
                    {assignment ? (
                        <div className={`assignment-info-card pop-${assignment.population}`}>
                            <div className="assignment-header">
                                <span className="assign-title"><FaLock /> Session sécurisée</span>
                                <span className="assign-badge">CONFIGURATION ACTIVE</span>
                            </div>
                            <div className="assignment-details-row">
                                <div className="assign-field"><strong>Matière :</strong> {assignment.matiereNom}</div>
                                <div className="assign-field"><strong>Examen :</strong> {assignment.examen}</div>
                                <div className="assign-field"><strong>Promotion :</strong> {assignment.promotion || 'Toutes'}</div>
                                <div className="assign-field population-highlight">
                                    <strong><FaUsers /> Population :</strong> {getPopulationLabel(assignment.population)}
                                </div>
                            </div>
                            <div className="assignment-instruction">
                                <FaInfoCircle /> {assignment.population === 'all'
                                    ? "Liaison autorisée pour tous les élèves."
                                    : `Saisie restreinte : ${getPopulationLabel(assignment.population)}.`}
                            </div>
                        </div>
                    ) : (
                        /* ── Mode libre : cascade Promotion → Examen → Matière ── */
                        <div className="free-selectors-box">

                            {/* 1. Promotion */}
                            <div className="form-group">
                                <label>Promotion</label>
                                <select
                                    value={selectedPromotion}
                                    onChange={e => {
                                        setSelectedPromotion(e.target.value);
                                        setSelectedExamen('');
                                        setSelectedMatiere('');
                                        setCodePrefix('');
                                        setCodeSuffix('');
                                        setRechercheEleve('');
                                        setSelectedEleve(null);
                                    }}
                                >
                                    <option value="">-- Choisir --</option>
                                    {promotionsList.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>

                            {/* 2. Type d'examen (filtré par promotion) */}
                            <div className="form-group">
                                <label>Type d'examen</label>
                                <select
                                    value={selectedExamen}
                                    onChange={e => {
                                        setSelectedExamen(e.target.value);
                                        setSelectedMatiere('');
                                        setCodePrefix('');
                                        setCodeSuffix('');
                                        setRechercheEleve('');
                                        setSelectedEleve(null);
                                    }}
                                    disabled={!selectedPromotion || loadingExam}
                                    required
                                >
                                    <option value="">-- Choisir --</option>
                                    {filteredExamens.map(ex => (
                                        <option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>
                                    ))}
                                </select>
                                {loadingExam && <small className="selector-hint">Chargement...</small>}
                                {!loadingExam && selectedPromotion && filteredExamens.length === 0 && (
                                    <small className="selector-hint selector-hint--warn">Aucun examen pour cette promotion</small>
                                )}
                            </div>

                            {/* 3. Matière (filtrée par examen + promotion) */}
                            <div className="form-group">
                                <label>Matière</label>
                                <select
                                    value={selectedMatiere}
                                    onChange={handleMatiereChange}
                                    disabled={!selectedExamen || loadingMat}
                                    required
                                >
                                    <option value="">-- Choisir --</option>
                                    {filteredMatieres.map(m => (
                                        <option key={m.id} value={m.id}>{m.nom_matiere}</option>
                                    ))}
                                </select>
                                {loadingMat && <small className="selector-hint">Chargement...</small>}
                                {!loadingMat && selectedExamen && filteredMatieres.length === 0 && (
                                    <small className="selector-hint selector-hint--warn">Aucune matière pour cet examen / cette promotion</small>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Recherche élève ── */}
                    <div className="form-group search-container">
                        <label>Rechercher un élève</label>
                        <input
                            id="recherche_field"
                            ref={rechercheEleveInputRef}
                            type="text"
                            value={rechercheEleve}
                            onChange={e => { setRechercheEleve(e.target.value); setSelectedEleve(null); }}
                            onFocus={() => setIsSearchFocused(true)}
                            onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                            placeholder="Nom ou N° Incorp..."
                            autoComplete="off"
                            required
                        />
                        {isSearchFocused && elevesTrouves.length > 0 && (
                            <div className="search-results">
                                {elevesTrouves.map(eleve => (
                                    <div key={eleve.id} className="search-result-item" onMouseDown={() => handleSelectEleve(eleve)}>
                                        {formatNomEleve(eleve)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ── Code anonyme ── */}
                    <div className="form-group">
                        <label>Code Anonyme</label>
                        <div className="code-input-wrapper">
                            <span className="code-prefix">{codePrefix}</span>
                            <input
                                ref={codeInputRef}
                                type="text"
                                value={codeSuffix}
                                onChange={e => setCodeSuffix(e.target.value.toUpperCase().replace(/[^0-9]/g, ''))}
                                placeholder="Chiffres"
                                required
                                disabled={!selectedMatiere}
                                autoComplete="off"
                            />
                        </div>
                    </div>

                    <button
                        className="btn btn-primary btn-block"
                        type="submit"
                        disabled={isLoading || !selectedEleve || !codeSuffix}
                    >
                        {isLoading ? "CHARGEMENT..." : "LIER LE CODE"}
                    </button>

                    {message && (
                        <div className={`message ${isError ? 'error' : 'success'}`}>
                            <span>{message}</span>
                        </div>
                    )}
                </form>
            </div>

            {/* ── Modal mes liages ── */}
            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content large">
                        <button className="modal-close" onClick={() => setIsModalOpen(false)}>&times;</button>
                        <h2>Mes Derniers Liages</h2>
                        {isLoadingModal ? <p>Chargement...</p> : (
                            <div className="modal-table-container">
                                <table>
                                    <thead>
                                        <tr><th>Matière</th><th>Code</th><th>Élève</th></tr>
                                    </thead>
                                    <tbody>
                                        {mesLiages.map(liage => (
                                            <tr key={liage.id}>
                                                <td>{liage.nom_matiere}</td>
                                                <td>{liage.code_anonyme}</td>
                                                <td>{liage.numero_incorporation} - {liage.nom.toUpperCase()} {liage.prenom}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <style jsx>{`
                /* ── Sélecteurs libres ── */
                .free-selectors-box {
                    background: #f7fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 10px;
                    padding: 16px 18px;
                    margin-bottom: 20px;
                }
                .selector-hint {
                    display: block;
                    font-size: 0.75rem;
                    color: #718096;
                    margin-top: 3px;
                }
                .selector-hint--warn { color: #e53e3e; }

                /* ── Card assignation ── */
                .assignment-info-card { padding: 20px; border-radius: 12px; margin-bottom: 25px; border-left: 6px solid #cbd5e0; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
                .assignment-info-card.pop-actif   { border-left-color: #48bb78; background: #f0fff4; }
                .assignment-info-card.pop-conseil { border-left-color: #ed8936; background: #fffaf0; }
                .assignment-info-card.pop-all     { border-left-color: #4299e1; background: #ebf8ff; }
                .assignment-header { display: flex; justify-content: space-between; margin-bottom: 15px; }
                .assignment-details-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
                .population-highlight { grid-column: span 2; background: white; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; font-weight: bold; color: #2d3748; }
                .assignment-instruction { font-size: 0.85rem; color: #4a5568; margin-top: 15px; display: flex; align-items: center; gap: 8px; }

                /* ── Recherche ── */
                .search-results { position: absolute; background: white; border: 1px solid #e2e8f0; width: 100%; z-index: 100; max-height: 200px; overflow-y: auto; border-radius: 0 0 8px 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); }
                .search-result-item { padding: 12px; cursor: pointer; border-bottom: 1px solid #f7fafc; font-size: 0.9rem; }
                .search-result-item:hover { background: #edf2f7; color: #2b6cb0; }
            `}</style>
        </div>
    );
}

export default LierCode;
