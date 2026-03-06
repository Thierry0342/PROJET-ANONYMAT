import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FiPrinter, FiPlusCircle, FiArchive, FiTrash2, FiAlertTriangle, FiFolder, FiArrowLeft, FiUsers } from 'react-icons/fi';
import './CreerCodesMatiere.css';

const PreviewModal = ({ codes, onConfirm, onCancel, matiereNom, examenNom, promotion, populationLabel }) => {
    const getPrintContent = () => {
        const title = `<h3>${matiereNom} - ${examenNom}</h3><p style="text-align:center; margin-top:-10px;"><strong>Promo: ${promotion} | Cible: ${populationLabel}</strong></p>`;
        const codePairs = codes.map(code =>
            `<div class="code-item">${code}</div><div class="code-item">${code}</div>`
        ).join('');
        return `${title}<div class="print-grid">${codePairs}</div>`;
    };
    const handlePrint = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write('<html><head><title>Impression Codes</title><style>body { font-family: sans-serif; margin: 15px; } .print-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; } .code-item { border: 1.5px solid black; padding: 10px 5px; font-size: 16px; font-weight: bold; text-align: center; } h3, p { text-align: center; margin: 5px; }</style></head><body>');
        printWindow.document.write(getPrintContent());
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    };
    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Prévisualisation des codes</h2>
                <div className="modal-body"><div dangerouslySetInnerHTML={{ __html: getPrintContent() }} /></div>
                <div className="modal-footer">
                    <button onClick={onCancel} className="btn-secondary">Annuler</button>
                    <button onClick={() => { handlePrint(); onConfirm(); }} className="btn-primary"><FiPrinter /> Imprimer & Enregistrer</button>
                </div>
            </div>
        </div>
    );
};

