import React, { useState, useEffect } from 'react';
import axios from 'axios';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './Resultats.css';

const IconExcel = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>;

const overlayStyles = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0, 0, 0, 0.6)',
    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, color: 'white', fontSize: '1.5rem',
};

const ClassementModal = ({ onClose, modeleExamen }) => {
    const [classementData, setClassementData] = useState({ classement: [], matieres: [] });
    const [loading, setLoading] = useState(true);
    const [promotion, setPromotion] = useState('all');
    const [population, setPopulation] = useState('all');
    const [promotions, setPromotions] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        axios.get('/api/promotions', { headers: { Authorization: `Bearer ${token}` } }).then(res => setPromotions(res.data));
    }, []);

    const fetchClassement = () => {
        setLoading(true);
        const token = localStorage.getItem('token');
        const url = `/api/resultats/classement-details?typeExamen=${modeleExamen || 'General'}&promotion=${promotion}&population=${population}`;
        axios.get(url, { headers: { Authorization: `Bearer ${token}` } })
            .then(res => {
                const sorted = res.data.classement.sort((a, b) => parseFloat(b.moyenne) - parseFloat(a.moyenne));
                setClassementData({ ...res.data, classement: sorted });
            })
            .catch(() => setClassementData({ classement: [], matieres: [] }))
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchClassement(); }, [modeleExamen, promotion, population]);

    const performExcelExport = () => {
        const token = localStorage.getItem('token');
        const url = `/api/resultats/exporter-classement-excel?typeExamen=${modeleExamen || 'General'}&promotion=${promotion}&population=${population}`;
        axios({ url, method: 'GET', headers: { Authorization: `Bearer ${token}` }, responseType: 'blob' })
        .then((response) => {
            const href = URL.createObjectURL(response.data);
            const link = document.createElement('a');
            link.href = href;
            link.setAttribute('download', `Classement_${modeleExamen}.xlsx`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
    };

    const performPrintSynthese = () => {
        const doc = new jsPDF();
        doc.text(`Classement ${modeleExamen} - ${population}`, 14, 15);
        autoTable(doc, {
            startY: 25,
            head: [['RANG', 'NOM ET PRÉNOM', 'MOYENNE']],
            body: classementData.classement.map(e => [e.rang, `${e.nom} ${e.prenom}`, e.moyenne])
        });
        doc.save(`Classement_${modeleExamen}.pdf`);
    };

    const filteredClassement = classementData.classement.filter(e => {
        const term = searchTerm.toLowerCase();
        return (e.nom?.toLowerCase().includes(term)) || (e.prenom?.toLowerCase().includes(term)) || (e.numero_incorporation?.toString().includes(term));
    });

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content large-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Classement - {modeleExamen}</h3>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <select value={promotion} onChange={e => setPromotion(e.target.value)}>
                            <option value="all">Toutes les promotions</option>
                            {promotions.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={population} onChange={e => setPopulation(e.target.value)}>
                            <option value="all">Toute la population</option>
                            <option value="actif">Actifs</option>
                            <option value="conseil">Conseil</option>
                        </select>
                    </div>
                    <button className="close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <input type="text" placeholder="Rechercher un élève..." className="search-input" style={{width: '100%', marginBottom: '15px', padding: '10px'}} onChange={e => setSearchTerm(e.target.value)} />
                    {loading ? <p>Chargement du classement...</p> : (
                        <div className="table-responsive">
                            <table className="results-table">
                                <thead>
                                    <tr>
                                        <th>Rang</th>
                                        <th>Prénom & Nom</th>
                                        <th>N° Incorp.</th>
                                        <th>Population</th>
                                        <th>Moyenne</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredClassement.length > 0 ? filteredClassement.map((eleve, i) => (
                                        <tr key={i}>
                                            <td><strong>{eleve.rang}</strong></td>
                                            <td>{eleve.prenom} {eleve.nom}</td>
                                            <td>{eleve.numero_incorporation}</td>
                                            <td><span className={`badge ${eleve.population}`}>{eleve.population?.toUpperCase()}</span></td>
                                            <td className={parseFloat(eleve.moyenne) >= 10 ? 'moyenne-success' : 'moyenne-danger'}>
                                                {eleve.moyenne}
                                            </td>
                                        </tr>
                                    )) : <tr><td colSpan="5" className="no-results">Aucune donnée trouvée.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="modal-actions" style={{justifyContent: 'space-between'}}>
                    <button className="btn-excel" onClick={performExcelExport}><IconExcel /> Exporter Excel</button>
                    <div>
                        <button className="btn-primary" onClick={performPrintSynthese} style={{marginRight: '10px'}}>Imprimer Synthèse</button>
                        <button className="btn-cancel" onClick={onClose}>Fermer</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClassementModal;
