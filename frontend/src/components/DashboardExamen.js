import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as xlsx from 'xlsx';

import DashboardModal from './DashboardModal';
import StudentDetailsModal from './StudentDetailsModal';
import './DashboardRedesign.css';
import { EXTERNAL_API_BASE_URL } from '../config/apiConfig';

const normalizeStudentData = (s) => {
    if (!s) return s;
    return {
        ...s,
        id: s.id || s.eleve_id || s.eleveId,
        numero_incorporation: s.numero_incorporation || s.numeroIncorporation || s.incorp
    };
};

const formatNom = (nom) => nom ? nom.toUpperCase() : '';
// ── Mention — même barème que côté backend (getMention dans server.js) ──
const getMention = (moyenne) => {
    if (moyenne === null || moyenne === undefined || isNaN(moyenne)) return 'Non classé';
    const m = parseFloat(moyenne);
    if (m >= 18) return 'Excellent';
    if (m >= 16) return 'Très Bien';
    if (m >= 14) return 'Bien';
    if (m >= 12) return 'Assez Bien';
    if (m >= 10) return 'Passable';
    return 'Insuffisant';
};
const formatPrenom = (prenom) => {
    if (!prenom) return '';
    return prenom.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const StatCardRedesign = ({ title, value, subValue, onClick, highlight = false, isLoading = false, icon, onExportExcel, onExportPdf }) => (
    <div className={`stat-card-redesign ${onClick ? 'clickable' : ''} ${highlight ? 'highlight' : ''}`} onClick={onClick}>
        <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0 }}>{title}</h4>
            <div className="card-icons" style={{ display: 'flex', gap: '8px' }}>
                {onExportPdf && <i className="fa fa-file-pdf-o action-icon pdf-icon" onClick={(e) => { e.stopPropagation(); onExportPdf(); }} title="Exporter en PDF" style={{ color: '#dc3545', cursor: 'pointer' }}></i>}
                {onExportExcel && <i className="fa fa-file-excel-o action-icon excel-icon" onClick={(e) => { e.stopPropagation(); onExportExcel(); }} title="Exporter en Excel" style={{ color: '#28a745', cursor: 'pointer' }}></i>}
                {icon && <i className={`fa ${icon} stat-icon`}></i>}
            </div>
        </div>
        <p>{isLoading ? '...' : value}</p>
        {subValue && <span className="stat-subval">{subValue}</span>}
    </div>
);

const SidebarStatItem = ({ label, value }) => (
    <li className="sidebar-stat-item">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
    </li>
);

const getOverlappingDays = (start1, end1, limitStart, limitEnd) => {
    if (!start1) return 0;
    const s1 = new Date(start1).getTime();
    const e1 = end1 ? new Date(end1).getTime() : s1;
    const s2 = limitStart ? new Date(limitStart).getTime() : -Infinity;
    const e2 = limitEnd ? new Date(limitEnd).getTime() : Infinity;
    const maxStart = Math.max(s1, s2);
    const minEnd = Math.min(e1, e2);
    if (maxStart <= minEnd) {
        return Math.ceil((minEnd - maxStart) / (1000 * 60 * 60 * 24)) + 1;
    }
    return 0;
};

