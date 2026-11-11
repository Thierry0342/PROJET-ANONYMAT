import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import Counter from './Counter';
import {
    FaCheckCircle,
    FaTimesCircle,
    FaSpinner,
    FaBell,
    FaQuestionCircle,
    FaInfoCircle,
    FaLock
} from 'react-icons/fa';
import Joyride, { STATUS } from 'react-joyride';
import usePaquet from './usePaquet';
import PaquetProgress, { PaquetListe } from './PaquetPanel';
import './NoterCopie.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';
const STATS_VIDES = { participants: 0, deja: 0, manquantes: 0, mesSaisies: 0 };

function NoterCopie() {
    const [matieres, setMatieres] = useState([]);
    const [examTypes, setExamTypes] = useState([]);
    const [selectedMatiereId, setSelectedMatiereId] = useState('');
    const [selectedTypeExamen, setSelectedTypeExamen] = useState('');
    const [selectedMatierePrefix, setSelectedMatierePrefix] = useState('');
    const [codeSuffix, setCodeSuffix] = useState('');
    const [note, setNote] = useState('');
    const [codeValidation, setCodeValidation] = useState({ status: 'idle', message: '' });
    const [submitMessage, setSubmitMessage] = useState('');
    const [isSubmitError, setIsSubmitError] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [mesSaisies, setMesSaisies] = useState([]);
    const [isLoadingModal, setIsLoadingModal] = useState(false);
    const [notification, setNotification] = useState('');
    const [conflictData, setConflictData] = useState(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [reclamations, setReclamations] = useState([]);
    const [isReclamationModalOpen, setIsReclamationModalOpen] = useState(false);
    const [isLoadingReclamations, setIsLoadingReclamations] = useState(false);
    const [selectedReclamation, setSelectedReclamation] = useState(null);
    const [selectedReclamationDetails, setSelectedReclamationDetails] = useState(null);
    const [nouvelleNoteCorrection, setNouvelleNoteCorrection] = useState('');
    const [isMilestoneModalOpen, setIsMilestoneModalOpen] = useState(false);
    const [milestoneCount, setMilestoneCount] = useState(0);
    const [milestoneMessage, setMilestoneMessage] = useState({ title: '', body: '' });
    const [runTour, setRunTour] = useState(false);
    const [assignment, setAssignment] = useState(null);

    // ── Sélecteurs cascadés (mode libre / admin) ──────────────────────────────
    const [promotionsList, setPromotionsList] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('');
    const [filteredExamTypes, setFilteredExamTypes] = useState([]);
    const [filteredMatieres, setFilteredMatieres] = useState([]);
    const [isMatiereLoading, setIsMatiereLoading] = useState(false);

    // ── Compteurs (promotion / examen / matière / utilisateur) + paquet ──────
    const [stats, setStats] = useState(STATS_VIDES);
    const paquetCtl = usePaquet('note');
    const paquet = paquetCtl.paquet;

    const promotionCtx = assignment ? (assignment.promotion || '') : selectedPromotion;
    const populationCtx = assignment ? (assignment.population || '') : '';
    const contexteOk = !!paquet
        && String(paquet.matiere_id) === String(selectedMatiereId)
        && paquet.type_examen === selectedTypeExamen;
    const paquetPret = contexteOk && !paquetCtl.complet;

    const noteInputRef = useRef(null);
    const codeInputRef = useRef(null);
    const submitButtonRef = useRef(null);

    const tourSteps = [
        { target: '.compteurs-grid', content: "Bienvenue ! Ces compteurs affichent les notes restantes pour la matière sélectionnée, celles déjà saisies, et le total de vos propres saisies.", placement: 'bottom' },
        { target: '.vos-saisies-box', content: "Cliquez ici pour voir la liste de vos 100 dernières saisies de notes.", placement: 'top' },
        { target: '.noter-copie-form', content: "Ce formulaire est votre principal outil.", placement: 'top' },
        { target: '#matiere-select', content: "Commencez par choisir la matière.", placement: 'bottom' },
        { target: '#code-input', content: "Entrez les chiffres du code anonyme ici.", placement: 'bottom' },
        { target: '#note-input', content: "Saisissez la note de la copie.", placement: 'top' },
        { target: '.btn-submit-note', content: "Cliquez ici pour enregistrer la note.", placement: 'top' },
    ];

    const getPopulationLabel = (pop) => {
        switch (pop) {
            case 'actif': return 'Liste Originale (Élèves Actifs)';
            case 'conseil': return 'Liste Conseil (Redoublants / Ajournés)';
            default: return 'Tous les élèves';
        }
    };

    const handleJoyrideCallback = (data) => {
        const { status } = data;
        if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
            setRunTour(false);
            localStorage.setItem('hasSeenNoterCopieTutorial', 'true');
        }
    };

    useEffect(() => {
        if (!localStorage.getItem('hasSeenNoterCopieTutorial')) {
            setRunTour(true);
        }
    }, []);

    const getAuthHeaders = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    // ── Compteurs par promotion / examen / matière / utilisateur ─────────────
    const fetchStats = useCallback(async () => {
        if (!selectedMatiereId || !selectedTypeExamen) { setStats(STATS_VIDES); return null; }
        try {
            const res = await axios.get(`${API_BASE_URL}/api/stats/saisie-contexte`, {
                ...getAuthHeaders(),
                params: {
                    type: 'note',
                    promotion: promotionCtx,
                    typeExamen: selectedTypeExamen,
                    matiereId: selectedMatiereId,
                    population: populationCtx
                }
            });
            setStats(res.data);
            return res.data;
        } catch (error) { console.error(error); return null; }
    }, [selectedMatiereId, selectedTypeExamen, promotionCtx, populationCtx, getAuthHeaders]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    // ── Chargement initial ────────────────────────────────────────────────────
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const token = localStorage.getItem('token');
                let decodedToken = null;
                if (token) {
                    decodedToken = jwtDecode(token);
                    if (decodedToken.role === 'admin') setIsAdmin(true);
                }
                const [resMatieres, resExams, resPromotions] = await Promise.all([
                    axios.get(`${API_BASE_URL}/api/matieres`, getAuthHeaders()),
                    axios.get(`${API_BASE_URL}/api/examens`, getAuthHeaders()),
                    axios.get(`${API_BASE_URL}/api/promotions`, getAuthHeaders())
                ]);
                setMatieres(resMatieres.data);
                setExamTypes(resExams.data);

                const promoList = resPromotions.data || [];
                setPromotionsList(promoList);

                if (decodedToken && decodedToken.assigned_matiere_id) {
                    // ── Mode opérateur assigné ──
                    const assignedId = decodedToken.assigned_matiere_id;
                    const assignedExam = decodedToken.assigned_type_examen;
                    const assignedPromo = decodedToken.assigned_promotion;
                    const assignedPop = decodedToken.assigned_population || 'all';
                    const matiereObj = resMatieres.data.find(m => m.id === assignedId);
                    setAssignment({
                        matiereNom: matiereObj ? matiereObj.nom_matiere : 'Inconnue',
                        examen: assignedExam,
                        promotion: assignedPromo,
                        population: assignedPop
                    });
                    setSelectedMatiereId(assignedId);
                    setSelectedTypeExamen(assignedExam);
                    if (matiereObj) setSelectedMatierePrefix(matiereObj.code_prefixe.trim().toUpperCase());
                } else {
                    // ── Mode libre (admin) : présélectionner la dernière promo ──
                    if (promoList.length > 0) {
                        setSelectedPromotion(promoList[0]);
                    } else if (resExams.data.length > 0) {
                        setSelectedTypeExamen(resExams.data[0].nom_modele);
                    }
                }
            } catch (error) { console.error(error); }
        };
        fetchInitialData();
    }, [getAuthHeaders]);

    // ── Charger les examens selon la promotion (mode libre) ───────────────────
    useEffect(() => {
        if (assignment) return;
        const fetchExamensByPromo = async () => {
            if (!selectedPromotion) {
                setFilteredExamTypes([]);
                setSelectedTypeExamen('');
                setSelectedMatiereId('');
                setSelectedMatierePrefix('');
                setFilteredMatieres([]);
                return;
            }
            try {
                const res = await axios.get(
                    `${API_BASE_URL}/api/examens?promotion=${selectedPromotion}`,
                    getAuthHeaders()
                );
                setFilteredExamTypes(res.data);
                setSelectedTypeExamen(prev => {
                    const exists = res.data.find(e => e.nom_modele === prev);
                    if (!exists) {
                        setSelectedMatiereId('');
                        setSelectedMatierePrefix('');
                        setFilteredMatieres([]);
                        return '';
                    }
                    return prev;
                });
            } catch {
                setFilteredExamTypes([]);
                setSelectedTypeExamen('');
            }
        };
        fetchExamensByPromo();
    }, [selectedPromotion, assignment, getAuthHeaders]);

    // ── Charger les matières selon l'examen + promo (mode libre) ─────────────
    useEffect(() => {
        if (assignment) return;
        const fetchMatieresByExam = async () => {
            if (!selectedTypeExamen || !selectedPromotion) {
                setFilteredMatieres([]);
                setSelectedMatiereId('');
                setSelectedMatierePrefix('');
                return;
            }
            setIsMatiereLoading(true);
            try {
                const res = await axios.get(
                    `${API_BASE_URL}/api/matieres-par-examen?typeExamen=${selectedTypeExamen}&promotion=${selectedPromotion}`,
                    getAuthHeaders()
                );
                setFilteredMatieres(res.data);
                setSelectedMatiereId(prev => {
                    if (!prev) return prev;
                    const exists = res.data.find(m => m.id === parseInt(prev));
                    if (!exists) { setSelectedMatierePrefix(''); return ''; }
                    return prev;
                });
            } catch {
                setFilteredMatieres([]);
                setSelectedMatiereId('');
                setSelectedMatierePrefix('');
            } finally {
                setIsMatiereLoading(false);
            }
        };
        fetchMatieresByExam();
    }, [selectedTypeExamen, selectedPromotion, assignment, getAuthHeaders]);

    // ── Restauration du contexte d'un paquet en cours (après rafraîchissement) ──
    useEffect(() => {
        const p = paquetCtl.paquet;
        if (!p || assignment || matieres.length === 0) return;
        if (selectedPromotion !== p.promotion) { setSelectedPromotion(p.promotion); return; }
        if (selectedTypeExamen !== p.type_examen) { setSelectedTypeExamen(p.type_examen); return; }
        if (String(selectedMatiereId) !== String(p.matiere_id)) setSelectedMatiereId(String(p.matiere_id));
        const m = matieres.find(x => x.id === p.matiere_id);
        const prefixe = m?.code_prefixe ? m.code_prefixe.trim().toUpperCase() : '';
        if (selectedMatierePrefix !== prefixe) setSelectedMatierePrefix(prefixe);
    }, [paquetCtl.paquet, assignment, matieres, selectedPromotion, selectedTypeExamen, selectedMatiereId, selectedMatierePrefix]);

    const fetchReclamations = useCallback(async () => {
        if (!isAdmin) return;
        setIsLoadingReclamations(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/reclamations`, getAuthHeaders());
            setReclamations(res.data);
        } catch (error) { console.error(error); }
        finally { setIsLoadingReclamations(false); }
    }, [isAdmin, getAuthHeaders]);

    useEffect(() => { fetchReclamations(); }, [fetchReclamations]);

    useEffect(() => {
        if (codeValidation.status === 'valid') noteInputRef.current?.focus();
    }, [codeValidation.status]);

    const resetFields = useCallback((resetMatiere = false) => {
        if (resetMatiere && !assignment) {
            setSelectedMatiereId('');
            setSelectedMatierePrefix('');
        }
        setCodeSuffix(''); setNote(''); setCodeValidation({ status: 'idle', message: '' });
        setSubmitMessage(''); setIsSubmitError(false); setConflictData(null);
        codeInputRef.current?.focus();
    }, [assignment]);

    // ── Changement de matière (mode libre) ───────────────────────────────────
    const handleMatiereChange = (e) => {
        const matiereId = e.target.value;
        const matiereList = assignment ? matieres : filteredMatieres;
        let selectedMatiere = matiereId
            ? matiereList.find(m => m.id.toString() === matiereId)
            : undefined;

        // Repli : la liste filtrée peut ne pas porter le préfixe
        if (matiereId && !selectedMatiere?.code_prefixe) {
            selectedMatiere = matieres.find(m => m.id.toString() === matiereId) || selectedMatiere;
        }

        setSelectedMatiereId(matiereId);
        setSelectedMatierePrefix(
            selectedMatiere?.code_prefixe ? selectedMatiere.code_prefixe.trim().toUpperCase() : ''
        );
        resetFields(false);
    };

    const handleCodeSuffixChange = (e) => {
        const suffix = e.target.value.toUpperCase().replace(/[^0-9]/g, '');
        setCodeSuffix(suffix);
        if (codeValidation.status !== 'idle') setCodeValidation({ status: 'idle', message: '' });
    };

    const verifyCode = useCallback(async () => {
        if (!paquetPret) return;
        if (!codeSuffix.trim() || !selectedMatierePrefix) return;
        if (codeValidation.status === 'checking' || codeValidation.status === 'valid') return;
        const fullCode = `${selectedMatierePrefix}${codeSuffix}`;
        setCodeValidation({ status: 'checking', message: 'Vérification...' });
        try {
            await axios.get(`${API_BASE_URL}/api/codes/verifier/${fullCode}`, getAuthHeaders());
            setCodeValidation({ status: 'valid', message: '' });
        } catch (error) {
            setCodeValidation({ status: 'invalid', message: `Erreur : ${error.response?.data?.message || "Inconnu"}` });
        }
    }, [paquetPret, codeSuffix, selectedMatierePrefix, getAuthHeaders, codeValidation.status]);

    const handleCodeKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); verifyCode(); } };

    const handleNoteKeyDown = (e) => {
        if (e.key === 'Enter' && codeValidation.status === 'valid' && note !== '') {
            e.preventDefault();
            submitButtonRef.current?.click();
        }
    };

    // ── Ajout à la liste d'attente du paquet (pas de validation directe) ─────
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!paquetPret || codeValidation.status !== 'valid' || note === '') return;
        setSubmitMessage(''); setIsSubmitError(false); setConflictData(null);
        const avant = stats.mesSaisies;
        try {
            const fullCode = `${selectedMatierePrefix}${codeSuffix}`;
            await paquetCtl.ajouterLigne({ code_anonyme: fullCode, note });
            setNotification(`Note ajoutée à votre liste d'attente.`);
            setTimeout(() => setNotification(''), 4000);
            resetFields(false);
            const apres = await fetchStats();
            if (apres && apres.mesSaisies > avant && apres.mesSaisies % 100 === 0) {
                setMilestoneMessage({
                    title: 'Félicitations !',
                    body: `Vous venez de franchir un nouveau cap ! (${apres.participants} copies à noter pour cette matière) Continuez comme ça !`
                });
                setMilestoneCount(apres.mesSaisies);
                setIsMilestoneModalOpen(true);
            }
        } catch (error) {
            if (error.response?.status === 409) {
                setConflictData({ code: `${selectedMatierePrefix}${codeSuffix}`, note: note, message: error.response.data.message });
            } else {
                setSubmitMessage(error.response?.data?.message || 'Erreur');
                setIsSubmitError(true);
            }
        }
    };

    const handleSendReclamation = async () => {
        if (!conflictData) return;
        try {
            await axios.post(`${API_BASE_URL}/api/reclamations`, {
                matiere_id: selectedMatiereId,
                code_anonyme: conflictData.code,
                note_proposee: conflictData.note
            }, getAuthHeaders());
            setNotification(`Signalement envoyé.`);
            setTimeout(() => setNotification(''), 5000);
            resetFields(false);
            fetchReclamations();
        } catch (error) { setIsSubmitError(true); }
    };

    const handleOpenMesSaisiesModal = async () => {
        setIsModalOpen(true); setIsLoadingModal(true);
        try {
            const res = await axios.get(`${API_BASE_URL}/api/copies/mes-saisies-notes`, getAuthHeaders());
            setMesSaisies(res.data);
        } catch (error) { console.error(error); }
        finally { setIsLoadingModal(false); }
    };

    const handleFetchDetails = async (reclamation) => {
        setSelectedReclamation(reclamation);
        const matiere = matieres.find(m => m.nom_matiere === reclamation.nom_matiere);
        if (!matiere) return;
        setSelectedReclamationDetails({ isLoading: true });
        try {
            const res = await axios.get(`${API_BASE_URL}/api/reclamations/details/${reclamation.code_anonyme}/${matiere.id}`, getAuthHeaders());
            setSelectedReclamationDetails({ ...res.data, isLoading: false });
            setNouvelleNoteCorrection(reclamation.note_proposee);
        } catch (error) { setSelectedReclamationDetails({ error: "Non trouvé", isLoading: false }); }
    };

    const handleCorrectionSubmit = async (e) => {
        e.preventDefault();
        const matiere = matieres.find(m => m.nom_matiere === selectedReclamation.nom_matiere);
        try {
            await axios.put(`${API_BASE_URL}/api/reclamations/corriger`, {
                reclamationId: selectedReclamation.id,
                code_anonyme: selectedReclamation.code_anonyme,
                matiereId: matiere.id,
                nouvelle_note: nouvelleNoteCorrection
            }, getAuthHeaders());
            setNotification('Corrigé !');
            setSelectedReclamation(null); fetchReclamations();
        } catch (error) { alert("Erreur"); }
    };

    const handleResolveReclamation = async (reclamationId) => {
        try {
            await axios.put(`${API_BASE_URL}/api/reclamations/${reclamationId}/resoudre`, {}, getAuthHeaders());
            fetchReclamations();
        } catch (error) { console.error(error); }
    };

    // ── Sélecteurs cascadés (mode libre / admin) ──────────────────────────────
    const renderFreeSelectors = () => (
        <>
            {/* Promotion */}
            <div className="form-group">
                <label>Promotion</label>
                <select
                    value={selectedPromotion}
                    onChange={e => {
                        setSelectedPromotion(e.target.value);
                        setSelectedTypeExamen('');
                        setSelectedMatiereId('');
                        setSelectedMatierePrefix('');
                        resetFields(false);
                    }}
                    disabled={!!paquet}
                >
                    <option value="">-- Toutes les promotions --</option>
                    {promotionsList.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>

            {/* Type d'examen (filtré par promotion) */}
            <div className="form-group">
                <label>Examen</label>
                <select
                    id="exam-select"
                    value={selectedTypeExamen}
                    onChange={e => {
                        setSelectedTypeExamen(e.target.value);
                        setSelectedMatiereId('');
                        setSelectedMatierePrefix('');
                        resetFields(false);
                    }}
                    disabled={!selectedPromotion || !!paquet}
                    required
                >
                    <option value="">-- Sélectionnez --</option>
                    {(selectedPromotion ? filteredExamTypes : examTypes).map(ex => (
                        <option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>
                    ))}
                </select>
                {selectedPromotion && filteredExamTypes.length === 0 && (
                    <small className="selector-hint selector-hint--warn">
                        Aucun examen configuré pour cette promotion
                    </small>
                )}
            </div>

            {/* Matière (filtrée par examen + promotion) */}
            <div className="form-group">
                <label>Matière</label>
                <select
                    id="matiere-select"
                    value={selectedMatiereId}
                    onChange={handleMatiereChange}
                    disabled={!selectedTypeExamen || isMatiereLoading || !!paquet}
                    required
                >
                    <option value="">-- Sélectionnez --</option>
                    {filteredMatieres.map(m => (
                        <option key={m.id} value={m.id}>{m.nom_matiere}</option>
                    ))}
                </select>
                {isMatiereLoading && <small className="selector-hint">Chargement des matières...</small>}
                {!isMatiereLoading && selectedTypeExamen && filteredMatieres.length === 0 && (
                    <small className="selector-hint selector-hint--warn">
                        Aucune matière configurée pour cet examen / cette promotion
                    </small>
                )}
            </div>
        </>
    );

    return (
        <div className="noter-copie-container">
            <Joyride callback={handleJoyrideCallback} continuous run={runTour} steps={tourSteps} styles={{ options: { zIndex: 10000, primaryColor: '#2c5282' } }} />
            <button className="help-button" onClick={() => setRunTour(true)}><FaQuestionCircle /></button>
            <div className="compteurs-grid">
                <div className="stat-box large"><span className="stat-label">Notes Restantes</span><Counter value={stats.manquantes} places={[1000, 100, 10, 1]} fontSize={56} /></div>
                <div className="stat-box"><span className="stat-label">Notes Déjà Saisies</span><Counter value={stats.deja} places={[1000, 100, 10, 1]} fontSize={48} /></div>
                <div className="stat-box clickable vos-saisies-box" onClick={handleOpenMesSaisiesModal}><span className="stat-label">Vos Saisies (Examen)</span><Counter value={stats.mesSaisies} places={[1000, 100, 10, 1]} fontSize={48} /></div>
                {isAdmin && (<div className="notification-bell" onClick={() => setIsReclamationModalOpen(true)}><FaBell size={32} />{reclamations.length > 0 && (<span className="notification-badge">{reclamations.length}</span>)}</div>)}
            </div>

            <PaquetProgress
                type="note"
                paquetCtl={paquetCtl}
                contexte={{ promotion: promotionCtx, typeExamen: selectedTypeExamen, matiereId: selectedMatiereId }}
                peutDemarrer={!!selectedMatiereId && !!selectedTypeExamen && (!!assignment || !!selectedPromotion)}
                onModifie={fetchStats}
            />

            <div className="card noter-copie-form">
                <form onSubmit={handleSubmit}>
                    <h2>Saisie des Notes</h2>

                    {/* ── Mode opérateur assigné ── */}
                    {assignment ? (
                        <div className={`assignment-info-card pop-${assignment.population}`}>
                            <div className="assignment-header">
                                <span className="assign-title"><FaLock /> Session de saisie sécurisée</span>
                                <span className="status-badge">ACTIF</span>
                            </div>

                            <div className="assignment-horizontal-grid">
                                <div className="assign-field">
                                    <span className="field-label">Matière</span>
                                    <span className="field-value">{assignment.matiereNom}</span>
                                </div>
                                <div className="assign-field">
                                    <span className="field-label">Examen</span>
                                    <span className="field-value">{assignment.examen}</span>
                                </div>
                                <div className="assign-field">
                                    <span className="field-label">Promotion</span>
                                    <span className="field-value">{assignment.promotion || 'Toutes'}</span>
                                </div>
                            </div>

                            <div className="assignment-population-row">
                                <div className="pop-indicator"></div>
                                <div>
                                    <span className="field-label">Population cible</span>
                                    <span className="field-value">{getPopulationLabel(assignment.population)}</span>
                                </div>
                            </div>

                            <div className="assignment-instruction-box">
                                <FaInfoCircle className="info-icon" />
                                <div className="instruction-text">
                                    Toutes les informations de votre session sont pré-configurées ci-dessus.
                                    Il ne vous reste qu'à saisir le <strong>Code Anonyme</strong> et la <strong>Note</strong>.
                                    <p className="warning-text">
                                        <em>Vérifiez attentivement chaque saisie. En cas d'anomalie ou d'erreur, utilisez le bouton "Signaler incident" pour avertir l'administrateur.</em>
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ── Mode libre : sélecteurs cascadés ── */
                        <div className="free-selectors-box">
                            {renderFreeSelectors()}
                        </div>
                    )}

                    {!paquetPret && (
                        <div className="paquet-locked-hint">
                            {!paquet
                                ? "Démarrez un comptage de paquet pour pouvoir saisir."
                                : contexteOk
                                    ? "Paquet complet : envoyez-le en validation pour continuer."
                                    : "Votre paquet en cours concerne une autre matière / un autre examen."}
                        </div>
                    )}

                    {/* ── Champs communs Code + Note ── */}
                    <div className="form-group">
                        <label>Code Anonyme</label>
                        <div className="code-input-wrapper">
                            <span className="code-prefix">{selectedMatierePrefix}</span>
                            <input
                                id="code-input"
                                ref={codeInputRef}
                                type="text"
                                value={codeSuffix}
                                onChange={handleCodeSuffixChange}
                                onBlur={verifyCode}
                                onKeyDown={handleCodeKeyDown}
                                disabled={!selectedMatiereId || !paquetPret}
                                autoComplete="off"
                                required
                            />
                            {selectedMatiereId && !selectedMatierePrefix && (
                                <small style={{ color: '#e53e3e' }}>
                                    Cette matière n'a pas de préfixe de code défini — contactez l'administrateur.
                                </small>
                            )}
                            <div className="val-icon-container">
                                {codeValidation.status === 'checking' ? <FaSpinner className="spinner" /> :
                                    codeValidation.status === 'valid' ? <FaCheckCircle className="valid" /> :
                                        codeValidation.status === 'invalid' ? <FaTimesCircle className="invalid" /> : null}
                            </div>
                        </div>
                    </div>

                    <div className="form-group">
                        <label>Note / 20</label>
                        <input
                            id="note-input"
                            ref={noteInputRef}
                            type="number"
                            step="0.25"
                            min="0"
                            max="20"
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            onKeyDown={handleNoteKeyDown}
                            disabled={!paquetPret || codeValidation.status !== 'valid'}
                            required
                        />
                    </div>

                    <button
                        ref={submitButtonRef}
                        className="btn btn-primary btn-block btn-submit-note"
                        type="submit"
                        disabled={!paquetPret || codeValidation.status !== 'valid' || note === '' || !!conflictData}
                    >
                        Enregistrer
                    </button>
                    {submitMessage && (
                        <div className={`message ${isSubmitError ? 'error' : 'success'}`}>
                            <span>{submitMessage}</span>
                        </div>
                    )}

                    {conflictData && (
                        <div className="message warning">
                            <div>
                                <span><strong>Conflit :</strong> {conflictData.message}</span>
                                <div className="conflict-actions">
                                    <button type="button" className="btn btn-secondary" onClick={() => resetFields(false)}>Erreur de saisie</button>
                                    <button type="button" className="btn btn-danger" onClick={handleSendReclamation}>Signaler incident</button>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="form-notification-container">
                        {notification && (<div className="notif-toast"><FaCheckCircle /> {notification}</div>)}
                    </div>
                </form>
            </div>

            <PaquetListe type="note" paquetCtl={paquetCtl} onModifie={fetchStats} />

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>Mes Saisies</h2>
                        {isLoadingModal ? <p>...</p> : (
                            <table>
                                <thead><tr><th>Matière</th><th>Code</th><th>Note</th></tr></thead>
                                <tbody>{mesSaisies.map(s => (<tr key={s.id}><td>{s.nom_matiere}</td><td>{s.code_anonyme}</td><td>{s.note}</td></tr>))}</tbody>
                            </table>
                        )}
                        <button onClick={() => setIsModalOpen(false)}>Fermer</button>
                    </div>
                </div>
            )}

            {isMilestoneModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h2>{milestoneMessage.title}</h2>
                        <p>{milestoneMessage.body}</p>
                        <p><strong>{milestoneCount}</strong> notes saisies au total.</p>
                        <button className="btn btn-primary" onClick={() => setIsMilestoneModalOpen(false)}>Continuer</button>
                    </div>
                </div>
            )}

            {isReclamationModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content large">
                        <h2>Réclamations</h2>
                        {isLoadingReclamations ? <p>Chargement...</p> : (
                            <>
                                {reclamations.length === 0 && <p>Aucune réclamation en attente.</p>}
                                {reclamations.map(r => (
                                    <div key={r.id} className="reclamation-row">
                                        <span>{r.nom_matiere} — {r.code_anonyme} — Note proposée : {r.note_proposee}</span>
                                        <button onClick={() => handleFetchDetails(r)}>Détails</button>
                                        <button onClick={() => handleResolveReclamation(r.id)}>Marquer résolu</button>
                                    </div>
                                ))}
                            </>
                        )}

                        {selectedReclamation && selectedReclamationDetails && (
                            <div className="reclamation-details">
                                <h3>Détails — {selectedReclamation.code_anonyme}</h3>
                                {selectedReclamationDetails.isLoading ? <p>Chargement des détails...</p> :
                                    selectedReclamationDetails.error ? <p>{selectedReclamationDetails.error}</p> : (
                                        <>
                                            <p>Note originale : {selectedReclamationDetails.note_originale}</p>
                                            <p>Saisie par : {selectedReclamationDetails.nom_utilisateur}</p>
                                            <form onSubmit={handleCorrectionSubmit}>
                                                <label>Nouvelle note</label>
                                                <input
                                                    type="number" min="0" max="20" step="0.25"
                                                    value={nouvelleNoteCorrection}
                                                    onChange={e => setNouvelleNoteCorrection(e.target.value)}
                                                    required
                                                />
                                                <button type="submit" className="btn btn-primary">Corriger</button>
                                            </form>
                                        </>
                                    )}
                            </div>
                        )}

                        <button onClick={() => { setIsReclamationModalOpen(false); setSelectedReclamation(null); setSelectedReclamationDetails(null); }}>
                            Fermer
                        </button>
                    </div>
                </div>
            )}

            <style jsx>{`
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
                .selector-hint--warn {
                    color: #e53e3e;
                }
            `}</style>
        </div>
    );
}

export default NoterCopie;