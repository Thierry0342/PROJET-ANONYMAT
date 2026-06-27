import React, { useState, useEffect } from 'react';
import { Link, useNavigate ,useLocation } from 'react-router-dom';
import axios from 'axios';
import DashboardModal from './DashboardModal';
import StudentDetailsModal from './StudentDetailsModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './DashboardRedesign.css';
import { EXTERNAL_API_BASE_URL } from '../config/apiConfig';

const documentsList = [
    { id: 1, title: 'Liste des matieres aux examens', file: '/documents/LISTE DES MATIERES AUX EXAMENS.pdf' },
    { id: 2, title: 'Referentiele de formation de 79 em cours', file: '/documents/REFERENTIEL DE COMPETENCE ET DE FORMATION EG MISE A JOUR 14 FEV 25 OK.pdf' },
    { id: 3, title: 'Exécution des punitions', file: '/documents/Exécution des punitions.pdf' },
    { id: 4, title: 'Redoublement - Ajournement - Radiation', file: '/documents/REDOUBLEMENT-AJOURNEMENT-COMMISSION DE CONTRAT-RADIATION.pdf' },
    { id: 5, title: 'Sanctions', file: '/documents/sanction.pdf' }
];

const formatNom = (nom) => nom ? nom.toUpperCase() : '';
const formatPrenom = (prenom) => {
    if (!prenom) return '';
    return prenom.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
};

const normalizeStudentData = (s) => {
    if (!s) return s;
    return {
        ...s,
        id: s.id || s.eleve_id || s.eleveId,
        numero_incorporation: s.numero_incorporation || s.numeroIncorporation || s.incorp
    };
};

const StatCardRedesign = ({ title, value, subValue, onClick, highlight = false, isLoading = false, extraClass = '', icon }) => (
    <div className={`stat-card-redesign ${onClick ? 'clickable' : ''} ${highlight ? 'highlight' : ''} ${extraClass}`} onClick={onClick}>
        <div className="card-header-row">
            <h4>{title}</h4>
            {icon && <i className={`fa ${icon} stat-icon`}></i>}
        </div>
        <p>{isLoading ? '...' : value}</p>
        {subValue && <span className="stat-subval">{subValue}</span>}
    </div>
);

const StatCardInput = ({ title, count, threshold, onThresholdChange, onClick }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className={`stat-card-redesign input-card ${isOpen ? 'clickable' : ''}`} onClick={isOpen ? onClick : undefined}>
            <div className="card-header-row">
                <h4>{title}</h4>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <i className="fa fa-pause-circle stat-icon" style={{color: '#d9534f'}}></i>
                    <div onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        <i className={`fa ${isOpen ? 'fa-eye' : 'fa-eye-slash'}`}></i>
                    </div>
                </div>
            </div>
            {isOpen && (
                <div className="card-content-wrapper">
                    <div className="input-wrapper" onClick={(e) => e.stopPropagation()}>
                        <label>Seuil &lt; </label>
                        <input type="number" step="0.1" value={threshold} onChange={(e) => onThresholdChange(e.target.value)} className="stat-input" />
                    </div>
                    <p className="highlight-text">{count} Élèves</p>
                </div>
            )}
        </div>
    );
};

const SidebarStatItem = ({ label, value }) => (
    <li className="sidebar-stat-item">
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
    </li>
);

const generatePdfHeader = (doc, titleOverride = null) => {
    return (data) => {
        if (data.pageNumber === 1) {
            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            doc.text("SECRETARIAT D'ETAT / CGN / EGN AMBOSITRA", 55, 15, { align: 'center' });
            doc.text("REPOBLIKAN'I MADAGASIKARA", 155, 15, { align: 'center' });
            doc.setFontSize(11); doc.setFont("helvetica", "bold");
            const mainTitle = titleOverride ? titleOverride.toUpperCase() : "ETAT FAISANT CONNAITRE LES RESULTATS";
            doc.text(mainTitle, 105, 60, { align: 'center' });
        }
    };
};

