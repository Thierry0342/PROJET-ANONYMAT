import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import './StudentDetailsModal.css';
import { EXTERNAL_API_BASE_URL } from '../config/apiConfig';
const DEFAULT_AVATAR_URL = "https://www.w3schools.com/w3images/avatar_hat.jpg";


const formatOrdinal = (n) => {
    if (!n) return '';
    const num = parseInt(n);
    if (num === 1) return `${num}er`;
    return `${num}em`;
};

const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return new Intl.DateTimeFormat('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        }).format(date);
    } catch (e) {
        return dateString;
    }
};

const calculateDaysBetween = (startDate, endDate) => {
    if (!startDate || !endDate) return 0;
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Fonction pour déterminer le chevauchement avec la période d'examen
const getOverlappingDays = (start1, end1, limitStart, limitEnd) => {
    if (!start1 || !limitStart || !limitEnd) return 0;
    const s1 = new Date(start1).getTime();
    const e1 = end1 ? new Date(end1).getTime() : s1;
    const s2 = new Date(limitStart).getTime();
    const e2 = new Date(limitEnd).getTime();

    const maxStart = Math.max(s1, s2);
    const minEnd = Math.min(e1, e2);

    if (maxStart <= minEnd) {
        return Math.ceil((minEnd - maxStart) / (1000 * 60 * 60 * 24)) + 1;
    }
    return 0;
};

const SanctionItem = ({ sanction }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <li className="sanction-item" onClick={() => setIsExpanded(!isExpanded)}>
            <div className="sanction-summary">
                <span><strong>PUNITION : {sanction.taux}</strong></span>
                <span className="sanction-date">{formatDate(sanction.createdAt)}</span>
            </div>
            {isExpanded && (
                <div className="sanction-details">
                    <p><strong>Motif :</strong></p>
                    <p className="sanction-motif-text">{sanction.motif}</p>
                    <p><small>Enregistré le : {formatDate(sanction.createdAt)}</small></p>
                </div>
            )}
        </li>
    );
};
const ObservationItem = ({ obs }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <li className="sanction-item" onClick={() => setIsExpanded(!isExpanded)}>
            <div className="sanction-summary">
                <span><strong>Observation</strong></span>
                <span className="sanction-date">{formatDate(obs.date)}</span>
            </div>
            {isExpanded && (
                <div className="sanction-details">
                    <p className="sanction-motif-text" style={{ whiteSpace: 'pre-wrap' }}>{obs.contenu}</p>
                    {obs.auteur && <p><small>Saisi par : {obs.auteur}</small></p>}
                </div>
            )}
        </li>
    );
};