const exportDataToExcel = (title, columns, data) => {
    const worksheetData = data.map(row => {
        const obj = {};
        columns.forEach(col => {
            if (col.key !== 'actionBtn') obj[col.header] = typeof row[col.key] === 'object' ? '-' : row[col.key];
        });
        return obj;
    });
    const worksheet = xlsx.utils.json_to_sheet(worksheetData);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Export");
    xlsx.writeFile(workbook, `${title.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
};

const exportDataToPdf = (title, columns, data) => {
    const doc = new jsPDF();
    doc.text(title, 14, 15);
    const tableColumns = columns.filter(c => c.key !== 'actionBtn').map(c => c.header);
    const tableData = data.map(row =>
        columns.filter(c => c.key !== 'actionBtn').map(c => typeof row[c.key] === 'object' ? '-' : row[c.key])
    );
    autoTable(doc, { head: [tableColumns], body: tableData, startY: 20 });
    doc.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
};

const DashboardExamen = () => {
    const { typeExamen } = useParams();
    const location = useLocation();
    const [elevesIncomplets, setElevesIncomplets] = useState([]);
    const [searchIncomplets, setSearchIncomplets] = useState('');
    // Garde la trace du modal actuellement ouvert pour le rafraîchir en live (ex: recherche)
    const [activeModalType, setActiveModalType] = useState(null);

    const selectedPromotion = location.state?.promotion
        || localStorage.getItem('selectedPromotion')
        || 'all';
    const selectedPopulation = location.state?.population || 'actif';
    const apiPopulation = selectedPopulation === 'total' ? 'all' : selectedPopulation;

    const [summary, setSummary] = useState(null);
    const [details, setDetails] = useState(null);
    const [subjectStats, setSubjectStats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [modalData, setModalData] = useState(null);
    const [modalTitle, setModalTitle] = useState('');
    const [modalColumns, setModalColumns] = useState([]);
    const [isModalLoading, setIsModalLoading] = useState(false);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [classementWithRawDetails, setClassementWithRawDetails] = useState([]);
    const [isDataReady, setIsDataReady] = useState(false);
    const [examConfigForPromotion, setExamConfigForPromotion] = useState(null);

    const getFilteredIncomplets = useCallback((term) => {
        const search = (term || '').toLowerCase();
        return elevesIncomplets.filter(s => {
            const nomComplet = `${s.prenom} ${s.nom}`.toLowerCase();
            const incorp = String(s.numero_incorporation || '').toLowerCase();
            return nomComplet.includes(search) || incorp.includes(search);
        });
    }, [elevesIncomplets]);

    // Construit les lignes du modal "Élèves Incomplets" à partir du terme de recherche
    const buildIncompletsModalData = useCallback((term) => {
        const filtered = getFilteredIncomplets(term);
        return filtered.map((s, index) => ({
            ...s,
            numeroOrdre: index + 1,
            nomComplet: `${s.prenom} ${s.nom}`,
            matiereManquantesDisplay: Array.isArray(s.matiereManquantes) && s.matiereManquantes.length > 0
                ? s.matiereManquantes.join(', ')
                : '—',
            progression: `${s.notesPresentes}/${s.totalMatieres} matières`,
            actionBtn: (
                <button className="btn-details-action"
                    onClick={(e) => { e.stopPropagation(); handleStudentSelectFromModal(s); }}>
                    <i className="fa fa-eye"></i> Détail
                </button>
            )
        }));
    }, [getFilteredIncomplets]);

    const openIncompletsModal = () => {
        setActiveModalType('incomplets');
        setModalTitle(`Élèves Incomplets (${elevesIncomplets.length})`);
        setModalColumns([
            { key: 'numeroOrdre',              header: 'N° Ordre'             },
            { key: 'nomComplet',               header: 'Nom Complet'          },
            { key: 'numero_incorporation',     header: 'N° Inc.'              },
            { key: 'progression',              header: 'Progression'          },
            { key: 'matiereManquantesDisplay', header: 'Matières Manquantes'  },
            { key: 'actionBtn',               header: 'Action'               }
        ]);
        setModalData(buildIncompletsModalData(searchIncomplets));
        setIsModalLoading(false);
    };

    // Recalcule les données + le titre du modal Incomplets à chaque frappe dans la recherche
    useEffect(() => {
        if (activeModalType !== 'incomplets') return;
        const filteredCount = getFilteredIncomplets(searchIncomplets).length;
        setModalData(buildIncompletsModalData(searchIncomplets));
        setModalTitle(
            searchIncomplets
                ? `Élèves Incomplets (${filteredCount}/${elevesIncomplets.length})`
                : `Élèves Incomplets (${elevesIncomplets.length})`
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchIncomplets, activeModalType, elevesIncomplets]);

    const closeModal = () => {
        setModalData(null);
        setActiveModalType(null);
        setSearchIncomplets('');
    };

    // ── Export classement complet PDF ─────────────────────────────────────────
    const handleExportClassementPDF = () => {
        const doc = new jsPDF();

        // En-tête
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text("SECRETARIAT D'ETAT / CGN / EGN AMBOSITRA", 55, 15, { align: 'center' });
        doc.text("REPOBLIKAN'I MADAGASIKARA", 155, 15, { align: 'center' });

        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(
            `CLASSEMENT — ${typeExamen.replace(/_/g, ' ')}`,
            105, 35, { align: 'center' }
        );
        if (selectedPromotion !== 'all') {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            doc.text(`Promotion : ${selectedPromotion}`, 105, 43, { align: 'center' });
        }

        const classes = filteredClassement.filter(s => s.rang != null);
        const nonClasses = filteredClassement.filter(s => s.rang == null);
        const ordonne = [...classes, ...nonClasses];

        const body = ordonne.map(s => [
            s.rang != null ? s.rang : 'Non classé',
            `${formatNom(s.nom)} ${formatPrenom(s.prenom)}`,
            s.numero_incorporation || '',
            s.moyenne != null ? s.moyenne : '-'
        ]);

        autoTable(doc, {
            startY: selectedPromotion !== 'all' ? 50 : 43,
            head: [['RANG', 'NOM ET PRÉNOM', 'N° INCORPORATION', 'MOYENNE']],
            body,
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
                0: { halign: 'center', cellWidth: 25 },
                1: { halign: 'left' },
                2: { halign: 'center', cellWidth: 40 },
                3: { halign: 'center', cellWidth: 25 }
            }
        });

        const dateStr = new Date().toLocaleDateString('fr-FR');
        const finalY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Édité le ${dateStr}`, 14, finalY);

        doc.save(`Classement_${typeExamen}_${selectedPromotion}.pdf`);
    };

    // ── Export classement complet Excel ───────────────────────────────────────
