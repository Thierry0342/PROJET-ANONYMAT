import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import StudentDetailsModal from './StudentDetailsModal';
import DashboardModal from './DashboardModal';
import WelcomePage from './WelcomePage';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Dashboard.css';
import { EXTERNAL_API_BASE_URL } from '../config/apiConfig';

const formatNom = (nom) => {
    return nom ? nom.toUpperCase() : '';
};

const formatPrenom = (prenom) => {
    if (!prenom) return '';
    return prenom
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
};
//test
const formatStatutLabel = (statut) => {
    if (!statut) return 'N/A';
    switch (statut.toLowerCase()) {
        case 'redoublant': return 'REDOUBLANT';
        case 'ajourne_3m': return 'AJOURNÉ 3 MOIS';
        case 'ajourne_6m': return 'AJOURNÉ 6 MOIS';
        default: return statut.toUpperCase();
    }
};

const getStatusColor = (note) => {
    const val = parseFloat(note);
    if (isNaN(val)) return '#94a3b8';
    if (val >= 16) return '#059669';
    if (val >= 12) return '#10b981';
    if (val >= 10) return '#f59e0b';
    return '#ef4444';
};

const normalizeStudentData = (s) => {
    if (!s) return s;
    return {
        ...s,
        id: s.id || s.eleve_id || s.eleveId,
        numero_incorporation: s.numero_incorporation || s.numeroIncorporation || s.incorp,
        matricule: s.matricule || s.Matricule || 'N/A'
    };
};

const calculateCombinedHealthStats = (consultations, absences) => {
    const uniqueDaysSet = new Set();
    const daysConsult = new Set();
    const daysIG = new Set();
    const daysCHRR = new Set();

    if (consultations && Array.isArray(consultations)) {
        consultations.forEach(c => {
            if (!c.dateDepart) return;
            const start = new Date(c.dateDepart);
            // ✅ Si pas de dateArrive, on utilise aujourd'hui
            const dateArriveEffective = c.dateArrive 
                ? new Date(c.dateArrive) 
                : new Date();
            start.setHours(0, 0, 0, 0);
            dateArriveEffective.setHours(0, 0, 0, 0);
            for (let dt = new Date(start); dt <= dateArriveEffective; dt.setDate(dt.getDate() + 1)) {
                const ts = dt.getTime();
                uniqueDaysSet.add(ts);
                daysConsult.add(ts);
            }
        });
    }

    if (absences && Array.isArray(absences)) {
        absences.forEach(a => {
            if (a.motif && a.date) {
                const motifUpper = a.motif.toUpperCase().trim();
                const d = new Date(a.date);
                d.setHours(0, 0, 0, 0);
                const ts = d.getTime();
                if (motifUpper.includes("ADMIS IG")) {
                    uniqueDaysSet.add(ts);
                    daysIG.add(ts);
                } else if (motifUpper.includes("ADMIS CHRR")) {
                    uniqueDaysSet.add(ts);
                    daysCHRR.add(ts);
                }
            }
        });
    }

    const total = uniqueDaysSet.size;
    if (total === 0) {
        return { total: 0, maxContinuous: 0, details: { consult: 0, ig: 0, chrr: 0 } };
    }

    const sortedTimestamps = Array.from(uniqueDaysSet).sort((a, b) => a - b);
    let maxContinuous = 1;
    let currentStreak = 1;
    for (let i = 1; i < sortedTimestamps.length; i++) {
        const diff = sortedTimestamps[i] - sortedTimestamps[i - 1];
        if (diff <= 86400000 + 3600000) {
            currentStreak++;
        } else {
            maxContinuous = Math.max(maxContinuous, currentStreak);
            currentStreak = 1;
        }
    }
    maxContinuous = Math.max(maxContinuous, currentStreak);

    return {
        total,
        maxContinuous,
        details: {
            consult: daysConsult.size,
            ig: daysIG.size,
            chrr: daysCHRR.size
        }
    };
};

