import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import DashboardModal from './DashboardModal';
import StudentDetailsModal from './StudentDetailsModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import './DashboardRedesign.css';

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

const StatCardRedesign = ({ title, value, subValue, onClick, highlight = false, isLoading = false, extraClass = '' }) => (
    <div className={`stat-card-redesign ${onClick ? 'clickable' : ''} ${highlight ? 'highlight' : ''} ${extraClass}`} onClick={onClick}>
        <h4>{title}</h4>
        <p>{isLoading ? '...' : value}</p>
        {subValue && <span style={{ fontSize: '0.8rem', color: '#666' }}>{subValue}</span>}
    </div>
);

const StatCardInput = ({ title, count, threshold, onThresholdChange, onClick }) => {
    const [isOpen, setIsOpen] = useState(true);
    return (
        <div className={`stat-card-redesign input-card ${isOpen ? 'clickable' : ''}`} onClick={isOpen ? onClick : undefined}>
            <div className="card-header-row">
                <h4>{title}</h4>
                <div onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} style={{ cursor: 'pointer' }}>
                    <i className={`fa ${isOpen ? 'fa-eye' : 'fa-eye-slash'}`}></i>
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
    const [ajournementThreshold, setAjournementThreshold] = useState(9.0);
    const [loadingProgress, setLoadingProgress] = useState(0);
    const [decisionsSaved, setDecisionsSaved] = useState([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                const token = localStorage.getItem('token');
                const headers = { Authorization: `Bearer ${token}` };
                const [summaryRes, rankingRes, decisionsRes] = await Promise.all([
                    axios.get('/api/dashboard/general-summary', { headers }),
                    axios.get('/api/resultats/classement-details?typeExamen=General', { headers }),
                    axios.get('/api/decisions-conseil', { headers })
                ]);
                setGeneralData(summaryRes.data);
                setDetailedRanking(rankingRes.data.classement || []);
                setDecisionsSaved(decisionsRes.data || []);
            } catch (err) { setError('Erreur de chargement'); } finally { setLoading(false); }
        };
        fetchData();
    }, []);

    useEffect(() => {
        if (!detailedRanking || detailedRanking.length === 0 || isDataReady) return;
        const fetchExtra = async () => {
            let enriched = []; let motifsCount = {};
            const sancRes = await axios.get('http://192.168.241.169:4000/api/sanctions');
            const allSanctions = sancRes.data || [];
            for (let i = 0; i < detailedRanking.length; i++) {
                const s = detailedRanking[i];
                const [cRes, aRes] = await Promise.allSettled([
                    axios.get(`http://192.168.241.169:4000/api/consultation/incorp/${s.numero_incorporation}`),
                    axios.get(`http://192.168.241.169:4000/api/absence/incorp/${s.numero_incorporation}`)
                ]);
                const cData = cRes.status === 'fulfilled' ? cRes.value.data : [];
                const aData = aRes.status === 'fulfilled' ? aRes.value.data : [];
                cData.forEach(c => { if(c.service) motifsCount[c.service] = (motifsCount[c.service] || 0) + 1; });
                aData.forEach(a => { if(a.motif) motifsCount[a.motif] = (motifsCount[a.motif] || 0) + 1; });
                const studentSanc = allSanctions.filter(sa => sa.Eleve && String(sa.Eleve.numeroIncorporation) === String(s.numero_incorporation));
                enriched.push({ ...s, consultationDays: cData.length, sanctionCount: studentSanc.length, totalARDays: studentSanc.length });
                setLoadingProgress(Math.round(((i + 1) / detailedRanking.length) * 100));
            }
            setMotifStats(Object.keys(motifsCount).map(k => ({ motif: k, count: motifsCount[k] })));
            setClassementWithDetails(enriched); setIsDataReady(true);
        };
        fetchExtra();
    }, [detailedRanking, isDataReady]);

    const handleExportPDF = () => {
        const doc = new jsPDF();
        autoTable(doc, { head: [['RANG', 'NOM COMPLET', 'INCORP', 'MOYENNE']], body: classementWithDetails.map(s => [s.rang, `${formatNom(s.nom)} ${formatPrenom(s.prenom)}`, s.numero_incorporation, s.moyenne]), didDrawPage: generatePdfHeader(doc) });
        doc.save("Resultats.pdf");
    };

    const handleExportExcel = () => {
        const ws = XLSX.utils.json_to_sheet(classementWithDetails);
        const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Resultats");
        XLSX.writeFile(wb, "Resultats.xlsx");
    };

    const handleExportModalPDF = () => {
        const doc = new jsPDF(); autoTable(doc, { head: [modalColumns.filter(c => c.key !== 'actionBtn').map(c => c.header)], body: modalData.map(d => modalColumns.filter(c => c.key !== 'actionBtn').map(c => d[c.key])) });
        doc.save(`${modalTitle}.pdf`);
    };

    const generateActionBtn = (s) => ( <button className="btn-details-action" onClick={(e) => { e.stopPropagation(); setModalData(null); setSelectedStudent(s); }}> <i className="fa fa-eye"></i> Voir </button> );

    const handleSup12Click = () => {
        const list = classementWithDetails.filter(s => parseFloat(s.moyenne) >= 12).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Élèves Moyenne ≥ 12"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleInf12Click = () => {
        const list = classementWithDetails.filter(s => parseFloat(s.moyenne) < 12).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Élèves Moyenne < 12"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handlePropositionAjournementClick = () => {
        const list = classementWithDetails.filter(s => parseFloat(s.moyenne) < ajournementThreshold).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Proposition Ajournement"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleRedoublementClick = () => {
        const list = classementWithDetails.filter(s => s.consultationDays >= 60 || s.moyenne < 8).map(s => ({ ...s, actionBtn: generateActionBtn(s) }));
        setModalTitle("Proposition Redoublement"); setModalColumns([{key:'nom', header:'Nom'},{key:'moyenne', header:'Moyenne'},{key:'actionBtn', header:'Action'}]); setModalData(list);
    };

    const handleMotifStatsClick = () => { setModalTitle("Motifs"); setModalColumns([{key:'motif', header:'Motif'},{key:'count', header:'Nombre'}]); setModalData(motifStats); };
    const handleConsultationClick = () => { setModalTitle("Santé"); setModalColumns([{key:'nom', header:'Nom'},{key:'consultationDays', header:'Jours'}]); setModalData(classementWithDetails.filter(s => s.consultationDays > 0)); };
    const handleSanctionsClick = () => { setModalTitle("Sanctions"); setModalColumns([{key:'nom', header:'Nom'},{key:'sanctionCount', header:'Nombre'}]); setModalData(classementWithDetails.filter(s => s.sanctionCount > 0)); };

    const filteredRanking = classementWithDetails.filter(s => `${s.nom} ${s.prenom} ${s.numero_incorporation}`.toLowerCase().includes(searchTerm.toLowerCase()));

    if (loading) return <div className="loader-wrapper"><p className="text">Chargement... {loadingProgress}%</p></div>;

    const { classementMatieres } = generalData;
    const matieresReussite = classementMatieres.filter(m => parseFloat(m.moyenne) >= 12);
    const matieresEchec = classementMatieres.filter(m => parseFloat(m.moyenne) < 12);

    return (
        <div className="dashboard-redesign-container">
            {modalData && <DashboardModal title={modalTitle} data={modalData} columns={modalColumns} onClose={() => setModalData(null)} onExport={handleExportModalPDF} />}
            {selectedStudent && <StudentDetailsModal student={selectedStudent} typeExamen="General" onClose={() => setSelectedStudent(null)} />}

            <div className="top-nav-bar">
                <Link to="/dashboard" className="back-link">&larr; Retour</Link>
                <div className="export-buttons">
                    <button onClick={() => navigate('/conseil-formation')} className="btn-export" style={{ backgroundColor: '#6c757d' }}><i className="fa fa-gavel"></i> Conseil de Formation</button>
                    <button onClick={handleExportPDF} className="btn-export pdf-btn" disabled={!isDataReady}>PDF Officiel</button>
                    <button onClick={handleExportExcel} className="btn-export excel-btn" disabled={!isDataReady}>Excel</button>
                </div>
            </div>

            <div className="dashboard-redesign-header">
                <h1>Synthèse Générale</h1>
                <div className="stats-grid">
                    <StatCardRedesign title="Effectif Total" value={detailedRanking.length} />
                    <StatCardRedesign title="Moyenne ≥ 12" value={classementWithDetails.filter(s => parseFloat(s.moyenne) >= 12).length} highlight onClick={handleSup12Click} />
                    <StatCardRedesign title="Moyenne < 12" value={classementWithDetails.filter(s => parseFloat(s.moyenne) < 12).length} onClick={handleInf12Click} />
                    <StatCardInput title="Prop. Ajournement" count={classementWithDetails.filter(s => parseFloat(s.moyenne) < ajournementThreshold).length} threshold={ajournementThreshold} onThresholdChange={setAjournementThreshold} onClick={handlePropositionAjournementClick} />
                    <StatCardRedesign title="Prop. Redoublement" value={classementWithDetails.filter(s => s.consultationDays >= 60 || s.moyenne < 8).length} onClick={handleRedoublementClick} extraClass="redoublement-card" />
                    <StatCardRedesign title="Répartition Motifs" value={motifStats.length} onClick={handleMotifStatsClick} />
                    <StatCardRedesign title="Santé Total" value={classementWithDetails.filter(s => s.consultationDays > 0).length} onClick={handleConsultationClick} />
                    <StatCardRedesign title="Sanctions" value={classementWithDetails.filter(s => s.sanctionCount > 0).length} onClick={handleSanctionsClick} />
                </div>
            </div>

            <div className="dashboard-examen-layout">
                <div className="sidebar-area">
                    <div className="card">
                        <h3>Matières ≥ 12 ({matieresReussite.length})</h3>
                        <ul className="sidebar-stats-list">{matieresReussite.map(m => <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />)}</ul>
                    </div>
                    <div className="card">
                        <h3>Matières &lt; 12 ({matieresEchec.length})</h3>
                        <ul className="sidebar-stats-list">{matieresEchec.map(m => <SidebarStatItem key={m.nom_matiere} label={m.nom_matiere} value={parseFloat(m.moyenne).toFixed(2)} />)}</ul>
                    </div>
                </div>
                <div className="main-content-area">
                    <div className="ranking-card">
                        <div className="ranking-card-header">
                            <h3>Classement Général</h3>
                            <input type="text" placeholder="Recherche..." className="search-input" onChange={e => setSearchTerm(e.target.value)} />
                        </div>
                        <div className="table-responsive-dashboard">
                            <table>
                                <thead><tr><th>Rang</th><th>Nom Complet</th><th>N° INC</th><th>Moyenne</th><th>Statut</th></tr></thead>
                                <tbody>
                                    {filteredRanking.map((s, i) => (
                                        <tr key={i} onClick={() => setSelectedStudent(s)} className="clickable-row">
                                            <td><strong>{s.rang}</strong></td>
                                            <td>{formatNom(s.nom)} {formatPrenom(s.prenom)}</td>
                                            <td>{s.numero_incorporation}</td>
                                            <td>{s.moyenne}</td>
                                            <td>
                                                <div className="badges-container">
                                                    {decisionsSaved.some(d => d.eleve_id === s.id) && <span className="status-badge" style={{ backgroundColor: '#6f42c1' }}>CONSEIL</span>}
                                                    {(s.consultationDays >= 60 || s.moyenne < 8) && <span className="status-badge" style={{ backgroundColor: '#000' }}>RED?</span>}
                                                    {s.consultationDays > 0 && <span className="status-badge consultation-badge">{s.consultationDays}j</span>}
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
        </div>
    );
};
export default DashboardGeneral;
