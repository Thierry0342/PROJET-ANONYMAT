import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { jwtDecode } from "jwt-decode";
import Counter from './Counter';
import FizzyButton from './FizzyButton';
import {
    FaCheckCircle,
    FaExclamationTriangle,
    FaTimesCircle,
    FaSpinner,
    FaBell,
    FaPencilAlt,
    FaQuestionCircle,
    FaInfoCircle,
    FaLock
} from 'react-icons/fa';
import Joyride, { STATUS } from 'react-joyride';
import './NoterCopie.css';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

function NoterCopie() {
    const [statsMatiere, setStatsMatiere] = useState({ totalInscrits: 0, notesManquantes: 0 });
    const [statsUtilisateur, setStatsUtilisateur] = useState(0);
    const [statsUtilisateurSpecifique, setStatsUtilisateurSpecifique] = useState(0);
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
    const [isPacketMode, setIsPacketMode] = useState(false);
    const [packetTotal, setPacketTotal] = useState(0);
    const [packetCurrentCount, setPacketCurrentCount] = useState(0);
    const [assignment, setAssignment] = useState(null);

    // ── Sélecteurs cascadés (mode libre / admin) ──────────────────────────────
    const [promotionsList, setPromotionsList] = useState([]);
    const [selectedPromotion, setSelectedPromotion] = useState('');
    const [filteredExamTypes, setFilteredExamTypes] = useState([]);
    const [filteredMatieres, setFilteredMatieres] = useState([]);
    const [isMatiereLoading, setIsMatiereLoading] = useState(false);

    const noteInputRef = useRef(null);
    const codeInputRef = useRef(null);
    const prevStatsUtilisateur = useRef(statsUtilisateur);
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

    const fetchStats = useCallback(async (matiereId) => {
        try {
            const resUser = await axios.get(`${API_BASE_URL}/api/stats/notes-utilisateur`, getAuthHeaders());
            setStatsUtilisateur(resUser.data.notesSaisies);
            if (matiereId) {
                const resMatiere = await axios.get(`${API_BASE_URL}/api/stats/notation/${matiereId}`, getAuthHeaders());
                setStatsMatiere({ totalInscrits: resMatiere.data.totalEleves, notesManquantes: resMatiere.data.notesManquantes });
            } else {
                setStatsMatiere({ totalInscrits: 0, notesManquantes: 0 });
            }
        } catch (error) { console.error(error); }
    }, [getAuthHeaders]);

    const fetchSpecificUserStats = useCallback(async () => {
        if (selectedMatiereId && selectedTypeExamen) {
            try {
                const res = await axios.get(`${API_BASE_URL}/api/stats/notes-utilisateur-specifique`, {
                    ...getAuthHeaders(),
                    params: { matiereId: selectedMatiereId, typeExamen: selectedTypeExamen }
                });
                setStatsUtilisateurSpecifique(res.data.notesSaisies);
            } catch (error) { setStatsUtilisateurSpecifique(0); }
        } else {
            setStatsUtilisateurSpecifique(0);
        }
    }, [selectedMatiereId, selectedTypeExamen, getAuthHeaders]);

    useEffect(() => { fetchSpecificUserStats(); }, [fetchSpecificUserStats]);

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
                    fetchStats(assignedId);
                } else {
                    // ── Mode libre (admin) : présélectionner la dernière promo ──
                    if (promoList.length > 0) {
                        setSelectedPromotion(promoList[0]);
                    } else if (resExams.data.length > 0) {
                        setSelectedTypeExamen(resExams.data[0].nom_modele);
                    }
                    fetchStats(null);
                }
            } catch (error) { console.error(error); }
        };
        fetchInitialData();
    }, [getAuthHeaders, fetchStats]);

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
        const isMilestone = statsUtilisateur > 0 && statsUtilisateur % 100 === 0;
        const hasIncreased = statsUtilisateur > prevStatsUtilisateur.current;
        if (isMilestone && hasIncreased) {
            const totalNotes = statsMatiere.totalInscrits;
            let message = { title: 'Félicitations !', body: 'Vous venez de franchir un nouveau cap ! Continuez comme ça !' };
            setMilestoneMessage(message);
            setMilestoneCount(statsUtilisateur);
            setIsMilestoneModalOpen(true);
        }
        prevStatsUtilisateur.current = statsUtilisateur;
    }, [statsUtilisateur, statsMatiere.totalInscrits, statsMatiere.notesManquantes]);

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
        const selectedMatiere = matiereId
            ? matiereList.find(m => m.id.toString() === matiereId)
            : undefined;
        setSelectedMatiereId(matiereId);
        setSelectedMatierePrefix(
            selectedMatiere?.code_prefixe
                ? selectedMatiere.code_prefixe.trim().toUpperCase()
                : ''
        );
        resetFields(false);
        fetchStats(matiereId || null);
    };

    const handleCodeSuffixChange = (e) => {
        const suffix = e.target.value.toUpperCase().replace(/[^0-9]/g, '');
        setCodeSuffix(suffix);
        if (codeValidation.status !== 'idle') setCodeValidation({ status: 'idle', message: '' });
    };

    const verifyCode = useCallback(async () => {
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
    }, [codeSuffix, selectedMatierePrefix, getAuthHeaders, codeValidation.status]);

    const handleCodeKeyDown = (e) => { if (e.key === 'Enter') { e.preventDefault(); verifyCode(); } };

    const handleNoteKeyDown = (e) => {
        if (e.key === 'Enter' && codeValidation.status === 'valid' && note !== '') {
            e.preventDefault();
            submitButtonRef.current?.click();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (codeValidation.status !== 'valid' || note === '') return;
        setSubmitMessage(''); setIsSubmitError(false); setConflictData(null);
        try {
            const fullCode = `${selectedMatierePrefix}${codeSuffix}`;
            await axios.post(`${API_BASE_URL}/api/noter-copie-anonyme`, {
                matiere_id: selectedMatiereId,
                code_anonyme: fullCode,
                note: note,
                type_examen: selectedTypeExamen
            }, getAuthHeaders());
            if (isPacketMode) {
                const newCount = packetCurrentCount + 1;
                setPacketCurrentCount(newCount);
                if (newCount >= packetTotal) {
                    alert(`Paquet terminé !`);
                    setIsPacketMode(false); setPacketTotal(0); setPacketCurrentCount(0);
                }
            }
            setNotification(`Note enregistrée !`);
            setTimeout(() => setNotification(''), 4000);
            resetFields(false);
            fetchStats(selectedMatiereId);
            fetchSpecificUserStats();
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

    const handleStartPacket = () => {
        const total = window.prompt("Nombre de copies ?", "50");
        if (total && !isNaN(total)) { setPacketTotal(parseInt(total)); setPacketCurrentCount(0); setIsPacketMode(true); }
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
                    disabled={!selectedPromotion}
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
                    disabled={!selectedTypeExamen || isMatiereLoading}
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
                <div className="stat-box large"><span className="stat-label">Notes Restantes</span><Counter value={statsMatiere.notesManquantes} places={[1000, 100, 10, 1]} fontSize={56} /></div>
                <div className="stat-box"><span className="stat-label">Notes Déjà Saisies</span><Counter value={statsMatiere.totalInscrits - statsMatiere.notesManquantes} places={[1000, 100, 10, 1]} fontSize={48} /></div>
                <div className="stat-box clickable vos-saisies-box" onClick={handleOpenMesSaisiesModal}><span className="stat-label">Vos Saisies (Examen)</span><Counter value={statsUtilisateurSpecifique} places={[1000, 100, 10, 1]} fontSize={48} /></div>
                {isAdmin && (<div className="notification-bell" onClick={() => setIsReclamationModalOpen(true)}><FaBell size={32} />{reclamations.length > 0 && (<span className="notification-badge">{reclamations.length}</span>)}</div>)}
            </div>

            <div className="card packet-verifier-card">
                {!isPacketMode ? (
                    <button className="btn btn-secondary" onClick={handleStartPacket} disabled={!selectedMatiereId}>Démarrer comptage paquet</button>
                ) : (
                    <div className="packet-progress"><h3>Paquet en cours</h3><div className="packet-counter"><span>{packetCurrentCount}</span> / {packetTotal}</div><button className="btn btn-danger-outline" onClick={() => setIsPacketMode(false)}>Annuler</button></div>
                )}
            </div>

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
                                disabled={!selectedMatiereId}
                                autoComplete="off"
                                required
                            />
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
                            disabled={codeValidation.status !== 'valid'}
                            required
                        />
                    </div>

                    <button
                        ref={submitButtonRef}
                        className="btn btn-primary btn-block btn-submit-note"
                        type="submit"
                        disabled={codeValidation.status !== 'valid' || note === '' || !!conflictData}
                    >
                        Enregistrer
                    </button>

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

            {isReclamationModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content large">
                        <h2>Réclamations</h2>
                        {reclamations.map(r => (
                            <div key={r.id}>{r.code_anonyme} - {r.note_proposee} <button onClick={() => handleFetchDetails(r)}>Détails</button></div>
                        ))}
                        <button onClick={() => setIsReclamationModalOpen(false)}>Fermer</button>
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