const Dashboard = () => {
    const [showIntro, setShowIntro] = useState(true);
    const [isDataReady, setIsDataReady] = useState(false);
    const [error, setError] = useState('');
    const [selectedPromotion, setSelectedPromotion] = useState('all');
    const [selectedPopulation, setSelectedPopulation] = useState('all');
    const [promotionsList, setPromotionsList] = useState([]);
    const [examSummaries, setExamSummaries] = useState([]);
    const [generalSummary, setGeneralSummary] = useState(null);
    const [detailedRanking, setDetailedRanking] = useState([]);
    const [globalRanking, setGlobalRanking] = useState([]);
    const [classementWithDetails, setClassementWithDetails] = useState([]);
    const [evolutionConseil, setEvolutionConseil] = useState([]);
    const [searchConseil, setSearchConseil] = useState('');
    const [filterTypeConseil, setFilterTypeConseil] = useState('all');
    const [expandedStudentId, setExpandedStudentId] = useState(null);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [modalData, setModalData] = useState(null);
    const [modalTitle, setModalTitle] = useState('');
    const [modalColumns, setModalColumns] = useState([]);
    const [ajournementThreshold, setAjournementThreshold] = useState(10);

    // GESTION DES COLONNES DU LEADERBOARD (Motif masqué par défaut)
    const [showColMenu, setShowColMenu] = useState(false);
    const [visibleCols, setVisibleCols] = useState({
        decision: true,
        motif: false, // <-- Masqué par défaut
        initiale: true,
        repechage: true,
        gain: true
    });

    const isSelectionComplete = selectedPromotion !== 'all' && selectedPopulation !== 'all';

   useEffect(() => {
    const fetchPromotions = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await axios.get('/api/promotions', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const list = res.data || [];
            setPromotionsList(list);

            // ✅ Sélectionner automatiquement la promotion la plus récente
            if (list.length > 0) {
                const derniere = list[0]; // ou list[0] selon l'ordre retourné
                setSelectedPromotion(derniere);
                setSelectedPopulation('total');
                localStorage.setItem('selectedPromotion', derniere);
            }
        } catch (e) {
            setError('Impossible de charger les promotions.');
        }
    };
    fetchPromotions();
}, []);

    useEffect(() => {
        if (!isSelectionComplete) return;

        let isMounted = true;
        const fetchData = async () => {
            try {
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` };
                const config = { headers, timeout: 60000 };
                const apiPop = selectedPopulation === 'total' ? 'all' : selectedPopulation;
                const query = `?promotion=${selectedPromotion}&population=${apiPop}`;

                const examRes = await axios.get(`/api/dashboard/summary-by-exam-type${query}`, config);
                if (isMounted) setExamSummaries(examRes.data || []);

                const typeCible = selectedPopulation === 'conseil' ? 'REPECHAGE' : 'General';

                const [genRes, currentRankRes, globalRankRes] = await Promise.all([
                    axios.get(`/api/dashboard/general-summary${query}`, config),
                    axios.get(`/api/resultats/classement-details?typeExamen=${typeCible}&promotion=${selectedPromotion}&population=${apiPop}`, config),
                    axios.get(`/api/resultats/classement-details?typeExamen=General&promotion=${selectedPromotion}&population=all`, config)
                ]);

                if (isMounted) {
                    setGeneralSummary(genRes.data);
                    setDetailedRanking((currentRankRes.data.classement || []).map(normalizeStudentData));
                    setGlobalRanking((globalRankRes.data.classement || []).map(normalizeStudentData));
                    setIsDataReady(false);
                    setClassementWithDetails([]);
                }
            } catch (err) {
                if (isMounted) setError('Erreur lors de la récupération des données.');
            }
        };

        fetchData();
        return () => { isMounted = false; };
    }, [selectedPromotion, selectedPopulation, isSelectionComplete]);

    useEffect(() => {
        if (isSelectionComplete && selectedPopulation === 'conseil') {
            const fetchEvolution = async () => {
                const courNormalise = selectedPromotion ? selectedPromotion.replace(/[^0-9]/g, '') : '';
                try {
                    const token = localStorage.getItem('token');
                    const headers = { Authorization: `Bearer ${token}` };

                    const [resEvol, resDecisions] = await Promise.all([
                        axios.get(`/api/dashboard/evolution-conseil?promotion=${selectedPromotion}`, { headers }),
                        axios.get('/api/decisions-conseil', { headers })
                    ]);

                    let rawData = (resEvol.data || []).map(normalizeStudentData);
                    const decisionsList = resDecisions.data || [];

                    const BATCH_SIZE = 5;
                    let enriched = [];
                    for (let i = 0; i < rawData.length; i += BATCH_SIZE) {
                        const batch = rawData.slice(i, i + BATCH_SIZE);
                        const batchPromises = batch.map(async (st) => {
                            try {
                                const detailRes = await axios.get(`${EXTERNAL_API_BASE_URL}/api/eleve/incorporation/${st.numero_incorporation}?cour=${courNormalise}`, { timeout: 3000 });
                                const eleveInfo = detailRes.data?.eleve;

                                const decisionMatch = decisionsList.find(d => String(d.eleve_id) === String(st.id) || String(d.numero_incorporation) === String(st.numero_incorporation));

                                return {
                                    ...st,
                                    matricule: eleveInfo?.matricule || st.matricule,
                                    imagePath: eleveInfo?.image ? `${EXTERNAL_API_BASE_URL}${eleveInfo.image}` : null,
                                    motif_conseil: decisionMatch?.motif || 'Non renseigné'
                                };
                            } catch(e) {
                                const decisionMatch = decisionsList.find(d => String(d.eleve_id) === String(st.id) || String(d.numero_incorporation) === String(st.numero_incorporation));
                                return {
                                    ...st,
                                    motif_conseil: decisionMatch?.motif || 'Non renseigné'
                                };
                            }
                        });
                        const resBatch = await Promise.all(batchPromises);
                        enriched = [...enriched, ...resBatch];
                    }

                    setEvolutionConseil(enriched.sort((a, b) => parseFloat(b.moyenneRepechage) - parseFloat(a.moyenneRepechage)));
                } catch (e) {
                    console.error(e);
                }
            };
            fetchEvolution();
        }
    }, [selectedPromotion, selectedPopulation, isSelectionComplete]);

   useEffect(() => {
    if (!isSelectionComplete || !detailedRanking || detailedRanking.length === 0) {
        setClassementWithDetails([]);
        setIsDataReady(true);
        return;
    }

    let isMounted = true;

    const fetchEnrichedData = async () => {
        const rawStudents = detailedRanking;
        const incorporations = rawStudents.map(s => String(s.numero_incorporation));
        const courNormalise = selectedPromotion ? selectedPromotion.replace(/[^0-9]/g, '') : '';


        try {
           const [sancRes, absenceRes, consultRes] = await Promise.allSettled([
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/sanctions/bulk`,
                        { incorporations, cour: courNormalise },
                        { timeout: 5000 }
                    ),
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/absence/bulk`,
                        { incorporations, cour: courNormalise },
                        { timeout: 5000 }
                    ),
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/consultation/bulk`,
                    { incorporations, cour: courNormalise },
                    { timeout: 5000 }
                )
                ]);

            const allSanctions     = sancRes.status     === 'fulfilled' ? sancRes.value.data     : [];
            const allAbsences      = absenceRes.status  === 'fulfilled' ? absenceRes.value.data  : [];
            const allConsultations = consultRes.status  === 'fulfilled' ? consultRes.value.data  : [];

            // Grouper absences par incorporation
            const absencesMap = {};
            allAbsences.forEach(a => {
                const incorp = String(a.Eleve?.numeroIncorporation || '');
                if (!absencesMap[incorp]) absencesMap[incorp] = [];
                absencesMap[incorp].push(a);
            });

            // Grouper consultations par incorporation
            const consultationsMap = {};
            allConsultations.forEach(c => {
                const incorp = String(c.Eleve?.numeroIncorporation || '');
                if (!consultationsMap[incorp]) consultationsMap[incorp] = [];
                consultationsMap[incorp].push(c);
            });

            // Fusion des données
            const enriched = rawStudents.map(st => {
                const incorp   = String(st.numero_incorporation);
                const consults = consultationsMap[incorp] || [];
                const absences = absencesMap[incorp]      || [];
                const health   = calculateCombinedHealthStats(consults, absences);

                const stSanc = allSanctions.filter(s =>
                    s.Eleve && String(s.Eleve.numeroIncorporation) === incorp
                );
                const arDays = stSanc.reduce((sum, s) => {
                    const taux = (s.taux || '').toUpperCase();
                    return taux.includes('AR') ? sum + (parseInt(taux) || 0) : sum;
                }, 0);

                return {
                    ...st,
                    consultationDays: health.total,
                    consultationMax:  health.maxContinuous,
                    sanctionCount:    stSanc.length,
                    totalARDays:      arDays,
                    healthDetails:    health.details
                };
            });

            if (isMounted) {
                setClassementWithDetails(enriched);
                setIsDataReady(true);
            }
        } catch (err) {
            if (isMounted) {
                setClassementWithDetails(rawStudents);
                setIsDataReady(true);
            }
        }
    };

    fetchEnrichedData();
    return () => { isMounted = false; };
}, [detailedRanking, isSelectionComplete, selectedPromotion]);

    const handleShowEvolutionDetail = useCallback((student) => {
        const columns = [
            { key: 'nom', header: 'Matière' },
            { key: 'initiale', header: 'Initiale' },
            { key: 'repechage', header: 'Repêchage' },
            { key: 'diffDisplay', header: 'Progression' }
        ];
        const data = student.matieres.map(m => ({
            ...m,
            diffDisplay: (
                <span style={{
                    color: parseFloat(m.diff) > 0 ? '#10b981' : parseFloat(m.diff) < 0 ? '#ef4444' : '#94a3b8',
                    fontWeight: '800'
                }}>
                    {parseFloat(m.diff) > 0 ? `+${m.diff}` : m.diff}
                </span>
            )
        }));
        setModalTitle(`Détails Matières : ${formatPrenom(student.prenom)} ${formatNom(student.nom)}`);
        setModalColumns(columns);
        setModalData(data);
    }, []);

    const showModal = useCallback((title, cols, data) => {
        setModalTitle(title);
        setModalColumns(cols);
        setModalData(data);
    }, []);

    const filteredLeaderboard = useMemo(() => {
        let result = [...evolutionConseil];

        if (filterTypeConseil !== 'all') {
            if (filterTypeConseil === 'ajournes_all') {
                result = result.filter(s => s.statut === 'ajourne_3m' || s.statut === 'ajourne_6m');
            } else {
                result = result.filter(s => s.statut === filterTypeConseil);
            }
        }

        if (searchConseil) {
            const term = searchConseil.toLowerCase();
            result = result.filter(s =>
                s.nom.toLowerCase().includes(term) ||
                s.prenom.toLowerCase().includes(term) ||
                String(s.numero_incorporation).includes(term)
            );
        }

        return result.sort((a, b) => {
            const moyA = parseFloat(a.moyenneRepechage) || 0;
            const moyB = parseFloat(b.moyenneRepechage) || 0;
            return moyB - moyA;
        });
    }, [evolutionConseil, searchConseil, filterTypeConseil]);

    const filteredSourceData = useMemo(() => {
        let data = isDataReady ? classementWithDetails : detailedRanking;
        if (selectedPopulation === 'conseil' && filterTypeConseil !== 'all') {
            if (filterTypeConseil === 'ajournes_all') {
                data = data.filter(s => s.statut === 'ajourne_3m' || s.statut === 'ajourne_6m');
            } else {
                data = data.filter(s => s.statut === filterTypeConseil);
            }
        }
        return data || [];
    }, [isDataReady, classementWithDetails, detailedRanking, selectedPopulation, filterTypeConseil]);

    // ==== CALCUL DES STATS DE RÉUSSITE PAR MOTIF ====
    const motifStats = useMemo(() => {
        if (selectedPopulation !== 'conseil') return [];
        const grouped = {};
        
        filteredLeaderboard.forEach(st => {
            const motif = st.motif_conseil || 'Non renseigné';
            if (!grouped[motif]) grouped[motif] = { total: 0, admis: 0 };
            grouped[motif].total += 1;
            
            // Si la moyenne de repêchage >= 12, on le compte comme admis
            if (parseFloat(st.moyenneRepechage) >= 12) {
                grouped[motif].admis += 1;
            }
        });

        return Object.entries(grouped).map(([motif, data]) => ({
            motif,
            total: data.total,
            admis: data.admis,
            taux: ((data.admis / data.total) * 100).toFixed(1) + '%'
        })).sort((a, b) => b.total - a.total);
    }, [filteredLeaderboard, selectedPopulation]);

    const exportToPDF = () => {
        const doc = new jsPDF('p', 'mm', 'a4');

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");

        doc.text("MINISTERE DELEGUE", 55, 15, { align: 'center' });
        doc.text("EN CHARGE DE LA GENDARMERIE NATIONALE",55 , 20, { align: 'center' });
        doc.line(40, 22, 70, 22);
        doc.text("COMMANDEMENT DE LA GENDARMERIE NATIONALE", 55, 28, { align: 'center' });
        doc.line(40, 30, 70, 30);
        doc.text("ECOLE DE LA GENDARMERIE NATIONALE", 55, 36, { align: 'center' });
        doc.text("D'AMBOSITRA", 55, 41, { align: 'center' });
        doc.line(40,43,70,43);

        doc.text("REPOBLIKAN'I MADAGASIKARA", 155, 15, { align: 'center' });
        doc.setFont("helvetica", "italic");
        doc.text("Fitiavana - Tanindrazana - Fandrosoana", 155, 20, { align: 'center' });
        doc.line(125, 22, 185, 22);

        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        const titleY = 65;
        doc.text("ETAT FAISANT CONNAITRE LE RESULTAT", 105, titleY, { align: 'center' });
        doc.text(`DU REPECHAGE ${selectedPromotion}  COURS DE FORMATION DES ELEVES GENDARMES`, 105, titleY + 6, { align: 'center' });

        const tableColumn = ["RANG", "NOM ET PRENOM", "MATRICULE", "MOYENNE"];
        const tableRows = []; // CORRECTION ICI (Ajout du `const`)

        filteredLeaderboard.forEach((student) => {
            const currentMoy = parseFloat(student.moyenneRepechage) || 0;
            const tieStartIndex = filteredLeaderboard.findIndex(s => (parseFloat(s.moyenneRepechage) || 0) === currentMoy);
            const displayRank = tieStartIndex + 1;
            const tiedCount = filteredLeaderboard.filter(s => (parseFloat(s.moyenneRepechage) || 0) === currentMoy).length;
            const isExAequo = tiedCount > 1;

            const rankText = `${displayRank}${isExAequo ? ' ex' : ''}`;
            const nomPrenom = `${formatNom(student.nom)} ${formatPrenom(student.prenom)}`;
            const matriculeText = student.matricule || 'N/A';
            const moyenneText = student.moyenneRepechage || 'N/A';

            tableRows.push([rankText, nomPrenom, matriculeText,  moyenneText]);
        });

        autoTable(doc, {
            startY: titleY + 15,
            head: [tableColumn],
            body: tableRows,
            theme: 'plain',
            styles: {
                font: 'helvetica',
                textColor: [0, 0, 0],
                lineColor: [0, 0, 0],
                lineWidth: 0.1,
                fontSize: 10,
                cellPadding: 3
            },
            headStyles: {
                fontStyle: 'bold',
                fillColor: false,
                textColor: [0, 0, 0],
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 20 },
                1: { halign: 'left', cellWidth: 'auto' },
                2: { halign: 'center', cellWidth: 35 },
                3: { halign: 'center', cellWidth: 40 },
                4: { halign: 'center', cellWidth: 25 }
            }
        });

        let finalY = doc.lastAutoTable.finalY + 20;

        if (finalY > 230) {
            doc.addPage();
            finalY = 30;
        }

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");

        doc.text("DESTINATAIRES :", 15, finalY);
        doc.text("- A Monsieur LE GENERAL DE DIVISION,", 15, finalY + 10);
        doc.text("Commandant de la gendarmerie nationale", 20, finalY + 15);
        doc.text("(COM/DGP/PSO)", 25, finalY + 20);
        doc.text("à - ANTANANARIVO -", 80, finalY + 25);

        doc.text('"A titre de compte-rendu"', 30, finalY + 35);

        doc.text("- A Monsieur LE GENERAL DE DIVISION,", 15, finalY + 45);
        doc.text("Commandant des écoles de la gendarmerie nationale", 20, finalY + 50);
        doc.text("(CEGN/SDE)", 25, finalY + 55);
        doc.text("à - ANTANANARIVO -", 80, finalY + 60);

        const dateStr = new Date().toLocaleDateString('fr-FR');
        doc.text(`A Ambositra, le ${dateStr}`, 150, finalY, { align: 'center' });
        doc.setFont("helvetica", "bold");
        doc.text("LE COLONEL RASOLOFONIARY Jean Michel", 150, finalY + 8, { align: 'center' });
        doc.setFont("helvetica", "normal");
        doc.text("Commandant de l'École de la gendarmerie Nationale", 150, finalY + 14, { align: 'center' });

        let fileName = `Liste_Conseil_${selectedPromotion}`;
        if(filterTypeConseil !== 'all') fileName += `_${filterTypeConseil}`;
        doc.save(`${fileName}.pdf`);
    };

    const renderLeaderboardRow = (student, index) => {
        const isExpanded = expandedStudentId === student.id;
        const historyRecord = globalRanking.find(s => String(s.numero_incorporation) === String(student.numero_incorporation));
        const realHistory = examSummaries
            .filter(ex => !ex.typeExamen.toUpperCase().includes('REPECHAGE'))
            .map(ex => {
                let noteRaw = historyRecord?.details?.[ex.typeExamen];
                return {
                    label: ex.typeExamen.replace(/_/g, ' '),
                    note: (noteRaw !== null && noteRaw !== undefined) ? parseFloat(noteRaw).toFixed(2) : 'N/A'
                };
            });

        const currentMoy = parseFloat(student.moyenneRepechage) || 0;
        const tieStartIndex = filteredLeaderboard.findIndex(s => (parseFloat(s.moyenneRepechage) || 0) === currentMoy);
        const displayRank = tieStartIndex + 1;
        const tiedCount = filteredLeaderboard.filter(s => (parseFloat(s.moyenneRepechage) || 0) === currentMoy).length;
        const isExAequo = tiedCount > 1;

        const healthData = classementWithDetails.find(s => String(s.numero_incorporation) === String(student.numero_incorporation));
        const colSpanCount = 2 + Object.values(visibleCols).filter(Boolean).length; // +2 for Rank/Name and Action

        return (
            <React.Fragment key={student.id}>
                <tr
                    className={`evolution-row-main ${isExpanded ? 'is-active' : ''}`}
                    onClick={() => setExpandedStudentId(isExpanded ? null : student.id)}
                    style={{ cursor: 'pointer' }}
                >
                    <td>
                        <div className="student-identity-group">
                            <span className="rank-numeric">#{displayRank}{isExAequo ? ' ex' : ''}</span>
                            <div className="name-box">
                                <span className="name-main">{formatNom(student.nom)}</span>
                                <span className="name-sub">{formatPrenom(student.prenom)}</span>
                                <span className="name-sub" style={{ fontSize: '0.75em', color: '#666' }}>Mat: {student.matricule || 'N/A'}</span>
                            </div>
                        </div>
                    </td>
                    
                    {visibleCols.decision && (
                        <td className="center-cell">
                            <div className={`badge-decision ${student.statut}`}>
                                {formatStatutLabel(student.statut)}
                            </div>
                        </td>
                    )}
                    
                    {visibleCols.motif && (
                        <td className="center-cell" style={{ fontSize: '0.85rem', color: '#555', fontStyle: 'italic', maxWidth: '120px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={student.motif_conseil || 'Non renseigné'}>
                            {student.motif_conseil || 'Non renseigné'}
                        </td>
                    )}

                    {visibleCols.initiale && (
                        <td className="center-cell"><div className="badge-initial">{student.moyenneInitiale}</div></td>
                    )}

                    {visibleCols.repechage && (
                        <td className="center-cell"><div className="badge-repechage">{student.moyenneRepechage}</div></td>
                    )}

                    {visibleCols.gain && (
                        <td className="center-cell">
                            <div className={`gain-indicator ${parseFloat(student.progression) >= 0 ? 'positive' : 'negative'}`}>
                                {parseFloat(student.progression) >= 0 ? `+${student.progression}` : student.progression}
                            </div>
                        </td>
                    )}

                    <td className="center-cell">
                        <div className="action-trigger">
                            <i className={`fa fa-angle-${isExpanded ? 'up' : 'down'}`}></i>
                        </div>
                    </td>
                </tr>

                {isExpanded && (
                    <tr className="evolution-expanded-view">
                        <td colSpan={colSpanCount}>
                            <div className="expanded-content-wrapper animate-slide-in">
                                <div className="history-info-layout">
                                    <div className="student-photo-area">
                                        <img
                                            src={student.imagePath || 'https://www.w3schools.com/w3images/avatar_hat.jpg'}
                                            alt="Profil"
                                            onError={(e) => { e.target.onerror = null; e.target.src = 'https://www.w3schools.com/w3images/avatar_hat.jpg'; }}
                                        />
                                        <div className="photo-label">PARCOURS ACADÉMIQUE</div>
                                    </div>
                                    <div className="history-strip-line">
                                        <div className="stats-sanct-container" style={{display: 'flex', gap: '20px', marginBottom: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '5px', fontSize: '0.9em'}}>
                                            <span><i className="fa fa-medkit"></i> Consultations: <strong>{healthData?.consultationDays || 0} jours</strong></span>
                                            <span><i className="fa fa-gavel"></i> Sanctions: <strong>{healthData?.sanctionCount || 0}</strong></span>
                                        </div>
                                        <div className="strip-items-container">
                                            {realHistory.length > 0 ? realHistory.map((ex, idx) => (
                                                <div key={idx} className="strip-item">
                                                    <span className="strip-item-name">{ex.label}</span>
                                                    <span className="strip-item-value" style={{ backgroundColor: getStatusColor(ex.note) }}>{ex.note}</span>
                                                </div>
                                            )) : <span className="no-history">Aucun historique disponible.</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="progression-summary-line">
                                    <div className="progression-text">
                                        <i className="fa fa-chart-line"></i>
                                        Position : <span className="highlight-pts">Rang #{displayRank}</span>
                                    </div>
                                    <div className="expansion-button-group">
                                        <button className="btn-details-matiere" onClick={(e) => { e.stopPropagation(); handleShowEvolutionDetail(student); }}>
                                            Détails Matières
                                        </button>
                                        <button className="btn-dossier-full" onClick={(e) => { e.stopPropagation(); setSelectedStudent(student); }}>
                                            Consulter Dossier
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                )}
            </React.Fragment>
        );
    };

    const renderInstructionGuide = () => {
        let step = 1;
        let title = "SÉLECTION DE LA PROMOTION";
        let text = "Veuillez choisir une PROMOTION pour charger la base de données.";
        let icon = "fa-university";

        if (selectedPromotion !== 'all' && selectedPopulation === 'all') {
            step = 2;
            title = "DÉFINITION DU PÉRIMÈTRE";
            text = "Sélectionnez maintenant la POPULATION cible (Actifs ou Conseil) pour le calcul des statistiques.";
            icon = "fa-users-cog";
        }

        return (
            <div className={`instruction-hero phase-${step}`}>
                <div className="instruction-glass-card">
                    <div className="step-count">ÉTAPE {step}</div>
                    <i className={`fa ${icon} icon-float`}></i>
                    <h2>{title}</h2>
                    <p>{text}</p>
                    <div className="arrow-down-bounce"><i className="fa fa-arrow-up"></i></div>
                </div>
            </div>
        );
    };

    const countStudents = filteredSourceData.length;
    const countSup12 = filteredSourceData.filter(s => parseFloat(s.moyenne) >= 12).length;
    const countInf12 = filteredSourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < 12).length;
    const countAjournement = filteredSourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < parseFloat(ajournementThreshold)).length;
    
    // Calcul du pourcentage global de réussite (moyenne >= 12) pour la carte Bilan
    const totalTauxReussite = countStudents > 0 ? ((countSup12 / countStudents) * 100).toFixed(1) + '%' : '0%';

    const countRedoublement = isDataReady ? filteredSourceData.filter(s =>
        (s.consultationMax >= 45 || s.consultationDays >= 60) ||
        (s.moyenne !== null && parseFloat(s.moyenne) < 8) ||
        (s.totalARDays >= 20)
    ).length : 'Calcul...';
const sortedExams = (examSummaries || []).filter(e => {
    const nomUpper = e.typeExamen.toUpperCase();

    //  N'afficher que si au moins un élève a une note ou un examen complet
    if ((e.stats.elevesAvecNote || 0) === 0) return false;

    if (selectedPopulation === 'conseil') {
        return nomUpper.includes('REPECHAGE') || nomUpper === 'GENERAL';
    }
    return !nomUpper.includes('REPECHAGE');
}).sort((a, b) => {
    const order = (t) => {
        const up = t.toUpperCase();
        if (up === 'GENERAL') return 0;
        if (up.includes('FETTA')) return 1;
        if (up.includes('TEST')) return 2;
        if (up.includes('MI')) return 3;
        if (up.includes('STAGE')) return 4;
        return 99;
    };
    return order(a.typeExamen) - order(b.typeExamen);
});
    if (showIntro) return <WelcomePage onComplete={() => setShowIntro(false)} />;

    return (
        <div className="dashboard-root-layout">
            <div className="dashboard-sidebar-header">
                <div className="brand-title">Interface Décisionnelle</div>
                <div className="brand-subtitle">Analyse Statistique & Support Pédagogique</div>

                <div className="header-filters-container">
                    <div className={`filter-block ${selectedPromotion === 'all' ? 'pending' : 'filled'}`}>
                        <label>Promotion</label>
                        <select
                            value={selectedPromotion}
                            onChange={(e) => { setSelectedPromotion(e.target.value); setSelectedPopulation('all'); }}
                            className="select-custom-ui"
                        >
                            <option value="all">Saisir promotion...</option>
                            {promotionsList.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    <div className={`filter-block ${selectedPromotion !== 'all' && selectedPopulation === 'all' ? 'pending' : 'filled'}`}>
                        <label>Donnée Cible</label>
                        <select
                            value={selectedPopulation}
                            onChange={(e) => setSelectedPopulation(e.target.value)}
                            className="select-custom-ui"
                        >
                            <option value="all">Périmètre...</option>
                            <option value="total">Promotion Totale</option>
                            <option value="actif">ACTIFS</option>
                            <option value="conseil">LISTE CONSEIL (Repêchage)</option>
                        </select>
                    </div>
                </div>
                {error && <div className="error-status-toast">{error}</div>}
            </div>

            <div className="dashboard-scrollable-content">
                {!isSelectionComplete ? renderInstructionGuide() : (
                    <div className="main-data-dashboard animate-fade">
                        <div className="exam-summary-grid">
                         {sortedExams.map(exam => (
                        <div key={exam.typeExamen} className="exam-card-stat-unit">
                            <div className="card-top">
                                <h4>{exam.typeExamen.replace(/_/g, ' ')}</h4>
                                <span className="tag-ok">Statut OK</span>
                            </div>

                            {/* Barre de progression complétion */}
                            <div className="completion-bar-wrapper">
                                <div className="completion-bar-labels">
                                    <span>Complétion</span>
                                    <span>
                                        {exam.stats.complets} / {exam.stats.totalEleves}
                                    </span>
                                </div>
                                <div className="completion-bar-track">
                                    <div 
                                        className="completion-bar-fill"
                                        style={{ 
                                            width: `${exam.stats.totalEleves > 0 
                                                ? (exam.stats.complets / exam.stats.totalEleves * 100) 
                                                : 0}%`,
                                            backgroundColor: exam.stats.complets === exam.stats.totalEleves 
                                                ? '#10b981' : '#f59e0b'
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="card-middle-grid">
                                <div className="m-item">
                                    <span className="m-val">{exam.stats.moyenne}</span>
                                    <span className="m-lab">Moyenne</span>
                                </div>
                                <div className="m-item">
                                    <span className="m-val">{exam.stats.totalEleves}</span>
                                    <span className="m-lab">Total Promo</span>
                                </div>
                                <div className="m-item highlight-green">
                                    <span className="m-val">{exam.stats.complets}</span>
                                    <span className="m-lab">Complétés</span>
                                </div>
                                <div className="m-item highlight-orange">
                                    <span className="m-val">{exam.stats.incomplets}</span>
                                    <span className="m-lab">Incomplets</span>
                                </div>
                                <div className="m-item">
                                    <span className="m-val max">{exam.stats.max}</span>
                                    <span className="m-lab">Max Élève</span>
                                </div>
                                <div className="m-item">
                                    <span className="m-val min">{exam.stats.min}</span>
                                    <span className="m-lab">Min Élève</span>
                                </div>
                            </div>

                            <div className="card-bottom">
                                <Link 
                                    to={`/dashboard/${exam.typeExamen}`} 
                                    state={{ promotion: selectedPromotion, population: selectedPopulation }}
                                    className="btn-explore"
                                >
                                    Analyser
                                </Link>
                            </div>
                        </div>
                    ))}
                        </div>

                        {selectedPopulation === 'conseil' && (
                            <div className="leaderboard-enlarged-container">
                                <div className="leaderboard-custom-header">
                                    <div className="l-title-group">
                                        <h3><i className="fa fa-award"></i> Leaderboard Repêchage</h3>
                                        <p>Analyse comparative des gains de points après examen de conseil.</p>
                                    </div>
                                    <div className="l-action-bar" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                        
                                        {/* BOUTON D'AFFICHAGE/MASQUAGE DES COLONNES */}
                                        <div style={{ position: 'relative' }}>
                                            <button 
                                                onClick={() => setShowColMenu(!showColMenu)}
                                                style={{
                                                    backgroundColor: '#475569', color: 'white', padding: '0.7rem 1.2rem',
                                                    borderRadius: '0.7rem', border: 'none', cursor: 'pointer',
                                                    fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
                                                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                                                }}
                                            >
                                                <i className="fa fa-columns"></i> Colonnes
                                            </button>
                                            {showColMenu && (
                                                <div style={{
                                                    position: 'absolute', top: '110%', right: 0, background: 'white',
                                                    border: '1px solid #e2e8f0', zIndex: 50, padding: '15px', borderRadius: '8px',
                                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column',
                                                    gap: '10px', minWidth: '180px'
                                                }}>
                                                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem'}}>
                                                        <input type="checkbox" checked={visibleCols.decision} onChange={() => setVisibleCols({...visibleCols, decision: !visibleCols.decision})} /> Décision Conseil
                                                    </label>
                                                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem'}}>
                                                        <input type="checkbox" checked={visibleCols.motif} onChange={() => setVisibleCols({...visibleCols, motif: !visibleCols.motif})} /> Motif
                                                    </label>
                                                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem'}}>
                                                        <input type="checkbox" checked={visibleCols.initiale} onChange={() => setVisibleCols({...visibleCols, initiale: !visibleCols.initiale})} /> Initiale
                                                    </label>
                                                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem'}}>
                                                        <input type="checkbox" checked={visibleCols.repechage} onChange={() => setVisibleCols({...visibleCols, repechage: !visibleCols.repechage})} /> Repêchage
                                                    </label>
                                                    <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.9rem'}}>
                                                        <input type="checkbox" checked={visibleCols.gain} onChange={() => setVisibleCols({...visibleCols, gain: !visibleCols.gain})} /> Gain
                                                    </label>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={exportToPDF}
                                            style={{
                                                backgroundColor: '#ef4444', color: 'white', padding: '0.7rem 1.2rem',
                                                borderRadius: '0.7rem', border: 'none', cursor: 'pointer',
                                                fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px',
                                                boxShadow: '0 4px 6px rgba(239, 68, 68, 0.2)'
                                            }}
                                        >
                                            <i className="fa fa-file-pdf-o"></i> Exporter
                                        </button>
                                        
                                        <div className="l-filter-group">
                                            <label>Statut Conseil :</label>
                                            <select
                                                value={filterTypeConseil}
                                                // Quand la promotion change
                                                    onChange={(e) => { 
                                                        setSelectedPromotion(e.target.value); 
                                                        setSelectedPopulation('all');
                                                        localStorage.setItem('selectedPromotion', e.target.value);
                                                    }}
                                                        className="filter-select-mini"
                                            >
                                                <option value="all">Tous les statuts</option>
                                                <option value="redoublant">Redoublants</option>
                                                <option value="ajournes_all">Tous les Ajournés (3m & 6m)</option>
                                                <option value="ajourne_3m">Ajournés 3m</option>
                                                <option value="ajourne_6m">Ajournés 6m</option>
                                            </select>
                                        </div>
                                        <div className="l-search-group">
                                            <i className="fa fa-search"></i>
                                            <input
                                                type="text"
                                                placeholder="Rechercher..."
                                                value={searchConseil}
                                                onChange={(e) => setSearchConseil(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="leaderboard-table-area no-scroll-global">
                                    <table className="custom-leader-table">
                                        <thead>
                                            <tr>
                                                <th>Rang & Identification</th>
                                                {visibleCols.decision && <th className="center">Décision Conseil</th>}
                                                {visibleCols.motif && <th className="center">Motif</th>}
                                                {visibleCols.initiale && <th className="center">Initiale</th>}
                                                {visibleCols.repechage && <th className="center">Repêchage</th>}
                                                {visibleCols.gain && <th className="center">Gain</th>}
                                                <th className="center">Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredLeaderboard.length > 0 ? (
                                                filteredLeaderboard.map((st, idx) => renderLeaderboardRow(st, idx))
                                            ) : (
                                                <tr><td colSpan="7" className="empty-state">Aucun élève trouvé dans cette catégorie.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {generalSummary && (
                            <div className="general-recap-panel">
                                <div className="panel-header">BILAN GÉNÉRAL : {selectedPopulation.toUpperCase()}</div>
                                <div className="mini-cards-flexbox">
                                    <div className="m-card">
                                        <h5>Effectif Total</h5>
                                        <div className="v">{countStudents}</div>
                                        <div className="card-legend">Total population</div>
                                    </div>
                                    <div className="m-card clickable green" onClick={() => {
                                        const list = filteredSourceData.filter(s => parseFloat(s.moyenne) >= 12).map(s => ({
                                            ...s,
                                            fullName: `${formatPrenom(s.prenom)} ${formatNom(s.nom)}`,
                                            actionBtn: (<button className="btn-table-action" onClick={(e) => { e.stopPropagation(); setModalData(null); setSelectedStudent(s); }}>Dossier</button>)
                                        }));
                                        showModal('Admis (Moy ≥ 12)', [
                                            { key: 'fullName', header: 'Nom & Prénom' },
                                            { key: 'numero_incorporation', header: 'N° Inc.' },
                                            { key: 'escadron', header: 'Escadron' },
                                            { key: 'peloton', header: 'Peloton' },
                                            { key: 'moyenne', header: 'Note' },
                                            { key: 'actionBtn', header: 'Action' }
                                        ], list);
                                    }}>
                                        <h5>Validés</h5>
                                        <div className="v">{countSup12}</div>
                                        <div className="card-legend">Moyenne ≥ 12</div>
                                    </div>

                                    <div className="m-card clickable blue" onClick={() => {
                                        const list = filteredSourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < 12).map(s => ({
                                            ...s,
                                            fullName: `${formatPrenom(s.prenom)} ${formatNom(s.nom)}`,
                                            actionBtn: (<button className="btn-table-action" onClick={(e) => { e.stopPropagation(); setModalData(null); setSelectedStudent(s); }}>Dossier</button>)
                                        }));
                                        showModal('Inférieur à 12 (Moy < 12)', [
                                            { key: 'fullName', header: 'Nom & Prénom' },
                                            { key: 'numero_incorporation', header: 'N° Inc.' },
                                            { key: 'escadron', header: 'Escadron' },
                                            { key: 'peloton', header: 'Peloton' },
                                            { key: 'moyenne', header: 'Note' },
                                            { key: 'actionBtn', header: 'Action' }
                                        ], list);
                                    }}>
                                        <h5>Inférieur à 12</h5>
                                        <div className="v">{countInf12}</div>
                                        <div className="card-legend">Moyenne &lt; 12</div>
                                    </div>

                                    <div className="m-card clickable red" onClick={() => {
                                        const list = filteredSourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < parseFloat(ajournementThreshold)).map(s => ({
                                            ...s,
                                            fullName: `${formatPrenom(s.prenom)} ${formatNom(s.nom)}`,
                                            actionBtn: (<button className="btn-table-action" onClick={(e) => { e.stopPropagation();  setModalData(null);setSelectedStudent(s); }}>Dossier</button>)
                                        }));
                                        showModal(`Simulation Ajournement (< ${ajournementThreshold})`, [
                                            { key: 'fullName', header: 'Nom & Prénom' },
                                            { key: 'numero_incorporation', header: 'N° Inc.' },
                                            { key: 'escadron', header: 'Escadron' },
                                            { key: 'peloton', header: 'Peloton' },
                                            { key: 'moyenne', header: 'Note' },
                                            { key: 'actionBtn', header: 'Action' }
                                        ], list);
                                    }}>
                                        <h5>Simulation</h5>
                                        <div className="threshold-input" onClick={e => e.stopPropagation()}>
                                            <input type="number" step="0.1" value={ajournementThreshold} onChange={e => setAjournementThreshold(e.target.value)} />
                                        </div>
                                        <div className="v">{countAjournement}</div>
                                        <div className="card-legend">Simulation d'ajournement</div>
                                    </div>

                                    {/* CARTE CONDITIONNELLE : Réussite/Motif pour le "conseil", sinon Redoublement pour les autres */}
                                    {selectedPopulation === 'conseil' ? (
                                        <div className="m-card clickable orange" onClick={() => {
                                            showModal('Répartition de Réussite par Motif (≥ 12)', [
                                                {key:'motif', header:'Motif'},
                                                {key:'total', header:'Effectif Total'},
                                                {key:'admis', header:'Admis (≥12)'},
                                                {key:'taux', header:'Taux Réussite'}
                                            ], motifStats);
                                        }}>
                                            <h5>Réussite / Motif</h5>
                                            <div className="v">{totalTauxReussite}</div>
                                            <div className="card-legend">Cliquez pour le détail</div>
                                        </div>
                                    ) : (
                                        <div className="m-card clickable orange" onClick={() => {
                                            const list = filteredSourceData.filter(s => (s.consultationMax >= 45 || s.consultationDays >= 60) || (s.moyenne && s.moyenne < 8) || s.totalARDays >= 20).map(s => ({
                                                ...s,
                                                fullName: `${formatPrenom(s.prenom)} ${formatNom(s.nom)}`,
                                                actionBtn: (<button className="btn-table-action" onClick={(e) => { e.stopPropagation(); setModalData(null); setSelectedStudent(s); }}>Dossier</button>)
                                            }));
                                            showModal('Alerte Redoublement (Critères cumulés)', [{key:'fullName', header:'Nom & Prénom'}, {key:'actionBtn', header:'Action'}], list);
                                        }}>
                                            <h5>Redoublement</h5>
                                            <div className="v">{countRedoublement}</div>
                                            <div className="card-legend">Critères cumulés</div>
                                        </div>
                                    )}
                                </div>
                                <div className="panel-footer-btn"> 
                                  <Link 
                                        to="/dashboard/general" 
                                        state={{ promotion: selectedPromotion, population: selectedPopulation }}
                                        className="btn-full-view"
                                    >
                                        Accéder au Dashboard Détaillé 
                                    </Link>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {selectedStudent && (
                <StudentDetailsModal
                    student={selectedStudent}
                    typeExamen="General"
                    examSubjects={[]}
                     selectedPromotion={selectedPromotion}
                    onClose={() => setSelectedStudent(null)}
                />
            )}

            {modalData && (
                <DashboardModal
                    title={modalTitle}
                    data={modalData}
                    columns={modalColumns}
                    onClose={() => setModalData(null)}
                />
            )}
        </div>
    );
};

export default Dashboard;