const DashboardGeneral = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const selectedPromotion = location.state?.promotion || 'all';
    const rawPopulation = location.state?.population || 'all';
    const selectedPopulation = rawPopulation === 'total' ? 'actif' : rawPopulation;
    const [generalData, setGeneralData] = useState(null);
    const [detailedRanking, setDetailedRanking] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [classementWithDetails, setClassementWithDetails] = useState([]);
    const [isDataReady, setIsDataReady] = useState(false);
    const [motifStats, setMotifStats] = useState([]);
    const [modalData, setModalData] = useState(null);
    const [modalTitle, setModalTitle] = useState('');
    const [modalColumns, setModalColumns] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isDocModalOpen, setIsDocModalOpen] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [ajournementThreshold, setAjournementThreshold] = useState(9.0);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [decisionsSaved, setDecisionsSaved] = useState([]);

    const dataToDisplay = (isDataReady && classementWithDetails.length > 0) ? classementWithDetails : detailedRanking;

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` };
               const [summaryRes, rankingRes, decisionsRes] = await Promise.all([
                axios.get(`/api/dashboard/general-summary?promotion=${selectedPromotion}&population=${selectedPopulation}`, { headers }),
                axios.get(`/api/resultats/classement-details?typeExamen=General&promotion=${selectedPromotion}&population=${selectedPopulation}`, { headers }),
                axios.get('/api/decisions-conseil', { headers })
            ]);

                setGeneralData(summaryRes.data);
                const normalizedRanking = (rankingRes.data.classement || []).map(normalizeStudentData);
                setDetailedRanking(normalizedRanking);
                setDecisionsSaved(decisionsRes.data || []);
            } catch (err) {
                setError('Erreur de chargement');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
   }, [selectedPromotion, selectedPopulation]);

  useEffect(() => {
    if (!detailedRanking || detailedRanking.length === 0 || isDataReady) return;

    let isMounted = true;

    const fetchExtra = async () => {
        const incorporations = detailedRanking.map(s => String(s.numero_incorporation));
        const courNormalise = selectedPromotion ? selectedPromotion.replace(/[^0-9]/g, '') : '';
        try {
            // 3 requêtes parallèles au lieu de N*2
           const [sancRes, consultRes, absenceRes] = await Promise.allSettled([
              axios.get(`${EXTERNAL_API_BASE_URL}/api/sanctions`, { timeout: 5000 }),
               axios.post(`${EXTERNAL_API_BASE_URL}/api/consultation/bulk`,
                    { incorporations, cour: courNormalise },
                    { timeout: 5000 }
                ),
                axios.post(`${EXTERNAL_API_BASE_URL}/api/absence/bulk`,
                    { incorporations, cour: courNormalise },
                    { timeout: 5000 }
                )
            ]);

            const allSanctions     = sancRes.status    === 'fulfilled' ? sancRes.value.data    : [];
            const allConsultations = consultRes.status === 'fulfilled' ? consultRes.value.data : [];
            const allAbsences      = absenceRes.status === 'fulfilled' ? absenceRes.value.data : [];

            // Grouper consultations par incorporation
            const consultationsMap = {};
            allConsultations.forEach(c => {
                const incorp = String(c.Eleve?.numeroIncorporation || '');
                if (!consultationsMap[incorp]) consultationsMap[incorp] = [];
                consultationsMap[incorp].push(c);
            });

            // Grouper absences par incorporation
            const absencesMap = {};
            allAbsences.forEach(a => {
                const incorp = String(a.Eleve?.numeroIncorporation || '');
                if (!absencesMap[incorp]) absencesMap[incorp] = [];
                absencesMap[incorp].push(a);
            });

            // Calcul des motifs
            const motifsCount = {};
            allConsultations.forEach(c => {
                if (c.service) motifsCount[c.service] = (motifsCount[c.service] || 0) + 1;
            });
            allAbsences.forEach(a => {
                if (a.motif) motifsCount[a.motif] = (motifsCount[a.motif] || 0) + 1;
            });

            const enriched = detailedRanking.map(s => {
                const incorp = String(s.numero_incorporation || '').trim();

                const cData = consultationsMap[incorp] || [];
                const aData = absencesMap[incorp]      || [];

                const studentSanc = allSanctions.filter(sa =>
                    sa.Eleve && String(sa.Eleve.numeroIncorporation).trim() === incorp
                );

                return {
                    ...s,
                    consultationDays: cData.length,
                    sanctionCount:    studentSanc.length,
                    totalARDays:      studentSanc.length
                };
            });

            if (isMounted) {
                setMotifStats(Object.keys(motifsCount).map(k => ({ motif: k, count: motifsCount[k] })));
                setClassementWithDetails(enriched);
                setIsDataReady(true);
                setLoadingProgress(100);
            }
        } catch (e) {
            if (isMounted) {
                setClassementWithDetails(detailedRanking);
                setIsDataReady(true);
            }
        }
    };

    fetchExtra();
    return () => { isMounted = false; };
}, [detailedRanking, isDataReady, selectedPromotion]);

    const handleExportPDF = () => {
        const doc = new jsPDF();
        autoTable(doc, { head: [['RANG', 'NOM COMPLET', 'INCORP', 'MOYENNE']], body: dataToDisplay.map(s => [s.rang, `${formatNom(s.nom)} ${formatPrenom(s.prenom)}`, s.numero_incorporation, s.moyenne]), didDrawPage: generatePdfHeader(doc) });
        doc.save("Resultats_Generaux.pdf");
    };

    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(dataToDisplay);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Resultats");
        XLSX.writeFile(wb, "Resultats_Generaux.xlsx");
    };

    const handleExportModalPDF = () => {
        const doc = new jsPDF(); autoTable(doc, { head: [modalColumns.filter(c => c.key !== 'actionBtn').map(c => c.header)], body: modalData.map(d => modalColumns.filter(c => c.key !== 'actionBtn').map(c => d[c.key])) });
        doc.save(`${modalTitle}.pdf`);
    };

    const generateActionBtn = (s) => ( <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); setModalData(null); setSelectedStudent(s); }}> <i className="fa fa-eye"></i> Voir </button> );

    const handleSup12Click = () => {
        const list = dataToDisplay.filter(s => parseFloat(s.moyenne) >= 12).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Élèves Moyenne ≥ 12"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleInf12Click = () => {
        const list = dataToDisplay.filter(s => parseFloat(s.moyenne) < 12).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Élèves Moyenne < 12"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handlePropositionAjournementClick = () => {
        const list = dataToDisplay.filter(s => parseFloat(s.moyenne) < ajournementThreshold).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Proposition Ajournement"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleRedoublementClick = () => {
        const list = dataToDisplay.filter(s => (s.consultationDays || 0) >= 60 || parseFloat(s.moyenne) < 8).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Proposition Redoublement"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleMotifStatsClick = () => { setModalTitle("Motifs"); setModalColumns([{key:'motif', header:'Motif'},{key:'count', header:'Nombre'}]); setModalData(motifStats); };

    const handleConsultationClick = () => {
        const list = dataToDisplay.filter(s => (s.consultationDays || 0) > 0).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Santé");
        setModalColumns([{key:'nom', header:'Nom'},{key:'consultationDays', header:'Jours'},{key:'actionBtn', header:'Action'}]);
        setModalData(list);
    };

    const handleSanctionsClick = () => {
        const list = dataToDisplay.filter(s => (s.sanctionCount || 0) > 0).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Sanctions");
        setModalColumns([{key:'nom', header:'Nom'},{key:'sanctionCount', header:'Nombre'},{key:'actionBtn', header:'Action'}]);
        setModalData(list);
    };

    if (loading) return <div className="loader-wrapper"><p className="text">Chargement des données...</p></div>;

    const classementMatieres = generalData?.classementMatieres || [];
    const matieresReussite = classementMatieres.filter(m => parseFloat(m.moyenne) >= 12);
    const matieresEchec = classementMatieres.filter(m => parseFloat(m.moyenne) < 12);

    const filteredRanking = dataToDisplay.filter(s => {
        const searchStr = `${s.nom || ''} ${s.prenom || ''} ${s.numero_incorporation || ''}`.toLowerCase();
        return searchStr.includes((searchTerm || '').toLowerCase());
    });

    return (
        <div className="dashboard-redesign-container">
            {modalData && <DashboardModal title={modalTitle} data={modalData} columns={modalColumns} onClose={() => setModalData(null)} onExport={handleExportModalPDF} />}
            {selectedStudent && <StudentDetailsModal student={selectedStudent} typeExamen="General" selectedPromotion={selectedPromotion} onClose={() => setSelectedStudent(null)} />}

            <div className="top-header-section">
                <div className="header-left">
                    <Link to="/dashboard" className="back-btn-circle" title="Retour"><i className="fa fa-arrow-left"></i></Link>
                    <h1>Synthèse Générale</h1>
                    {selectedPromotion !== 'all' && (
                        <span style={{
                            background: '#3182ce', color: 'white',
                            padding: '4px 12px', borderRadius: '20px',
                            fontSize: '0.85rem', fontWeight: 'bold'
                        }}>
                            Promotion : {selectedPromotion}
                        </span>
                    )}
                </div>
                <div className="export-buttons">
                    <button onClick={() => navigate('/conseil-formation')} className="btn-export" style={{ backgroundColor: '#6c757d' }}><i className="fa fa-gavel"></i> Conseil Formation</button>
                    <button onClick={handleExportPDF} className="btn-export pdf-btn" disabled={dataToDisplay.length === 0}><i className="fa fa-file-pdf-o"></i> PDF</button>
                    <button onClick={handleExportExcel} className="btn-export excel-btn" disabled={dataToDisplay.length === 0}><i className="fa fa-file-excel-o"></i> Excel</button>
                </div>
            </div>

            <div className="dashboard-redesign-header">
                <div className="stats-grid">
                    <StatCardRedesign title="Effectif Total" value={detailedRanking.length} icon="fa-users" />
                    <StatCardRedesign title="Moyenne ≥ 12" value={dataToDisplay.filter(s => parseFloat(s.moyenne) >= 12).length} highlight onClick={handleSup12Click} icon="fa-check-circle" />
                    <StatCardRedesign title="Moyenne < 12" value={dataToDisplay.filter(s => parseFloat(s.moyenne) < 12).length} onClick={handleInf12Click} icon="fa-exclamation-triangle" />
                    <StatCardInput title="Prop. Ajournement" count={dataToDisplay.filter(s => parseFloat(s.moyenne) < ajournementThreshold).length} threshold={ajournementThreshold} onThresholdChange={setAjournementThreshold} onClick={handlePropositionAjournementClick} />
                    <StatCardRedesign title="Prop. Redoublement" value={dataToDisplay.filter(s => (s.consultationDays || 0) >= 60 || parseFloat(s.moyenne) < 8).length} onClick={handleRedoublementClick} extraClass="redoublement-card" icon="fa-history" />
                    <StatCardRedesign title="Répartition Motifs" value={motifStats.length} onClick={handleMotifStatsClick} icon="fa-pie-chart" />
                    <StatCardRedesign title="Santé Total" value={dataToDisplay.filter(s => (s.consultationDays || 0) > 0).length} onClick={handleConsultationClick} icon="fa-medkit" />
                    <StatCardRedesign title="Sanctions" value={dataToDisplay.filter(s => (s.sanctionCount || 0) > 0).length} onClick={handleSanctionsClick} icon="fa-gavel" />
                </div>
            </div>

            <div className="dashboard-examen-layout">
                <div className="sidebar-area">
                    <div className="card">
                        <h3 className="content-title"><i className="fa fa-thumbs-up" style={{color:'#28a745'}}></i> Matières ≥ 12 ({matieresReussite.length})</h3>
                        <ul className="sidebar-stats-list">{matieresReussite.map(m => <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />)}</ul>
                    </div>
                    <div className="card">
                        <h3 className="content-title"><i className="fa fa-thumbs-down" style={{color:'#dc3545'}}></i> Matières &lt; 12 ({matieresEchec.length})</h3>
                        <ul className="sidebar-stats-list">{matieresEchec.map(m => <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />)}</ul>
                    </div>
                </div>
                <div className="main-content-area">
                    <div className="ranking-card">
                        <div className="ranking-card-header">
                            <h3 className="content-title">Classement Général</h3>
                            <input type="text" placeholder="Recherche par nom, incorp..." className="search-input" onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="table-responsive-dashboard">
                            <table>
                                <thead><tr><th>Rang</th><th>Nom Complet</th><th>N° INC</th><th>Moyenne</th><th>Statut</th></tr></thead>
                                <tbody>
                                    {filteredRanking.map((s, i) => (
                                        <tr key={s.id || s.numero_incorporation || i} onClick={() => setSelectedStudent(s)} className="clickable-row">
                                            <td><strong>{s.rang}</strong></td>
                                            <td>{formatNom(s.nom)} {formatPrenom(s.prenom)}</td>
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
                                                    {decisionsSaved.some(d => d.eleve_id === s.id) && <span className="status-badge" style={{ backgroundColor: '#6f42c1' }}><i className="fa fa-gavel"></i> CONSEIL</span>}
                                                    {((s.consultationDays || 0) >= 60 || parseFloat(s.moyenne) < 8) && <span className="status-badge" style={{ backgroundColor: '#000' }}><i className="fa fa-history"></i> RED?</span>}
                                                    {(s.consultationDays || 0) > 0 && <span className="status-badge consultation-badge"><i className="fa fa-heartbeat"></i> {s.consultationDays}j</span>}
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

            <button className="floating-doc-btn" onClick={() => setIsDocModalOpen(true)} title="Documentation"><i className="fa fa-book"></i> Documentation</button>

            {isDocModalOpen && (
                <div className="doc-modal-overlay" onClick={() => { setIsDocModalOpen(false); setSelectedDoc(null); }}>
                    <div className="doc-modal-content" onClick={e => e.stopPropagation()} style={{ width: selectedDoc ? '80vw' : '500px', height: selectedDoc ? '90vh' : 'auto', display: 'flex', flexDirection: 'column' }}>
                        <div className="doc-modal-header" style={{ flexShrink: 0 }}>
                            {selectedDoc ? (
                                <h3 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <button onClick={() => setSelectedDoc(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '18px' }}>
                                        <i className="fa fa-arrow-left"></i>
                                    </button>
                                    {selectedDoc.title}
                                </h3>
                            ) : (
                                <h3>Documentation</h3>
                            )}
                            <button className="close-doc-btn" onClick={() => { setIsDocModalOpen(false); setSelectedDoc(null); }}>&times;</button>
                        </div>
                        <div className="doc-modal-body" style={{ flexGrow: 1, overflow: 'hidden', padding: selectedDoc ? '0' : '20px' }}>
                            {selectedDoc ? (
                                <iframe src={selectedDoc.file} width="100%" height="100%" style={{ border: 'none', display: 'block' }} title={selectedDoc.title}></iframe>
                            ) : (
                                <div className="doc-list">
                                    {documentsList.map(doc => (
                                        <div key={doc.id} className="doc-item" onClick={() => setSelectedDoc(doc)}>
                                            <i className="fa fa-file-pdf-o doc-icon"></i>
                                            <div className="doc-title">{doc.title}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DashboardGeneral;