// ── Export classement complet Excel ───────────────────────────────────────
    const handleExportClassementExcel = () => {
        const classes = filteredClassement.filter(s => s.rang != null);
        const nonClasses = filteredClassement.filter(s => s.rang == null);
        const ordonne = [...classes, ...nonClasses];

        const data = ordonne.map(s => ({
            'RANG': s.rang != null ? s.rang : 'Non classé',
            'NOM ET PRÉNOM': `${formatNom(s.nom)} ${formatPrenom(s.prenom)}`,
            'ESCADRON': s.escadron || '-',
            'PELOTON': s.peloton || '-',
            'N° INCORPORATION': s.numero_incorporation || '',
            'MOYENNE': s.moyenne != null ? s.moyenne : '-',
            'MENTION': getMention(s.moyenne)
        }));

        const ws = xlsx.utils.json_to_sheet(data);

        // Largeurs colonnes
        ws['!cols'] = [
            { wch: 12 }, // RANG
            { wch: 35 }, // NOM ET PRÉNOM
            { wch: 12 }, // ESCADRON
            { wch: 12 }, // PELOTON
            { wch: 20 }, // N° INCORPORATION
            { wch: 12 }, // MOYENNE
            { wch: 15 }  // MENTION
        ];

        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, `${typeExamen}`);
        xlsx.writeFile(wb, `Classement_${typeExamen}_${selectedPromotion}.xlsx`);
    };

    useEffect(() => {
        if (!typeExamen) return;
        setClassementWithRawDetails([]);
        setIsDataReady(false);
        setLoading(true);

        const fetchData = async () => {
    try {
        const token = localStorage.getItem('token');
        const headers = { Authorization: `Bearer ${token}` };

        const [summaryRes, detailsRes, subjectsRes, configRes, incompletRes] = await Promise.all([
            axios.get(`/api/dashboard/summary-by-exam-type?promotion=${selectedPromotion}&population=${apiPopulation}`, { headers }),
            axios.get(`/api/resultats/classement-details?typeExamen=${typeExamen}&promotion=${selectedPromotion}&population=${apiPopulation}`, { headers }),
            axios.get(`/api/dashboard/exam-subject-stats/${typeExamen}?promotion=${selectedPromotion}`, { headers }),
            // ✅ CORRECTION : filtrer par promotion pour avoir les bonnes matières configurées
            axios.get(`/api/configuration/examens?promotion=${selectedPromotion}`, { headers }),
            axios.get(`/api/resultats/sans-note-complete?typeExamen=${typeExamen}&promotion=${selectedPromotion}&population=${apiPopulation}`, { headers })
        ]);

        setElevesIncomplets(incompletRes.data || []);

        const examConfig = configRes.data.find(c => c.nom_modele === typeExamen);
        if (examConfig) {
            if (examConfig.date_debut) setStartDate(examConfig.date_debut.split('T')[0]);
            if (examConfig.date_fin) setEndDate(examConfig.date_fin.split('T')[0]);
        }

        // ✅ Stocker la config pour recalcul des matières manquantes dans la card
        setExamConfigForPromotion(examConfig || null);  // ← nouveau state à ajouter

        const examSummary = summaryRes.data.find(e => e.typeExamen === typeExamen);

        if (detailsRes.data) {
            setSummary(examSummary || {
                typeExamen,
                stats: { totalEleves: 0, participants: 0, complets: 0, incomplets: 0, moyenne: '0.00', min: '0.00', max: '0.00' }
            });
            const normalizedClassement = (detailsRes.data.classement || []).map(normalizeStudentData);
            setDetails({ ...detailsRes.data, classement: normalizedClassement });
            setSubjectStats(subjectsRes.data || []);
        } else {
            setError(`Aucune donnée pour l'examen : ${typeExamen.replace(/_/g, ' ')}`);
        }
    } catch (err) {
        setError('Impossible de charger les données.');
    } finally {
        setLoading(false);
    }
};

        fetchData();
    }, [typeExamen, apiPopulation, selectedPromotion]);

    useEffect(() => {
        if (!details || details.classement.length === 0) return;
        if (isDataReady) return;

        let isMounted = true;

        const fetchAllExtraData = async () => {
            const rawStudents = details.classement;
            const courNormalise = selectedPromotion ? selectedPromotion.replace(/[^0-9]/g, '') : '';
            const incorporations = rawStudents.map(s => String(s.numero_incorporation));

            try {
                const [sancRes, consultRes, absenceRes] = await Promise.allSettled([
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/sanctions/bulk`,
                        { incorporations, cour: courNormalise }, { timeout: 5000 }),
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/consultation/bulk`,
                        { incorporations, cour: courNormalise }, { timeout: 5000 }),
                    axios.post(`${EXTERNAL_API_BASE_URL}/api/absence/bulk`,
                        { incorporations, cour: courNormalise }, { timeout: 5000 })
                ]);

                const allSanctions     = sancRes.status    === 'fulfilled' ? sancRes.value.data    : [];
                const allConsultations = consultRes.status === 'fulfilled' ? consultRes.value.data : [];
                const allAbsences      = absenceRes.status === 'fulfilled' ? absenceRes.value.data : [];

                const consultationsMap = {};
                allConsultations.forEach(c => {
                    const incorp = String(c.Eleve?.numeroIncorporation || '');
                    if (!consultationsMap[incorp]) consultationsMap[incorp] = [];
                    consultationsMap[incorp].push(c);
                });

                const absencesMap = {};
                allAbsences.forEach(a => {
                    const incorp = String(a.Eleve?.numeroIncorporation || '');
                    if (!absencesMap[incorp]) absencesMap[incorp] = [];
                    absencesMap[incorp].push(a);
                });

                const sanctionsMap = {};
                allSanctions.forEach(s => {
                    const incorp = String(s.Eleve?.numeroIncorporation || '');
                    if (!sanctionsMap[incorp]) sanctionsMap[incorp] = [];
                    sanctionsMap[incorp].push(s);
                });

                const allEnrichedStudents = rawStudents.map(student => {
                    const incorp = String(student.numero_incorporation || '').trim();
                    return {
                        ...student,
                        rawConsultations: consultationsMap[incorp] || [],
                        rawAbsences:      absencesMap[incorp]      || [],
                        sanctionCount:    (sanctionsMap[incorp]    || []).length
                    };
                });

                if (isMounted) {
                    setClassementWithRawDetails(allEnrichedStudents);
                    setIsDataReady(true);
                }
            } catch (err) {
                if (isMounted) {
                    setClassementWithRawDetails(rawStudents);
                    setIsDataReady(true);
                }
            }
        };

        fetchAllExtraData();
        return () => { isMounted = false; };
    }, [details, isDataReady, selectedPromotion]);

    const sourceDataDynamique = useMemo(() => {
        if (!isDataReady) return details ? details.classement : [];
        return classementWithRawDetails.map(student => {
            let consultationDays = 0;
            if (Array.isArray(student.rawConsultations)) {
                student.rawConsultations.forEach(c => {
                    const dateArriveEffective = c.dateArrive || new Date().toISOString();
                    consultationDays += getOverlappingDays(c.dateDepart, dateArriveEffective, startDate, endDate);
                });
            }
            let absenceDays = 0;
            if (Array.isArray(student.rawAbsences)) {
                student.rawAbsences.forEach(a => {
                    const dateCible = a.date || a.dateDebut || a.createdAt || new Date();
                    if (getOverlappingDays(dateCible, dateCible, startDate, endDate) > 0) absenceDays++;
                });
            }
            return { ...student, consultationDays, absenceDays };
        });
    }, [classementWithRawDetails, isDataReady, startDate, endDate, details]);

    const showModalWithData = (title, columns, data) => {
        setActiveModalType(null);
        setModalTitle(title);
        setModalColumns(columns);
        setModalData(data);
        setIsModalLoading(false);
    };

    const handleStudentSelectFromModal = (student) => {
        setModalData(null);
        setActiveModalType(null);
        setSelectedStudent(student);
    };

    const sourceData = sourceDataDynamique;
    const totalStudents = sourceData.length;

    const elevesEnDifficulte   = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < 10);
    const matieresReussite     = subjectStats.filter(m => m.moyenne >= 12);
    const matieresEchec        = subjectStats.filter(m => m.moyenne < 12);
    const studentsSup12        = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) >= 12);
    const countSup12           = studentsSup12.length;
    const percentSup12         = totalStudents > 0 ? ((countSup12 / totalStudents) * 100).toFixed(1) : '0.0';
    const studentsInf12        = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne) < 12);
    const countInf12           = studentsInf12.length;
    const percentInf12         = totalStudents > 0 ? ((countInf12 / totalStudents) * 100).toFixed(1) : '0.0';
    const validMoyennes        = sourceData.filter(s => s.moyenne !== null).map(s => parseFloat(s.moyenne));
    const minMoyenneVal        = validMoyennes.length > 0 ? Math.min(...validMoyennes).toFixed(2) : '0.00';
    const maxMoyenneVal        = validMoyennes.length > 0 ? Math.max(...validMoyennes).toFixed(2) : '0.00';
    const studentsWithMin      = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne).toFixed(2) === minMoyenneVal);
    const studentsWithMax      = sourceData.filter(s => s.moyenne !== null && parseFloat(s.moyenne).toFixed(2) === maxMoyenneVal);
    const elevesConsultation   = sourceData.filter(s => s.consultationDays > 0).sort((a, b) => b.consultationDays - a.consultationDays);
    const countConsultations   = isDataReady ? elevesConsultation.length : '...';
    const elevesSanctionnes    = sourceData.filter(s => s.sanctionCount > 0).sort((a, b) => b.sanctionCount - a.sanctionCount);
    const countSanctions       = isDataReady ? elevesSanctionnes.length : '...';
    const elevesIndisponibles  = sourceData.filter(s => s.absenceDays > 0 || s.consultationDays > 0);
    const countIndisponibles   = isDataReady ? elevesIndisponibles.length : '...';

    const mapMoyenne = (list) => list.map(s => ({
        ...s,
        nomComplet: `${s.prenom} ${s.nom}`,
        actionBtn: <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); handleStudentSelectFromModal(s); }}><i className="fa fa-eye"></i> Détail</button>
    }));

    const standardColumns = [
        { key: 'rang',               header: 'Rang'          },
        { key: 'nomComplet',         header: 'Nom'           },
        { key: 'numero_incorporation', header: 'N° Inc.'     },
        { key: 'moyenne',            header: 'Moyenne'       },
        { key: 'actionBtn',          header: 'Action'        }
    ];

    const handleSup12Click      = () => showModalWithData('Élèves Moyenne ≥ 12', standardColumns, mapMoyenne(studentsSup12));
    const handleInf12Click      = () => showModalWithData('Élèves Moyenne < 12', standardColumns, mapMoyenne(studentsInf12));
    const handleMaxClick        = () => showModalWithData(`Meilleure Moyenne (${maxMoyenneVal})`, standardColumns, mapMoyenne(studentsWithMax));
    const handleMinClick        = () => showModalWithData(`Moyenne la plus basse (${minMoyenneVal})`, standardColumns, mapMoyenne(studentsWithMin));
    const handleDifficulteClick = () => showModalWithData('Élèves en Difficulté (< 10/20)', standardColumns, mapMoyenne(elevesEnDifficulte));

    const handleAbsentsClick = () => {
    if (!isDataReady) return;
    const mappedData = elevesIndisponibles.map(s => ({
        ...s,
        nomComplet: `EG ${s.prenom} ${s.nom}`,
        numero: s.numero_incorporation,
        motifIndisponibilite: s.consultationDays > 0 && s.absenceDays > 0
            ? `Consultation Externe (${s.consultationDays}j) / Absence Total(${s.absenceDays}j)`
            : (s.consultationDays > 0
                ? `Consultation Médicale (${s.consultationDays}j)`
                : `Absence (${s.absenceDays}j)`),
        totalJours: s.absenceDays,
        actionBtn: <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); handleStudentSelectFromModal(s); }}><i className="fa fa-eye"></i> Détail</button>
    })).sort((a, b) => b.totalJours - a.totalJours);

    showModalWithData('Absents / Indisponibles', [
        { key: 'rang',                 header: 'Rang'        },
        { key: 'nomComplet',           header: 'Nom'         },
        { key: 'numero',               header: 'N° Inc.'     },
        { key: 'escadron',             header: 'Escadron'    },
        { key: 'peloton',              header: 'Peloton'     },
        { key: 'motifIndisponibilite', header: 'Motif'       },
        { key: 'totalJours',           header: 'Total Jours' },
        { key: 'actionBtn',            header: 'Action'      }
    ], mappedData);
};

   const handleConsultationClick = () => {
    if (!isDataReady) return;
    showModalWithData('Élèves avec le plus de jours de consultation',
        [
            { key: 'rang', header: 'Rang' },
            { key: 'nomComplet', header: 'Nom Complet' },
            { key: 'numero_incorporation', header: 'N° Inc.' },
            { key: 'escadron', header: 'Escadron' },
            { key: 'peloton', header: 'Peloton' },
            { key: 'consultationDays', header: 'Jours Consultation' },
            { key: 'actionBtn', header: 'Action' }
        ],
        mapMoyenne(elevesConsultation)
    );
};

    const handleSanctionsClick = () => {
        if (!isDataReady) return;
        const mappedData = elevesSanctionnes.map(s => ({
            ...s,
            nomComplet: `${s.prenom} ${s.nom}`,
            incorporation: s.numero_incorporation,
            sanctionCountDisplay: `${s.sanctionCount} sanction(s)`,
            actionBtn: <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); handleStudentSelectFromModal(s); }}><i className="fa fa-eye"></i> Détail</button>
        }));
        showModalWithData('Liste des Élèves Sanctionnés',
            [{ key: 'rang', header: 'Rang' }, { key: 'nomComplet', header: 'Nom' }, { key: 'incorporation', header: 'Incorp.' }, { key: 'sanctionCountDisplay', header: 'Nombre' }, { key: 'actionBtn', header: 'Action' }],
            mappedData
        );
    };

    const filteredClassement = useMemo(() => {
        const search = (searchTerm || '').toLowerCase();
        const filtered = (sourceData || []).filter(student => {
            const fullName = `${student.prenom || ''} ${student.nom || ''}`.toLowerCase();
            const incorp   = (student.numero_incorporation || '').toLowerCase();
            return fullName.includes(search) || incorp.includes(search);
        });
        const classes    = filtered.filter(s => s.rang != null);
        const nonClasses = filtered.filter(s => s.rang == null);
        return [...classes, ...nonClasses];
    }, [sourceData, searchTerm]);

    if (loading) return <div className="card"><h2>Chargement...</h2></div>;
    if (error)   return <div className="card"><h2>{error}</h2></div>;
    if (!summary || !details) return <div className="card"><h2>Aucune donnée disponible.</h2></div>;

    return (
        <div className="dashboard-redesign-container">
            {modalData && (
                <DashboardModal
                    title={modalTitle}
                    data={modalData}
                    columns={modalColumns}
                    onClose={closeModal}
                    isLoading={isModalLoading}
                    onRowClick={handleStudentSelectFromModal}
                    searchValue={activeModalType === 'incomplets' ? searchIncomplets : undefined}
                    onSearchChange={activeModalType === 'incomplets' ? setSearchIncomplets : undefined}
                    searchPlaceholder="Rechercher par nom ou n° incorporation..."
                />
            )}

            {selectedStudent && (
                <StudentDetailsModal
                    student={selectedStudent}
                    examSubjects={details.matieres}
                    typeExamen={typeExamen}
                    startDate={startDate}
                    endDate={endDate}
                    selectedPromotion={selectedPromotion}
                    onClose={() => setSelectedStudent(null)}
                />
            )}

            {/* ── En-tête ── */}
            <div className="top-header-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="header-left">
                    <Link to="/dashboard" className="back-btn-circle" title="Retour au menu">
                        <i className="fa fa-arrow-left"></i>
                    </Link>
                    <h1>{typeExamen.replace(/_/g, ' ')}</h1>
                    {selectedPromotion !== 'all' && (
                        <span className="promotion-badge">Promotion : {selectedPromotion}</span>
                    )}
                </div>

                <div className="header-right-filters" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {/* ── Boutons export classement complet ── */}
                    <button
                        onClick={handleExportClassementPDF}
                        disabled={filteredClassement.length === 0}
                        style={{
                            backgroundColor: '#dc3545', color: 'white',
                            padding: '0.6rem 1.1rem', borderRadius: '8px',
                            border: 'none', cursor: 'pointer', fontWeight: 'bold',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            opacity: filteredClassement.length === 0 ? 0.5 : 1
                        }}
                        title="Exporter le classement complet en PDF"
                    >
                        <i className="fa fa-file-pdf-o"></i> PDF
                    </button>
                    <button
                        onClick={handleExportClassementExcel}
                        disabled={filteredClassement.length === 0}
                        style={{
                            backgroundColor: '#28a745', color: 'white',
                            padding: '0.6rem 1.1rem', borderRadius: '8px',
                            border: 'none', cursor: 'pointer', fontWeight: 'bold',
                            display: 'flex', alignItems: 'center', gap: '7px',
                            opacity: filteredClassement.length === 0 ? 0.5 : 1
                        }}
                        title="Exporter le classement complet en Excel"
                    >
                        <i className="fa fa-file-excel-o"></i> Excel
                    </button>

                    <div className="filter-group">
                        <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Début Période :</label>
                        <input type="date" className="form-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="filter-group">
                        <label style={{ fontSize: '12px', fontWeight: 'bold' }}>Fin Période :</label>
                        <input type="date" className="form-control" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                    </div>
                </div>
            </div>

            {/* ── Cards stats ── */}
            <div className="dashboard-redesign-header">
                <div className="stats-grid">
                    <StatCardRedesign
                        title="Total Promotion"
                        value={summary?.stats?.totalEleves || 0}
                        subValue="Élèves inscrits"
                        icon="fa-graduation-cap"
                    />
                    <StatCardRedesign
                        title="Dossiers Complets"
                        value={summary?.stats?.complets || 0}
                        subValue={`${summary?.stats?.totalEleves > 0 ? ((summary.stats.complets / summary.stats.totalEleves) * 100).toFixed(1) : 0}% complétés`}
                        highlight={summary?.stats?.complets === summary?.stats?.totalEleves}
                        icon="fa-check-square"
                    />
                    <StatCardRedesign
                        title="Dossiers Incomplets"
                        value={summary?.stats?.incomplets || 0}
                        subValue="Notes manquantes"
                        highlight={summary?.stats?.incomplets > 0}
                        icon="fa-exclamation-circle"
                        onClick={openIncompletsModal}
                    />
                    <StatCardRedesign title="Participants"       value={summary.stats.participants} icon="fa-users" />
                    <StatCardRedesign
                        title="Moyenne Max" value={maxMoyenneVal} subValue="Note la plus haute"
                        onClick={handleMaxClick} highlight icon="fa-trophy"
                        onExportExcel={() => exportDataToExcel("Meilleure_Moyenne", standardColumns, mapMoyenne(studentsWithMax))}
                        onExportPdf={()   => exportDataToPdf  ("Meilleure_Moyenne", standardColumns, mapMoyenne(studentsWithMax))}
                    />
                    <StatCardRedesign
                        title="Moyenne Min" value={minMoyenneVal} subValue="Note la plus basse"
                        onClick={handleMinClick} icon="fa-arrow-down"
                        onExportExcel={() => exportDataToExcel("Pire_Moyenne", standardColumns, mapMoyenne(studentsWithMin))}
                        onExportPdf={()   => exportDataToPdf  ("Pire_Moyenne", standardColumns, mapMoyenne(studentsWithMin))}
                    />
                    <StatCardRedesign
                        title="Moyenne ≥ 12" value={countSup12} subValue={`${percentSup12}% des élèves`}
                        onClick={handleSup12Click} highlight icon="fa-check-circle"
                        onExportExcel={() => exportDataToExcel("Eleves_Admis", standardColumns, mapMoyenne(studentsSup12))}
                        onExportPdf={()   => exportDataToPdf  ("Eleves_Admis", standardColumns, mapMoyenne(studentsSup12))}
                    />
                    <StatCardRedesign
                        title="Moyenne < 12" value={countInf12} subValue={`${percentInf12}% des élèves`}
                        onClick={handleInf12Click} highlight={countInf12 > 0} icon="fa-exclamation-triangle"
                        onExportExcel={() => exportDataToExcel("Eleves_Echec", standardColumns, mapMoyenne(studentsInf12))}
                        onExportPdf={()   => exportDataToPdf  ("Eleves_Echec", standardColumns, mapMoyenne(studentsInf12))}
                    />
                    <StatCardRedesign
                            title="Consultations Externes" value={countConsultations} isLoading={!isDataReady}
                            onClick={handleConsultationClick}
                            highlight={isDataReady && typeof countConsultations === 'number' && countConsultations > 0}
                            icon="fa-medkit"
                            onExportExcel={() => exportDataToExcel("Consultations", [
                                { key: 'rang', header: 'Rang' },
                                { key: 'nomComplet', header: 'Nom' },
                                { key: 'numero_incorporation', header: 'N° Inc.' },
                                { key: 'escadron', header: 'Escadron' },
                                { key: 'peloton', header: 'Peloton' },
                                { key: 'consultationDays', header: 'Jours' }
                            ], mapMoyenne(elevesConsultation))}
                            onExportPdf={() => exportDataToPdf("Consultations", [
                                { key: 'rang', header: 'Rang' },
                                { key: 'nomComplet', header: 'Nom' },
                                { key: 'numero_incorporation', header: 'N° Inc.' },
                                { key: 'escadron', header: 'Escadron' },
                                { key: 'peloton', header: 'Peloton' },
                                { key: 'consultationDays', header: 'Jours' }
                            ], mapMoyenne(elevesConsultation))}
                        />
                    <StatCardRedesign
                        title="Élèves Sanctionnés" value={countSanctions} isLoading={!isDataReady}
                        onClick={handleSanctionsClick}
                        highlight={isDataReady && typeof countSanctions === 'number' && countSanctions > 0}
                        icon="fa-gavel"
                        onExportExcel={() => exportDataToExcel("Sanctions", [{ key: 'rang', header: 'Rang' }, { key: 'nomComplet', header: 'Nom' }, { key: 'sanctionCount', header: 'Nombre' }], mapMoyenne(elevesSanctionnes))}
                        onExportPdf={()   => exportDataToPdf  ("Sanctions", [{ key: 'rang', header: 'Rang' }, { key: 'nomComplet', header: 'Nom' }, { key: 'sanctionCount', header: 'Nombre' }], mapMoyenne(elevesSanctionnes))}
                    />
                    <StatCardRedesign
                            title="Absents / Indisponibles" value={countIndisponibles} isLoading={!isDataReady}
                            onClick={handleAbsentsClick} icon="fa-user-times"
                            onExportExcel={() => exportDataToExcel("Absents_Indisponibles", [
                                { key: 'rang', header: 'Rang' },
                                { key: 'nomComplet', header: 'Nom' },
                                { key: 'escadron', header: 'Escadron' },
                                { key: 'peloton', header: 'Peloton' },
                                { key: 'motifIndisponibilite', header: 'Motif' }
                            ], mapMoyenne(elevesIndisponibles))}
                            onExportPdf={() => exportDataToPdf("Absents_Indisponibles", [
                                { key: 'rang', header: 'Rang' },
                                { key: 'nomComplet', header: 'Nom' },
                                { key: 'escadron', header: 'Escadron' },
                                { key: 'peloton', header: 'Peloton' },
                                { key: 'motifIndisponibilite', header: 'Motif' }
                            ], mapMoyenne(elevesIndisponibles))}
                        />
                    <StatCardRedesign
                        title="Élèves < 10/20" value={elevesEnDifficulte.length}
                        onClick={handleDifficulteClick} icon="fa-times-circle"
                        onExportExcel={() => exportDataToExcel("Eleves_Difficulte", standardColumns, mapMoyenne(elevesEnDifficulte))}
                        onExportPdf={()   => exportDataToPdf  ("Eleves_Difficulte", standardColumns, mapMoyenne(elevesEnDifficulte))}
                    />
                </div>
            </div>

            {/* ── Layout principal ── */}
            <div className="dashboard-examen-layout">
                <div className="sidebar-area">
                    <div className="card">
                        <h3 className="content-title"><i className="fa fa-thumbs-up" style={{ color: '#28a745' }}></i> Matières ≥ 12/20 ({matieresReussite.length})</h3>
                        <ul className="sidebar-stats-list">
                            {matieresReussite.map(m => (
                                <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />
                            ))}
                        </ul>
                    </div>
                    <div className="card">
                        <h3 className="content-title"><i className="fa fa-thumbs-down" style={{ color: '#dc3545' }}></i> Matières &lt; 12/20 ({matieresEchec.length})</h3>
                        <ul className="sidebar-stats-list">
                            {matieresEchec.map(m => (
                                <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="main-content-area">
                    <div className="ranking-card">
                        <div className="ranking-card-header">
                            <h3 className="content-title">Classement de l'Examen</h3>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <div className="search-bar-container">
                                    <input
                                        type="text"
                                        placeholder="Rechercher par nom ou incorp..."
                                        className="search-input"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>
                            </div>
                        </div>

                       <div className="table-responsive-dashboard">
                        <table>
                            <thead>
                                <tr>
                                    <th>Rang</th>
                                    <th>Nom Complet</th>
                                    <th>Escadron</th>
                                    <th>Peloton</th>
                                    <th>Incorporation</th>
                                    <th>Moyenne</th>
                                    <th style={{ width: '150px' }}>Statut Pendant Examen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClassement.map(s => (
                                    <tr
                                        key={s.id || s.numero_incorporation || Math.random()}
                                        onClick={() => setSelectedStudent(s)}
                                        className="clickable-row"
                                    >
                                        <td><strong>{s.rang}</strong></td>
                                        <td>{s.prenom} {s.nom}</td>
                                        <td>{s.escadron || '-'}</td>
                                        <td>{s.peloton || '-'}</td>
                                        <td>{s.numero_incorporation}</td>
                                        <td>{s.moyenne}</td>
                                        <td>
                                            {s.rang == null ? (
                                                <span
                                                    className="status-badge"
                                                    style={{ backgroundColor: '#6b7280' }}
                                                    title={s.motif_non_classe || 'Notes incomplètes'}
                                                >
                                                    <i className="fa fa-ban"></i> NON CLASSÉ
                                                </span>
                                            ) : null}
                                            <div className="badges-container">
                                                {s.consultationDays > 0 && (
                                                    <span className="status-badge consultation-badge" title={`${s.consultationDays} jour(s) de consultation`}>
                                                        <i className="fa fa-heartbeat"></i> {s.consultationDays} j
                                                    </span>
                                                )}
                                                {s.absenceDays > 0 && (
                                                    <span className="status-badge absence-badge" title={`${s.absenceDays} jour(s) d'absence`}>
                                                        <i className="fa fa-calendar-times-o"></i> {s.absenceDays} j
                                                    </span>
                                                )}
                                                {s.sanctionCount > 0 && (
                                                    <span className="status-badge sanction-badge" title={`${s.sanctionCount} sanction(s)`}>
                                                        <i className="fa fa-gavel"></i> {s.sanctionCount} S
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardExamen;
