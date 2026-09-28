import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { FiPrinter, FiPlusCircle, FiArchive, FiTrash2, FiFolder, FiArrowLeft, FiUsers, FiEye, FiSearch, FiRefreshCw } from 'react-icons/fi';
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

// ═══════════════════════════════════════════════════════════════════
// Suivi des codes : sans note / noté mais pas lié à un élève / déjà liés
// ═══════════════════════════════════════════════════════════════════
const ONGLETS_STATUT = [
    { id: 'sans_note',    label: 'Sans note',                   couleur: '#e53e3e' },
    { id: 'note_non_lie', label: 'Noté, pas lié à un élève',    couleur: '#dd6b20' },
    { id: 'lie',          label: 'Déjà liés',                   couleur: '#38a169' }
];

const StatutCodesModal = ({ matiereId, matiereNom, promotion, population, populationLabel, onClose }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [erreur, setErreur] = useState('');
    const [onglet, setOnglet] = useState('sans_note');
    const [recherche, setRecherche] = useState('');

    const charger = useCallback(async () => {
        setLoading(true); setErreur('');
        try {
            const res = await axios.get('/api/codes/statut-liaison', {
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                params: {
                    matiereId,
                    promotion,
                    population: population && population !== 'all' ? population : undefined
                }
            });
            setData(res.data);
        } catch (err) {
            setErreur(err.response?.data?.message || 'Erreur lors du chargement.');
        } finally { setLoading(false); }
    }, [matiereId, promotion, population]);

    useEffect(() => { charger(); }, [charger]);

    const codesAffiches = useMemo(() => {
        if (!data) return [];
        const terme = recherche.trim().toLowerCase();
        return data.codes
            .filter(c => c.statut === onglet)
            .filter(c => !terme || c.code.toLowerCase().includes(terme));
    }, [data, onglet, recherche]);

    const imprimer = () => {
        const titre = ONGLETS_STATUT.find(o => o.id === onglet)?.label;
        const w = window.open('', '_blank');
        w.document.write(`<html><head><title>${titre}</title><style>body{font-family:sans-serif;margin:15px}h3,p{text-align:center;margin:5px}.g{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:15px}.c{border:1px solid black;padding:8px 4px;text-align:center;font-family:monospace;font-weight:bold}</style></head><body><h3>${matiereNom} — ${titre}</h3><p>Promo ${promotion} | ${populationLabel} | ${codesAffiches.length} code(s)</p><div class="g">${codesAffiches.map(c => `<div class="c">${c.code}</div>`).join('')}</div></body></html>`);
        w.document.close(); w.print();
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content" style={{ maxWidth: '900px', width: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>État des codes — {matiereNom}</h2>
                        <small style={{ color: '#718096' }}>Promotion {promotion} · {populationLabel}</small>
                    </div>
                    <button className="btn-secondary" onClick={charger} title="Actualiser"><FiRefreshCw /></button>
                </div>

                {loading ? <p>Chargement...</p> : erreur ? <p style={{ color: '#e53e3e' }}>{erreur}</p> : data && (
                    <>
                        {/* Onglets */}
                        <div style={{ display: 'flex', gap: '8px', margin: '16px 0 10px', flexWrap: 'wrap' }}>
                            {ONGLETS_STATUT.map(o => {
                                const actif = onglet === o.id;
                                return (
                                    <button
                                        key={o.id}
                                        type="button"
                                        onClick={() => setOnglet(o.id)}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: '8px',
                                            border: `2px solid ${o.couleur}`,
                                            background: actif ? o.couleur : '#fff',
                                            color: actif ? '#fff' : o.couleur,
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {o.label} ({data.compteurs[o.id]})
                                    </button>
                                );
                            })}
                        </div>

                        {/* Recherche + impression */}
                        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                            <div style={{ position: 'relative', flex: 1 }}>
                                <FiSearch style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#718096' }} />
                                <input
                                    type="text"
                                    value={recherche}
                                    onChange={e => setRecherche(e.target.value)}
                                    placeholder="Rechercher un code..."
                                    style={{ width: '100%', padding: '9px 10px 9px 32px', border: '1px solid #cbd5e0', borderRadius: '8px', boxSizing: 'border-box' }}
                                />
                            </div>
                            <button className="btn-secondary" onClick={imprimer} disabled={codesAffiches.length === 0}>
                                <FiPrinter /> Imprimer la liste
                            </button>
                        </div>

                        <div style={{ overflowY: 'auto', flex: 1, border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#f7fafc' }}>
                                    <tr>
                                        <th style={{ textAlign: 'left', padding: '8px' }}>Code</th>
                                        <th style={{ textAlign: 'left', padding: '8px' }}>Population</th>
                                        {onglet !== 'sans_note' && <th style={{ textAlign: 'left', padding: '8px' }}>Examen</th>}
                                        {onglet !== 'sans_note' && <th style={{ textAlign: 'left', padding: '8px' }}>Note</th>}
                                        <th style={{ textAlign: 'left', padding: '8px' }}>Remarque</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {codesAffiches.map(c => (
                                        <tr key={c.code} style={{ borderTop: '1px solid #edf2f7' }}>
                                            <td style={{ padding: '8px', fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</td>
                                            <td style={{ padding: '8px' }}>{c.population || '-'}</td>
                                            {onglet !== 'sans_note' && <td style={{ padding: '8px' }}>{c.type_examen || '-'}</td>}
                                            {onglet !== 'sans_note' && <td style={{ padding: '8px' }}>{c.note} / 20</td>}
                                            <td style={{ padding: '8px', fontSize: '0.85rem', color: '#dd6b20' }}>
                                                {onglet === 'sans_note' && c.note_en_attente && 'Note en attente de validation'}
                                                {onglet === 'note_non_lie' && c.liaison_en_attente && 'Liaison en attente de validation'}
                                            </td>
                                        </tr>
                                    ))}
                                    {codesAffiches.length === 0 && (
                                        <tr><td colSpan="5" style={{ textAlign: 'center', color: '#999', padding: '20px' }}>
                                            {recherche.trim() ? 'Aucun code trouvé.' : 'Aucun code dans cette catégorie.'}
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <small style={{ color: '#718096', marginTop: '6px' }}>
                            {codesAffiches.length} code(s) affiché(s) sur {data.compteurs.total} au total.
                        </small>
                    </>
                )}

                <div className="modal-footer" style={{ marginTop: '12px' }}>
                    <button onClick={onClose} className="btn-secondary">Fermer</button>
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
    const [isLoadingExamens, setIsLoadingExamens] = useState(false);
    const [isLoadingMatieres, setIsLoadingMatieres] = useState(false);
    const [selectedPopulation, setSelectedPopulation] = useState('all');
    const [nombreCodes, setNombreCodes] = useState(10);
    const [historique, setHistorique] = useState([]);
    const [viewingPromotion, setViewingPromotion] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [codesAPrevisualiser, setCodesAPrevisualiser] = useState([]);
    const [dataPourSauvegarde, setDataPourSauvegarde] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isStatutOpen, setIsStatutOpen] = useState(false);

    const getConfig = useCallback(() => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    }), []);

    const populations = [
        { id: 'all', label: 'Toute la promotion (Mixte)' },
        { id: 'actif', label: 'Liste Originale (Actifs)' },
        { id: 'conseil', label: 'Liste Conseil (Redoublants & Ajournés)' }
    ];

    const promotionsList = Array.from({ length: 81 }, (_, i) => `${70 + i}E`);

    const fetchData = useCallback(async () => {
        try {
            const [resM, resE, resL] = await Promise.all([
                axios.get('/api/matieres', getConfig()),
                axios.get('/api/examens', getConfig()),
                axios.get('/api/codes/lots', getConfig())
            ]);
            setMatieres(resM.data); setExamens(resE.data); setHistorique(resL.data);
        } catch (err) { console.error(err); }
    }, [getConfig]);

    const fetchHistorique = useCallback(async () => {
        try {
            const res = await axios.get('/api/codes/lots', getConfig());
            setHistorique(res.data);
        } catch (err) { console.error(err); }
    }, [getConfig]);

    useEffect(() => { fetchHistorique(); }, [fetchHistorique]);

    // 1) Promotion -> examens
    useEffect(() => {
        const load = async () => {
            setSelectedExamen('');
            setSelectedMatiere('');
            setMatieres([]);
            if (!selectedPromotion) { setExamens([]); return; }
            setIsLoadingExamens(true);
            try {
                const res = await axios.get(`/api/examens?promotion=${selectedPromotion}`, getConfig());
                setExamens(res.data);
            } catch { setExamens([]); }
            finally { setIsLoadingExamens(false); }
        };
        load();
    }, [selectedPromotion, getConfig]);

    // 2) Examen (+promotion) -> matières
    useEffect(() => {
        const load = async () => {
            setSelectedMatiere('');
            if (!selectedExamen || !selectedPromotion) { setMatieres([]); return; }
            setIsLoadingMatieres(true);
            try {
                const res = await axios.get(
                    `/api/matieres-par-examen?typeExamen=${selectedExamen}&promotion=${selectedPromotion}`,
                    getConfig()
                );
                setMatieres(res.data);
            } catch { setMatieres([]); }
            finally { setIsLoadingMatieres(false); }
        };
        load();
    }, [selectedExamen, selectedPromotion, getConfig]);

    useEffect(() => { fetchData(); }, [fetchData]);

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
        try {
            const res = await axios.post('/api/codes/previsualiser', { matiereId: selectedMatiere, nombreCodes }, getConfig());
            setCodesAPrevisualiser(res.data.codes);
            setDataPourSauvegarde({
                matiereId: selectedMatiere, typeExamen: selectedExamen,
                promotion: selectedPromotion, population: selectedPopulation, codes: res.data.codes
            });
            setIsModalOpen(true);
        } catch (err) { alert('Erreur lors de la génération'); } finally { setIsLoading(false); }
    };

    const handleConfirmSave = async () => {
        try {
            await axios.post('/api/codes/sauvegarder', dataPourSauvegarde, getConfig());
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

            {isStatutOpen && selectedMatiere && (
                <StatutCodesModal
                    matiereId={selectedMatiere}
                    matiereNom={matieres.find(m => m.id.toString() === selectedMatiere)?.nom_matiere}
                    promotion={selectedPromotion}
                    population={selectedPopulation}
                    populationLabel={getPopLabel(selectedPopulation)}
                    onClose={() => setIsStatutOpen(false)}
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
                        <select value={selectedMatiere} onChange={e => setSelectedMatiere(e.target.value)}
                                disabled={!selectedExamen || isLoadingMatieres} required>
                            <option value="">-- Choisir --</option>
                            {matieres.map(m => <option key={m.id} value={m.id}>{m.nom_matiere}</option>)}
                        </select>
                        {selectedExamen && !isLoadingMatieres && matieres.length === 0 &&
                            <small style={{color:'#e53e3e'}}>Aucune matière configurée pour cet examen</small>}
                    </div>
                    <div className="form-group"><label>Examen</label>
                        <select value={selectedExamen} onChange={e => setSelectedExamen(e.target.value)}
                                disabled={!selectedPromotion || isLoadingExamens} required>
                            <option value="">-- Type --</option>
                            {examens.map(ex => <option key={ex.id} value={ex.nom_modele}>{ex.nom_modele}</option>)}
                        </select>
                        {selectedPromotion && !isLoadingExamens && examens.length === 0 &&
                            <small style={{color:'#e53e3e'}}>Aucun examen configuré pour {selectedPromotion}</small>}
                    </div>
                    <div className="form-group"><label>Nombre de codes</label>
                        <input type="number" value={nombreCodes} onChange={e => setNombreCodes(e.target.value)} min="1" required />
                    </div>
                    <button type="submit" className="btn-primary" disabled={isLoading}>Générer & Prévisualiser</button>
                    <button
                        type="button"
                        className="btn-secondary"
                        disabled={!selectedMatiere}
                        onClick={() => setIsStatutOpen(true)}
                        title="Voir les codes sans note, et ceux notés mais pas encore liés à un élève"
                    >
                        <FiEye /> Voir l'état des codes
                    </button>
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
                                            const res = await axios.get(`/api/codes/lot/${lot.id}`, getConfig());
                                            const printWindow = window.open('', '_blank');
                                            printWindow.document.write(`<html><body style="font-family:monospace;"><h3>${lot.nom_matiere} - ${getPopLabel(lot.population)}</h3><div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;">${res.data.codes.map(c => `<div style="border:1px solid black;padding:5px;text-align:center;">${c}</div><div style="border:1px solid black;padding:5px;text-align:center;">${c}</div>`).join('')}</div></body></html>`);
                                            printWindow.document.close(); printWindow.print();
                                        }} className="btn-success" title="Réimprimer"><FiPrinter /></button>
                                        <button onClick={async () => {
                                            if(window.confirm("Supprimer ce lot ?")) {
                                                await axios.delete(`/api/codes/lot/${lot.id}`, getConfig());
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