const CreerCodesMatiere = () => {
    const [matieres, setMatieres] = useState([]);
    const [examens, setExamens] = useState([]);
    const [selectedMatiere, setSelectedMatiere] = useState('');
    const [selectedExamen, setSelectedExamen] = useState('');
    const [selectedPromotion, setSelectedPromotion] = useState('79E');
    const [selectedPopulation, setSelectedPopulation] = useState('all');
    const [nombreCodes, setNombreCodes] = useState(10);
    const [historique, setHistorique] = useState([]);
    const [viewingPromotion, setViewingPromotion] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [codesAPrevisualiser, setCodesAPrevisualiser] = useState([]);
    const [dataPourSauvegarde, setDataPourSauvegarde] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const populations = [
    { id: 'all', label: 'Toute la promotion (Mixte)' },
    { id: 'actif', label: 'Liste Originale (Actifs)' },
    { id: 'conseil', label: 'Liste Conseil (Redoublants & Ajournés)' } // Groupe unique
];

    const promotionsList = Array.from({ length: 81 }, (_, i) => `${70 + i}E`);

    const fetchData = async () => {
        const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
        try {
            const [resM, resE, resL] = await Promise.all([
                axios.get('/api/matieres', config),
                axios.get('/api/examens', config),
                axios.get('/api/codes/lots', config)
            ]);
            setMatieres(resM.data); setExamens(resE.data); setHistorique(resL.data);
        } catch (err) { console.error(err); }
    };

    useEffect(() => { fetchData(); }, []);

    const groupedHistory = historique.reduce((acc, lot) => {
        const promo = lot.promotion || 'Inconnue';
        if (!acc[promo]) acc[promo] = { lots: [], totalCodes: 0 };
        acc[promo].lots.push(lot);
        acc[promo].totalCodes += lot.nombre_codes;
        return acc;
    }, {});

    const handlePreview = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
        try {
            const res = await axios.post('/api/codes/previsualiser', { matiereId: selectedMatiere, nombreCodes }, config);
            setCodesAPrevisualiser(res.data.codes);
            setDataPourSauvegarde({
                matiereId: selectedMatiere, typeExamen: selectedExamen,
                promotion: selectedPromotion, population: selectedPopulation, codes: res.data.codes
            });
            setIsModalOpen(true);
        } catch (err) { alert('Erreur lors de la génération'); } finally { setIsLoading(false); }
    };

    const handleConfirmSave = async () => {
        const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
        try {
            await axios.post('/api/codes/sauvegarder', dataPourSauvegarde, config);
            setIsModalOpen(false); fetchData();
        } catch (err) { alert('Erreur de sauvegarde'); }
    };

    const getPopLabel = (id) => populations.find(p => p.id === id)?.label || id;

    return (
        <div className="creer-codes-container">
            {isModalOpen && (
                <PreviewModal 
                    codes={codesAPrevisualiser} 
                    onConfirm={handleConfirmSave} 
                    onCancel={() => setIsModalOpen(false)} 
                    matiereNom={matieres.find(m => m.id.toString() === selectedMatiere)?.nom_matiere} 
                    examenNom={selectedExamen} 
                    promotion={selectedPromotion}
                    populationLabel={getPopLabel(selectedPopulation)}
                />
            )}

            <div className="generation-section">
                <h2><FiPlusCircle /> Générer des codes anonymes</h2>
                <form onSubmit={handlePreview} className="creer-codes-form">
                    <div className="form-group"><label>Promotion</label>
                        <select value={selectedPromotion} onChange={e => setSelectedPromotion(e.target.value)}>
                            {promotionsList.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>Population Cible</label>
                        <select value={selectedPopulation} onChange={e => setSelectedPopulation(e.target.value)} style={{border: '2px solid #3182ce', fontWeight: 'bold'}}>
                            {populations.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>Matière</label>
                        <select value={selectedMatiere} onChange={e => setSelectedMatiere(e.target.value)} required>
                            <option value="">-- Choisir --</option>
                            {matieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>Examen</label>
                        <select value={selectedExamen} onChange={e => setSelectedExamen(e.target.value)} required>
                            <option value="">-- Type --</option>
                            {examens.map(ex => <option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>Nombre de codes</label>
                        <input type="number" value={nombreCodes} onChange={e => setNombreCodes(e.target.value)} min="1" required />
                    </div>
                    <button type="submit" className="btn-primary" disabled={isLoading}>Générer & Prévisualiser</button>
                </form>
            </div>

            <div className="historique-section">
                {!viewingPromotion ? (
                    <>
                        <h2><FiArchive /> Historique par Promotion</h2>
                        <div className="historique-grid">
                            {Object.entries(groupedHistory).map(([promo, data]) => (
                                <div key={promo} className="lot-card promo-folder-card" onClick={() => setViewingPromotion(promo)}>
                                    <div className="lot-card-header" style={{backgroundColor: '#f39c12'}}><FiFolder size={24} /><h3>Promotion {promo}</h3></div>
                                    <div className="lot-card-body"><p><strong>{data.lots.length}</strong> lot(s)</p><p><strong>{data.totalCodes}</strong> codes</p></div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        <div className="detail-header" style={{display:'flex', gap:'20px', marginBottom: '20px'}}>
                            <button onClick={() => setViewingPromotion(null)} className="btn-secondary"><FiArrowLeft /> Retour</button>
                            <h2>Codes Promotion {viewingPromotion}</h2>
                        </div>
                        <div className="historique-grid">
                            {groupedHistory[viewingPromotion]?.lots.map(lot => (
                                <div key={lot.id} className="lot-card">
                                    <div className="lot-card-header"><h3>{lot.nom_matiere}</h3><span>{lot.type_examen}</span></div>
                                    <div className="lot-card-body">
                                        <p style={{fontSize: '0.85rem', color: '#e67e22', fontWeight: 'bold'}}><FiUsers /> {getPopLabel(lot.population)}</p>
                                        <p>Codes: {lot.nombre_codes}</p>
                                        <p>{new Date(lot.date_generation).toLocaleDateString()}</p>
                                    </div>
                                    <div className="lot-card-footer" style={{display:'flex', gap:'10px'}}>
                                        <button onClick={async () => {
                                            const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
                                            const res = await axios.get(`/api/codes/lot/${lot.id}`, config);
                                            const printWindow = window.open('', '_blank');
                                            printWindow.document.write(`<html><body style="font-family:monospace;"><h3>${lot.nom_matiere} - ${getPopLabel(lot.population)}</h3><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;">${res.data.codes.map(c => `<div style="border:1px solid black;padding:5px;text-align:center;">${c}</div><div style="border:1px solid black;padding:5px;text-align:center;">${c}</div>`).join('')}</div></body></html>`);
                                            printWindow.document.close(); printWindow.print();
                                        }} className="btn-success" title="Réimprimer"><FiPrinter /></button>
                                        <button onClick={async () => {
                                            if(window.confirm("Supprimer ce lot ?")) {
                                                const config = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
                                                await axios.delete(`/api/codes/lot/${lot.id}`, config);
                                                fetchData();
                                            }
                                        }} className="btn-danger" title="Supprimer"><FiTrash2 /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default CreerCodesMatiere;