const ConsultationItem = ({ consult }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // ✅ Si dateArrive est null/undefined, on utilise aujourd'hui
    const dateArriveEffective = consult.dateArrive || new Date().toISOString();
    const duration = calculateDaysBetween(consult.dateDepart, dateArriveEffective);

    return (
        <li className="consultation-item">
            <div className="consultation-summary" onClick={() => setIsExpanded(!isExpanded)}>
                <span><strong>{consult.service}</strong> @ {consult.refere}</span>
                <span className="consultation-duration">{duration ? `${duration} jour(s)` : 'Durée N/A'}</span>
            </div>
            {isExpanded && (
                <div className="consultation-details">
                    <p>
                        <strong>Période :</strong> Du {formatDate(consult.dateDepart)} au{' '}
                        {/* ✅ Si pas de dateArrive, affiche "Aujourd'hui (en cours)" */}
                        {consult.dateArrive 
                            ? formatDate(consult.dateArrive) 
                            : `${formatDate(new Date().toISOString())} (en cours)`
                        }
                    </p>
                    <p><strong>Cadre référent :</strong> {consult.Cadre?.nom} ({consult.Cadre?.grade})</p>
                    <p><strong>Référence message :</strong> {consult.refMessage}</p>
                    <p><strong>Contact :</strong> {consult.phone}</p>
                    <p><strong>Status :</strong> {consult.status || 'Non renseigné'}</p>
                    <div style={{ margin: '10px 0', padding: '5px', backgroundColor: '#f0f4f8', borderRadius: '4px' }}>
                        <p style={{ margin: '2px 0' }}>
                            <i className="fa fa-bed fa-fw"></i> <strong>Hospitalisation :</strong> {consult.hospitalisation} jour(s)
                        </p>
                        <p style={{ margin: '2px 0' }}>
                            <i className="fa fa-heartbeat fa-fw"></i> <strong>Ambulatoire (Non hosp.) :</strong> {consult.Nonhospitalisation ?? 0} jour(s)
                        </p>
                    </div>
                    {consult.observation && (
                        <div style={{ marginTop: '10px' }}>
                            <strong>Observation :</strong>
                            <p className="consultation-observation" style={{
                                whiteSpace: 'pre-wrap',
                                fontStyle: 'italic',
                                color: '#555',
                                background: '#fff',
                                padding: '8px',
                                borderLeft: '3px solid #007bff',
                                marginTop: '5px'
                            }}>
                                {consult.observation}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </li>
    );
};

const AbsenceGroupItem = ({ group }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <li className="absence-item" onClick={() => setIsExpanded(!isExpanded)}>
            <div className="absence-summary">
                <span><strong>{group.motif}</strong> <span style={{fontSize: '0.8em', color: '#666'}}>({group.count})</span></span>
                <span className="absence-duration">Total : {group.totalDays} jour(s)</span>
            </div>
            {isExpanded && (
                 <div className="absence-details">
                    <p className="text-primary"><strong>Total cumulé :</strong> {group.totalDays} jours</p>
                    <hr style={{margin: '5px 0', borderColor: '#eee'}}/>
                    <p><strong>Détails des dates :</strong></p>
                    <ul style={{paddingLeft: '20px', margin: 0}}>
                        {group.dates.map((date, index) => (
                            <li key={index} style={{fontSize: '0.9em', color: '#555'}}>
                                {formatDate(date)}
                            </li>
                        ))}
                    </ul>
                 </div>
            )}
        </li>
    );
};

const ProfileInfoItem = ({ label, value, icon }) => (
    <div className="profile-info-item">
        <i className={`fa ${icon} fa-fw`}></i>
        <div>
            <span className="profile-info-label">{label}</span>
            <span className="profile-info-value">{value || 'Non renseigné'}</span>
        </div>
    </div>
);

const StudentDetailsModal = ({ student, examSubjects, typeExamen, startDate, endDate, selectedPromotion, onClose }) => {

    const [absences, setAbsences] = useState([]);
    const [processedAbsences, setProcessedAbsences] = useState([]);
    const [consultations, setConsultations] = useState([]);
    const [sanctions, setSanctions] = useState([]);
    const [observations, setObservations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [photoUrl, setPhotoUrl] = useState(DEFAULT_AVATAR_URL);
    const [studentDetails, setStudentDetails] = useState(null);
    const [isImageFullscreen, setIsImageFullscreen] = useState(false);
    const [generalResults, setGeneralResults] = useState([]);
    const [loadingGeneral, setLoadingGeneral] = useState(false);

   useEffect(() => {
    if (!student) return;
    const currentIncorp = String(student.numero_incorporation || student.numeroIncorporation || '').trim();
    const courNormalise = selectedPromotion ? selectedPromotion.replace(/[^0-9]/g, '') : '';
    const fetchExternalData = async () => {
    setLoading(true);
    setError('');
    setStudentDetails(student);
    try {
        const [sancRes, consultRes, absenceRes, detailsRes, obsRes] = await Promise.allSettled([
            axios.post(`${EXTERNAL_API_BASE_URL}/api/sanctions/bulk`,
                { incorporations: [currentIncorp], cour: courNormalise },
                { timeout: 5000 }
            ),
            axios.post(`${EXTERNAL_API_BASE_URL}/api/consultation/bulk`,
                { incorporations: [currentIncorp], cour: courNormalise },
                { timeout: 5000 }
            ),
            axios.post(`${EXTERNAL_API_BASE_URL}/api/absence/bulk`,
                { incorporations: [currentIncorp], cour: courNormalise },
                { timeout: 5000 }
            ),
            axios.get(`${EXTERNAL_API_BASE_URL}/api/eleve/incorporation/${currentIncorp}?cour=${courNormalise}`),

            // ← Observations, même pattern que sanctions/absences
            axios.post(`${EXTERNAL_API_BASE_URL}/api/observations/bulk`,
                { incorporations: [currentIncorp], cour: courNormalise },
                { timeout: 5000 }
            )
        ]);

        // Sanctions — inchangé
        if (sancRes.status === 'fulfilled' && sancRes.value.data) {
            const allSanctions = Array.isArray(sancRes.value.data) ? sancRes.value.data : [];
            const studentSanctions = allSanctions.filter(s =>
                s.Eleve && String(s.Eleve.numeroIncorporation).trim() === currentIncorp
            );
            setSanctions(studentSanctions);
        }

        // Consultations — inchangé
        if (consultRes.status === 'fulfilled' && consultRes.value.data) {
            const allConsult = Array.isArray(consultRes.value.data) ? consultRes.value.data : [];
            const studentConsult = allConsult.filter(c =>
                String(c.Eleve?.numeroIncorporation || '').trim() === currentIncorp
            );
            setConsultations(studentConsult);
        }

        // Absences — inchangé
        if (absenceRes.status === 'fulfilled' && absenceRes.value.data) {
            const allAbsences = Array.isArray(absenceRes.value.data) ? absenceRes.value.data : [];
            const studentAbsences = allAbsences.filter(a =>
                String(a.Eleve?.numeroIncorporation || '').trim() === currentIncorp
            );
            setAbsences(studentAbsences);
        }

        // Détails élève — inchangé
        if (detailsRes.status === 'fulfilled' && detailsRes.value.data?.eleve) {
            const eleveInfo = detailsRes.value.data.eleve;
            setStudentDetails(eleveInfo);
            if (eleveInfo.image) {
               setPhotoUrl(`${EXTERNAL_API_BASE_URL}${eleveInfo.image}`);
            }
        }

        // Observations — filtrage par incorporation, comme les autres
        if (obsRes.status === 'fulfilled' && obsRes.value.data) {
            const allObs = Array.isArray(obsRes.value.data) ? obsRes.value.data : [];
            const studentObs = allObs.filter(o =>
                String(o.Eleve?.numeroIncorporation || '').trim() === currentIncorp
            );
            setObservations(studentObs);
        }
    } catch (err) {
        setError('Impossible de charger les détails complets.');
    } finally {
        setLoading(false);
    }
};

    fetchExternalData();
}, [student, selectedPromotion]);

    useEffect(() => {
        if (student) {
            const fetchOptimizedStats = async () => {
                setLoadingGeneral(true);
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` };
                try {
                    const response = await axios.get(`/api/resultats/stats-eleve/${student.id}`, { headers });
                    const results = response.data.map(stat => ({
                        id: stat.type_examen,
                        name: stat.type_examen,
                        average: stat.moyenne,
                        rank: stat.rang,
                        isPassed: parseFloat(stat.moyenne) >= 12,
                         hasNote: stat.moyenne !== null,
                            estComplet: stat.est_complet,           
                            notesPresentes: stat.notes_presentes    
                    }));
                    setGeneralResults(results);
                } catch (e) {
                    console.error("Erreur chargement statistiques directes", e);
                } finally {
                    setLoadingGeneral(false);
                }
            };
            fetchOptimizedStats();
        }
    }, [student]);

    useEffect(() => {
        if (absences.length === 0) {
            setProcessedAbsences([]);
            return;
        }
        const groupedByMotif = absences.reduce((acc, current) => {
            const motifKey = current.motif || 'Non spécifié';
            if (!acc[motifKey]) acc[motifKey] = { motif: motifKey, count: 0, totalDays: 0, dates: [] };
            acc[motifKey].count += 1;
            acc[motifKey].totalDays += 1;
            acc[motifKey].dates.push(current.date);
            return acc;
        }, {});
        setProcessedAbsences(Object.values(groupedByMotif));
    }, [absences]);

    // ---- LOGIQUE DE FILTRAGE POUR LA PÉRIODE D'EXAMEN ----
    const periodConsultations = useMemo(() => {
        if (!startDate || !endDate) return [];
        return consultations.filter(c => getOverlappingDays(c.dateDepart, c.dateArrive, startDate, endDate) > 0);
    }, [consultations, startDate, endDate]);

    const periodAbsencesRaw = useMemo(() => {
        if (!startDate || !endDate) return [];
        return absences.filter(a => {
            const d = a.date || a.dateDebut || a.createdAt;
            return getOverlappingDays(d, d, startDate, endDate) > 0;
        });
    }, [absences, startDate, endDate]);

    const periodSanctions = useMemo(() => {
        if (!startDate || !endDate) return [];
        return sanctions.filter(s => getOverlappingDays(s.createdAt, s.createdAt, startDate, endDate) > 0);
    }, [sanctions, startDate, endDate]);

    const [periodProcessedAbsences, setPeriodProcessedAbsences] = useState([]);
    useEffect(() => {
        if (periodAbsencesRaw.length === 0) {
            setPeriodProcessedAbsences([]);
            return;
        }
        const groupedByMotif = periodAbsencesRaw.reduce((acc, current) => {
            const motifKey = current.motif || 'Non spécifié';
            if (!acc[motifKey]) acc[motifKey] = { motif: motifKey, count: 0, totalDays: 0, dates: [] };
            acc[motifKey].count += 1;
            acc[motifKey].totalDays += 1;
            acc[motifKey].dates.push(current.date || current.dateDebut || current.createdAt);
            return acc;
        }, {});
        setPeriodProcessedAbsences(Object.values(groupedByMotif));
    }, [periodAbsencesRaw]);
    // ------------------------------------------------------

    const consultationStats = useMemo(() => {
    if (consultations.length === 0) return null;
    const totalDays = consultations.reduce((sum, c) => {
        
        const dateArriveEffective = c.dateArrive || new Date().toISOString();
        return sum + calculateDaysBetween(c.dateDepart, dateArriveEffective);
    }, 0);
    let label = consultations.length === 1 
        ? `${totalDays} jours continue` 
        : `${totalDays} jours discontinus`;
    return { totalDays, label };
}, [consultations]);
const EXCLUDED_ABSENCE_MOTIFS = ['CONSULTATION EXTERNE', 'ADMIS HOMI', 'ADMIS CENHOSOA'];

const totalAbsencesGenerales = useMemo(() => {
    const totalSante = consultationStats ? consultationStats.totalDays : 0;
    const totalRegistre = processedAbsences
        .filter(g => !EXCLUDED_ABSENCE_MOTIFS.includes((g.motif || '').trim().toUpperCase()))
        .reduce((sum, g) => sum + g.totalDays, 0);
    return totalSante + totalRegistre;
}, [consultationStats, processedAbsences]);

    if (!student) return null;

    const displayStudent = studentDetails || student;
    const escadronText = displayStudent.escadron ? `${formatOrdinal(displayStudent.escadron)} Escadron` : '';
    const pelotonText = displayStudent.peloton ? `${formatOrdinal(displayStudent.peloton)} Peloton` : '';
    const groupText = [escadronText, pelotonText].filter(Boolean).join(' / ');

    return (
        <div className="modal-overlay" onClick={onClose}>
            {isImageFullscreen && (
                <div className="fullscreen-image-overlay" onClick={() => setIsImageFullscreen(false)}>
                    <img
                        src={photoUrl}
                        alt={`Photo de ${displayStudent.prenom} en plein écran`}
                        onError={() => setPhotoUrl(DEFAULT_AVATAR_URL)}
                    />
                </div>
            )}
            <div className="student-modal-cv-content" onClick={e => e.stopPropagation()}>
                <span onClick={onClose} className="cv-close-button">&times;</span>
                <div className="cv-grid">
                    <aside className="cv-profile-column">
                        <div className="cv-avatar-container">
                            {loading ? (
                                <div className="avatar-loader-wrapper">
                                    <div className='loading'>
                                      <div className='ball'></div>
                                      <div className='ball'></div>
                                      <div className='ball'></div>
                                      <div className='ball'></div>
                                      <svg viewBox="0 0 180 180" className="loading-text" width="180" height="180">
                                        <defs><path id="circlePath" d="M90,90 m-70,0 a70,70 0 1,1 140,0 a70,70 0 1,1 -140,0" /></defs>
                                        <text fill="white" fontSize="15" fontFamily="cursive" letterSpacing="2">
                                          <textPath href="#circlePath" startOffset="0%">
                                            EGNA...........................DI/SIT-INFO....................................
                                          </textPath>
                                        </text>
                                      </svg>
                                    </div>
                                </div>
                            ) : (
                                <img
                                    src={photoUrl}
                                    className="cv-avatar"
                                    alt={`Photo de ${displayStudent.prenom} ${displayStudent.nom}`}
                                    onError={() => setPhotoUrl(DEFAULT_AVATAR_URL)}
                                    onClick={() => setIsImageFullscreen(true)}
                                />
                            )}
                        </div>
                        <p className="cv-title-eg">EG</p>
                        <h2 className="cv-student-name">{displayStudent.prenom} {displayStudent.nom}</h2>
                        <hr style={{ margin: '20px 0' }} />
                        <div className="cv-info-list">
                            <div className="info-line">
                                <i className="fa fa-home fa-fw"></i>
                                <span>{groupText || 'Groupe non défini'}</span>
                            </div>
                            <div className="info-line">
                                <i className="fa fa-hashtag fa-fw"></i>
                                <span>Incorp: {displayStudent.numeroIncorporation || displayStudent.numero_incorporation}</span>
                            </div>
                            <div className="info-line">
                                <i className="fa fa-id-card-o fa-fw"></i>
                                <span>Matricule: {displayStudent.matricule || 'N/A'}</span>
                            </div>
                            <div className="info-line">
                                <i className="fa fa-vcard fa-fw"></i>
                                <span>CIN: {displayStudent.CIN || 'N/A'}</span>
                            </div>
                        </div>
                        <hr style={{ margin: '20px 0' }} />
                        <div className="cv-personal-details-list">
                            <ProfileInfoItem label="Date de Naissance" value={formatDate(displayStudent.dateNaissance)} icon="fa-calendar" />
                            <ProfileInfoItem label="Lieu de Naissance" value={displayStudent.lieuNaissance} icon="fa-map-pin" />
                            <ProfileInfoItem label="Situation Familiale" value={displayStudent.situationFamiliale} icon="fa-users" />
                            <ProfileInfoItem label="Téléphone" value={displayStudent.telephone1} icon="fa-phone" />
                            <ProfileInfoItem label="Niveau d'étude" value={displayStudent.niveau} icon="fa-graduation-cap" />
                            <ProfileInfoItem label="Religion" value={displayStudent.religion} icon="fa-book" />
                            <ProfileInfoItem label="N° Candidature" value={displayStudent.numCandidature} icon="fa-ticket" />
                        </div>
                    </aside>
                    <main className="cv-main-column">
                        <section className="cv-section">
                            <h3 className="cv-section-title"><i className="fa fa-pencil fa-fw"></i>Résultats Académiques</h3>
                            <h4 className={`cv-average-display ${parseFloat(student.moyenne) < 12 ? 'average-fail' : ''}`}>Moyenne Actuelle : {student.moyenne} / 20</h4>
                            <div className="notes-grid">
                                {loadingGeneral ? (
                                    <div style={{padding: '20px', textAlign: 'center', width: '100%'}}>
                                        <p>Chargement des statistiques...</p>
                                    </div>
                                ) : (
                                    generalResults.length > 0 ? (
                                      generalResults.map(res => (
                                                    <div className="note-item" key={res.id} style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        width: '100%',
                                                        padding: '12px 15px',
                                                        background: '#f8f9fa',
                                                        marginBottom: '8px',
                                                        borderRadius: '6px',
                                                        // ✅ Orange si partiel, vert si complet et admis, rouge si échoué
                                                        borderLeft: !res.estComplet 
                                                            ? '5px solid #f59e0b'    // Orange = partiel
                                                            : res.isPassed 
                                                                ? '5px solid #28a745'  // Vert = admis
                                                                : '5px solid #dc3545', // Rouge = échoué
                                                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                    }}>
                                                        <span style={{flex: 1.5, fontWeight: '700', color: '#333'}}>
                                                            {res.name}
                                                            {/* ✅ Badge partiel */}
                                                            {!res.estComplet && res.average && (
                                                                <span style={{
                                                                    marginLeft: '8px',
                                                                    fontSize: '0.7em',
                                                                    background: '#fef3c7',
                                                                    color: '#d97706',
                                                                    padding: '2px 6px',
                                                                    borderRadius: '4px'
                                                                }}>
                                                                    Partiel ({res.notesPresentes} note(s))
                                                                </span>
                                                            )}
                                                        </span>
                                                        <span style={{
                                                            flex: 1, 
                                                            textAlign: 'center', 
                                                            fontWeight: 'bold', 
                                                            color: !res.average 
                                                                ? '#94a3b8'           // Gris si pas de note
                                                                : res.isPassed 
                                                                    ? '#28a745'        // Vert si admis
                                                                    : '#dc3545'        // Rouge si échoué
                                                        }}>
                                                            {res.average ? `${res.average} / 20` : 'N/A'}
                                                        </span>
                                                        <span style={{flex: 1, textAlign: 'right', fontSize: '0.95em', color: '#666'}}>
                                                            {res.rank 
                                                                ? <>Rang: <strong style={{color: '#007bff'}}>{res.rank}</strong></>
                                                                : <span style={{color: '#94a3b8', fontSize: '0.85em'}}>
                                                                    {res.average ? 'Non classé (incomplet)' : 'Aucune note'}
                                                                </span>
                                                            }
                                                        </span>
                                                    </div>
                                                ))
                                    ) : (
                                        examSubjects && examSubjects.length > 0 ? (
                                            examSubjects.map(subject => {
                                                const note = student.notesDetail && student.notesDetail[subject.id];
                                                const isBad = note && parseFloat(note) < 12;
                                                return (
                                                    <div className="note-item" key={subject.id}>
                                                        <span className="note-subject">{subject.nom_matiere}</span>
                                                        <span className={`note-score ${!note ? 'na' : (isBad ? 'low-score' : '')}`}>
                                                            {note || 'N/A'}
                                                        </span>
                                                    </div>
                                                );
                                            })
                                        ) : <p className="text-muted" style={{padding: '10px'}}>Aucune donnée disponible pour cet examen.</p>
                                    )
                                )}
                            </div>
                        </section>
                        
                        <section className="cv-section">
                            <h3 className="cv-section-title"><i className="fa fa-medkit fa-fw"></i>Suivi Disciplinaire & Médical (Historique Global)</h3>
                            {!loading && (
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        background: 'linear-gradient(135deg, #fff3cd, #ffe8a1)',
                                        border: '2px solid #f0ad4e',
                                        borderRadius: '10px',
                                        padding: '14px 18px',
                                        margin: '10px 0 20px 0',
                                        boxShadow: '0 2px 6px rgba(240,173,78,0.35)'
                                    }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '1.05em', color: '#8a6d3b' }}>
                                            <i className="fa fa-exclamation-circle" style={{ marginRight: '8px' }}></i>
                                            Total des Absences
                                        </span>
                                        <span style={{ fontWeight: 800, fontSize: '1.4em', color: '#8a6d3b' }}>
                                            {totalAbsencesGenerales} jour(s)
                                        </span>
                                    </div>
                                )}
                            {loading ? <p style={{padding: '10px'}}>Chargement des données externes...</p> : (
                                <>
                                    <div className="external-info-item">
                                        <h5 style={{borderBottom: '2px solid #eee', paddingBottom: '5px', marginBottom: '10px'}}>Comportement & Discipline</h5>
                                        {sanctions.length > 0 ? (
                                            <div className="sanction-container">
                                                <div className="sanction-alert-header">
                                                    <i className="fa fa-exclamation-triangle"></i>
                                                    <span>Dossier Disciplinaire : {sanctions.length} Sanction(s)</span>
                                                </div>
                                                <ul className="details-list">
                                                    {sanctions.map((s) => <SanctionItem key={s.id} sanction={s} />)}
                                                </ul>
                                            </div>
                                        ) : (
                                            <div className="sanction-clean">
                                                <i className="fa fa-check-circle"></i> <span>Aucune sanction au dossier</span>
                                            </div>
                                        )}
                                    </div>
                                     <div className="external-info-item" style={{marginTop: '20px'}}>
                                        <h5 style={{borderBottom: '2px solid #eee', paddingBottom: '5px', marginBottom: '10px'}}>
                                            Observations ({observations.length})
                                        </h5>
                                        {observations.length > 0 ? (
                                            <ul className="details-list">
                                                {observations.map((o) => <ObservationItem key={o.id} obs={o} />)}
                                            </ul>
                                        ) : (
                                            <p className="text-muted" style={{padding: '5px'}}>Aucune observation enregistrée.</p>
                                        )}
                                    </div>
                                    <div className="external-info-item" style={{marginTop: '20px'}}>
                                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '5px', marginBottom: '10px'}}>
                                            <h5>Consultation Externe ({consultations.length})</h5>
                                            {consultationStats && (
                                                <span className="absence-duration" style={{backgroundColor: '#28a745', color: '#fff', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em'}}>
                                                    {consultationStats.label}
                                                </span>
                                            )}
                                        </div>
                                        {consultations.length > 0 ? (
                                            <ul className="details-list">
                                                {consultations.map((c) => <ConsultationItem key={c.id} consult={c} />)}
                                            </ul>
                                        ) : <p className="text-muted" style={{padding: '5px'}}>Aucune consultation enregistrée.</p>}
                                    </div>
                                    <div className="external-info-item" style={{marginTop: '20px'}}>
                                        <h5 style={{borderBottom: '2px solid #eee', paddingBottom: '6px', marginBottom: '10px'}}>S.P.A({processedAbsences.reduce((acc, g) => acc + g.count, 0)})</h5>
                                        {processedAbsences.length > 0 ? (
                                            <ul className="details-list">
                                                {processedAbsences.map((group, index) => (
                                                    <AbsenceGroupItem key={group.motif || index} group={group} />
                                                ))}
                                            </ul>
                                        ) : <p className="text-muted" style={{padding: '5px'}}>Aucune absence enregistrée.</p>}
                                    </div>
                                   
                                    
                                </>
                            )}
                        </section>

                        {/* NOUVELLE SECTION POUR LA PÉRIODE DE L'EXAMEN */}
                        {startDate && endDate && (
                            <section className="cv-section" style={{ border: '2px dashed #007bff', padding: '15px', borderRadius: '8px', backgroundColor: '#f4faff', marginTop: '30px' }}>
                                <h3 className="cv-section-title" style={{ color: '#007bff', borderBottom: '2px solid #b8daff', paddingBottom: '10px' }}>
                                    <i className="fa fa-calendar fa-fw"></i> Événements pendant la période d'examen
                                </h3>
                                <p style={{ fontSize: '0.9em', color: '#555', marginBottom: '15px' }}>
                                    (Du {formatDate(startDate)} au {formatDate(endDate)})
                                </p>
                                
                                {periodSanctions.length === 0 && periodConsultations.length === 0 && periodProcessedAbsences.length === 0 ? (
                                    <p className="text-muted" style={{fontWeight: 'bold'}}>
                                        <i className="fa fa-check-circle text-success"></i> Aucun événement disciplinaire ou médical durant cette période.
                                    </p>
                                ) : (
                                    <>
                                        {/* Sanctions pendant l'examen */}
                                        {periodSanctions.length > 0 && (
                                            <div className="external-info-item" style={{ marginBottom: '15px' }}>
                                                <h5 style={{ color: '#dc3545' }}><i className="fa fa-gavel"></i> Sanctions ({periodSanctions.length})</h5>
                                                <ul className="details-list">
                                                    {periodSanctions.map(s => <SanctionItem key={`ps-${s.id}`} sanction={s} />)}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Consultations pendant l'examen */}
                                        {periodConsultations.length > 0 && (
                                            <div className="external-info-item" style={{ marginBottom: '15px' }}>
                                                <h5 style={{ color: '#ffc107' }}><i className="fa fa-heartbeat"></i> Consultations Médicales ({periodConsultations.length})</h5>
                                                <ul className="details-list">
                                                    {periodConsultations.map(c => <ConsultationItem key={`pc-${c.id}`} consult={c} />)}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Absences pendant l'examen */}
                                        {periodProcessedAbsences.length > 0 && (
                                            <div className="external-info-item" style={{ marginBottom: '15px' }}>
                                                <h5 style={{ color: '#fd7e14' }}><i className="fa fa-user-times"></i> Absences ({periodAbsencesRaw.length})</h5>
                                                <ul className="details-list">
                                                    {periodProcessedAbsences.map((group, index) => <AbsenceGroupItem key={`pa-${index}`} group={group} />)}
                                                </ul>
                                            </div>
                                        )}
                                    </>
                                )}
                            </section>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
};

export default StudentDetailsModal;
