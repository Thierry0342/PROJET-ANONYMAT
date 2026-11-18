import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import Counter from './Counter';
import { FaQuestionCircle, FaLock, FaInfoCircle, FaUsers, FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import usePaquet from './usePaquet';
import PaquetProgress, { PaquetListe } from './PaquetPanel';
import './LierCode.css';
import './NoterCopie.css';
import Joyride, { STATUS } from 'react-joyride';
import Toast from './Toast';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const STATS_VIDES = { participants: 0, deja: 0, manquantes: 0, mesSaisies: 0 };
const VALIDATION_IDLE = { status: 'idle', message: '' };

function LierCode() {
    const [statsTotal, setStatsTotal]           = useState(0);
    const [stats, setStats]                     = useState(STATS_VIDES);
    const [matieres, setMatieres]               = useState([]);
    const [examens, setExamens]                 = useState([]);
    const [selectedExamen, setSelectedExamen]   = useState('');
    const [rechercheEleve, setRechercheEleve]   = useState('');
    const [elevesTrouves, setElevesTrouves]     = useState([]);
    const [selectedMatiere, setSelectedMatiere] = useState('');
    const [selectedEleve, setSelectedEleve]     = useState(null);
    const [codePrefix, setCodePrefix]           = useState('');
    const [codeSuffix, setCodeSuffix]           = useState('');
    const [codeValidation, setCodeValidation]   = useState(VALIDATION_IDLE);
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

    // ── Paquet / liste d'attente ─────────────────────────────────────────────
    const paquetCtl = usePaquet('liaison');
    const paquet = paquetCtl.paquet;

    const promotionCtx  = assignment ? (assignment.promotion || '') : selectedPromotion;
    const populationCtx = assignment ? (assignment.population || '') : '';
    const contexteOk = !!paquet
        && String(paquet.matiere_id) === String(selectedMatiere)
        && paquet.type_examen === selectedExamen;
    const paquetPret = contexteOk && !paquetCtl.complet;

    const rechercheEleveInputRef = useRef(null);
    const codeInputRef           = useRef(null);

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

    // ── Compteurs : total global + contexte promotion/examen/matière/utilisateur ──
    const fetchAllStats = useCallback(async () => {
        try {
            const resTotal = await axios.get(`${API_BASE_URL}/api/stats/non-lies-total`, getAuthHeaders());
            setStatsTotal(resTotal.data.totalRestant);

            if (!selectedMatiere || !selectedExamen) {
                setStats(STATS_VIDES);
                return null;
            }
            const res = await axios.get(`${API_BASE_URL}/api/stats/saisie-contexte`, {
                ...getAuthHeaders(),
                params: {
                    type: 'liaison',
                    promotion: promotionCtx,
                    typeExamen: selectedExamen,
                    matiereId: selectedMatiere,
                    population: populationCtx
                }
            });
            setStats(res.data);
            return res.data;
        } catch (error) { console.error(error); return null; }
    }, [selectedMatiere, selectedExamen, promotionCtx, populationCtx, getAuthHeaders]);

    useEffect(() => { fetchAllStats(); }, [fetchAllStats]);

    // ── Réinitialiser la validation du code si la matière / le préfixe change ──
    useEffect(() => {
        setCodeValidation(VALIDATION_IDLE);
    }, [selectedMatiere, codePrefix]);

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
                } else {
                    // ── Mode libre : présélectionner la dernière promo ──
                    if (promoList.length > 0) setSelectedPromotion(promoList[0]);
                }
            } catch (error) { console.error(error); }
        };
        fetchInitialData();
    }, [getAuthHeaders]);

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

    // ── Restauration du contexte d'un paquet en cours (après rafraîchissement) ──
    useEffect(() => {
        const p = paquetCtl.paquet;
        if (!p || assignment || matieres.length === 0) return;
        if (selectedPromotion !== p.promotion) { setSelectedPromotion(p.promotion); return; }
        if (selectedExamen !== p.type_examen) { setSelectedExamen(p.type_examen); return; }
        if (String(selectedMatiere) !== String(p.matiere_id)) setSelectedMatiere(String(p.matiere_id));
        const m = matieres.find(x => x.id === p.matiere_id);
        const prefixe = m?.code_prefixe ? m.code_prefixe.trim().toUpperCase() : '';
        if (codePrefix !== prefixe) setCodePrefix(prefixe);
    }, [paquetCtl.paquet, assignment, matieres, selectedPromotion, selectedExamen, selectedMatiere, codePrefix]);

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
        setCodeValidation(VALIDATION_IDLE);
    };

    // ── Vérifie que le code existe dans la base avant de lier ────────────────
    const verifyCode = useCallback(async () => {
        if (!paquetPret || !codeSuffix.trim() || !codePrefix) return;
        if (codeValidation.status === 'checking' || codeValidation.status === 'valid') return;
        const fullCode = `${codePrefix}${codeSuffix}`;
        setCodeValidation({ status: 'checking', message: 'Vérification...' });
        try {
            await axios.get(`${API_BASE_URL}/api/codes/verifier/${fullCode}`, getAuthHeaders());
            setCodeValidation({ status: 'valid', message: '' });
        } catch (error) {
            setCodeValidation({
                status: 'invalid',
                message: error.response?.data?.message || "Ce code n'existe pas dans la base."
            });
        }
    }, [paquetPret, codeSuffix, codePrefix, codeValidation.status, getAuthHeaders]);

    // ── Ajout à la liste d'attente du paquet (pas de validation directe) ─────
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (codeValidation.status !== 'valid') return;
        const fullCode = `${codePrefix}${codeSuffix}`;
        if (!paquetPret || !selectedEleve || !selectedMatiere || !selectedExamen || !codeSuffix.trim()) return;
        setIsLoading(true); setMessage('');
        const avant = stats.mesSaisies;
        try {
            await paquetCtl.ajouterLigne({ eleve_id: selectedEleve.id, code_anonyme: fullCode });
            setMessage("Liaison ajoutée à votre liste d'attente.");
            setIsError(false);
            setCodeSuffix(''); setRechercheEleve(''); setSelectedEleve(null);
            setCodeValidation(VALIDATION_IDLE);
            rechercheEleveInputRef.current?.focus();
            const apres = await fetchAllStats();
            if (apres && apres.mesSaisies > avant && apres.mesSaisies % 100 === 0) {
                setMilestoneCount(apres.mesSaisies);
                setIsMilestoneModalOpen(true);
            }
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
                <div className="stat-box"><span className="stat-label">Restant (Matière)</span><Counter value={stats.manquantes} places={[1000, 100, 10, 1]} fontSize={48} /></div>
                <div className="stat-box clickable" onClick={handleOpenMesLiagesModal}><span className="stat-label">Vos liages</span><Counter value={stats.mesSaisies} places={[1000, 100, 10, 1]} fontSize={48} /></div>
            </div>

            <PaquetProgress
                type="liaison"
                paquetCtl={paquetCtl}
                contexte={{ promotion: promotionCtx, typeExamen: selectedExamen, matiereId: selectedMatiere }}
                peutDemarrer={!!selectedMatiere && !!selectedExamen && (!!assignment || !!selectedPromotion)}
                onModifie={fetchAllStats}
            />

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
                                        setCodeValidation(VALIDATION_IDLE);
                                    }}
                                    disabled={!!paquet}
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
                                        setCodeValidation(VALIDATION_IDLE);
                                    }}
                                    disabled={!selectedPromotion || loadingExam || !!paquet}
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
                                    disabled={!selectedExamen || loadingMat || !!paquet}
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

                    {!paquetPret && (
                        <div className="paquet-locked-hint">
                            {!paquet
                                ? "Démarrez un comptage de paquet pour pouvoir lier."
                                : contexteOk
                                    ? "Paquet complet : envoyez-le en validation pour continuer."
                                    : "Votre paquet en cours concerne une autre matière / un autre examen."}
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
                            disabled={!paquetPret}
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

                    {/* ── Code anonyme (vérifié avant de lier) ── */}
                    <div className="form-group">
                        <label>Code Anonyme</label>
                        <div className="code-input-wrapper">
                            <span className="code-prefix">{codePrefix}</span>
                            <input
                                ref={codeInputRef}
                                type="text"
                                value={codeSuffix}
                                onChange={e => {
                                    setCodeSuffix(e.target.value.toUpperCase().replace(/[^0-9]/g, ''));
                                    if (codeValidation.status !== 'idle') setCodeValidation(VALIDATION_IDLE);
                                }}
                                onBlur={verifyCode}
                                onKeyDown={e => {
                                    // Code déjà valide : Entrée envoie le formulaire.
                                    // Sinon : Entrée déclenche la vérification.
                                    if (e.key === 'Enter' && codeValidation.status !== 'valid') {
                                        e.preventDefault();
                                        verifyCode();
                                    }
                                }}
                                placeholder="Chiffres"
                                required
                                disabled={!selectedMatiere || !paquetPret}
                                autoComplete="off"
                            />
                            <div className="val-icon-container">
                                {codeValidation.status === 'checking' ? <FaSpinner className="spinner" /> :
                                 codeValidation.status === 'valid'    ? <FaCheckCircle className="valid" /> :
                                 codeValidation.status === 'invalid'  ? <FaTimesCircle className="invalid" /> : null}
                            </div>
                        </div>
                        {codeValidation.status === 'invalid' && (
                            <small style={{ color: '#e53e3e' }}>{codeValidation.message}</small>
                        )}
                    </div>

                    <button
                        className="btn btn-primary btn-block"
                        type="submit"
                        disabled={isLoading || !paquetPret || !selectedEleve || !codeSuffix || codeValidation.status !== 'valid'}
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

            <PaquetListe type="liaison" paquetCtl={paquetCtl} onModifie={fetchAllStats} />

            {/* ── Modal félicitations ── */}
            {isMilestoneModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Félicitations !</h2>
                        <p>Vous venez de franchir un nouveau cap ! Continuez comme ça !</p>
                        <p><strong>{milestoneCount}</strong> liaisons au total.</p>
                        <button className="btn btn-primary" onClick={() => setIsMilestoneModalOpen(false)}>Continuer</button>
                    </div>
                </div>
            )}

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

                /* ── Icône de validation du code ── */
                .val-icon-container { display: flex; align-items: center; margin-left: 8px; min-width: 18px; }
                .val-icon-container .valid   { color: #38a169; }
                .val-icon-container .invalid { color: #e53e3e; }
                .val-icon-container .spinner { color: #718096; animation: lier-spin 1s linear infinite; }
                @keyframes lier-spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

export default LierCode;
