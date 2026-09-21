import React, { useState, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

import AuthPage from './components/AuthPage';
import WelcomePage from './components/WelcomePage';
import LierCode from './components/LierCode';
import NoterCopie from './components/NoterCopie';
import Resultats from './components/Resultats';
import CreerMatiere from './components/CreerMatiere';
import GestionUtilisateurs from './components/GestionUtilisateurs';
import ImporterEleves from './components/ImporterEleves';
import ImporterMatricules from './components/ImporterMatricules';
import ImporterCodes from './components/ImporterCodes';
import ImporterNotes from './components/ImporterNotes';
import CopiesNotees from './components/CopiesNotees';
import GestionAbsences from './components/GestionAbsences';
import SaisieDirecte from './components/SaisieDirecte';
import Inc1 from './components/IncognitoSwap';
import Inc2 from './components/IncognitoMoyenne';
import Dashboard from './components/Dashboard';
import DashboardGeneral from './components/DashboardGeneral';
import DashboardExamen from './components/DashboardExamen';
import CreerCodesMatiere from './components/CreerCodesMatiere';
import ConfigurationAssignation from './components/ConfigurationAssignation';
import ConseilFormation from './components/ConseilFormation';
import ListeEleves from './components/ListeEleves';
import Sidebar from './components/Sidebar';
import AnimatedNodeBackground from './components/AnimatedNodeBackground';
import GlobalActivityTracker from './components/GlobalActivityTracker';
import ValidationNotes from './components/ValidationNotes';
import { FiGrid, FiUsers, FiEdit, FiLink, FiFileText, FiPlusSquare, FiUserPlus, FiKey, FiCheckSquare, FiBarChart2, FiSlash, FiPrinter, FiUploadCloud, FiCheckCircle,FiHash } from 'react-icons/fi';
import { FaGavel } from 'react-icons/fa';

import './App.css';


const getUserFromToken = () => {
    const token = localStorage.getItem('token');
    if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        try {
            return jwtDecode(token);
        } catch (error) {
            localStorage.removeItem('token');
            return null;
        }
    }
    return null;
};

const getNavItemsForUser = (user) => {
    if (!user) return [];

    const navItems = [];

    // Dashboard : visible pour tous SAUF le controleur
    if (user.role !== 'controleur') {
        navItems.push({ label: "Dashboard", to: "/dashboard", icon: <FiGrid /> });
    }

    // Liste des Élèves : visible UNIQUEMENT pour le controleur (l'admin ne la voit pas)
    if (user.role === 'controleur') {
        navItems.push({ label: "Liste des Élèves", to: "/liste-eleves", icon: <FiUsers /> });
    }

    const operActions = [];
    if (user.role === 'admin' || user.role === 'operateur_code' || user.role === 'controleur') {
        operActions.push({ label: "Lier des Codes", to: "/", icon: <FiLink /> });
    }
    if (user.role === 'admin' || user.role === 'operateur_note' || user.role === 'controleur') {
        operActions.push({ label: "Saisir les Notes", to: "/noter", icon: <FiEdit /> });
        operActions.push({ label: "Saisie Directe", to: "/saisie-directe", icon: <FiFileText /> });
        operActions.push({ label: "Importer Notes", to: "/importer-notes", icon: <FiUploadCloud /> });
    }
    // Validation des Notes : UNIQUEMENT le controleur
    if (user.role === 'controleur') {
       operActions.push({ label: "Validation des Notes", to: "/validation-notes", icon: <FiCheckCircle /> });
    }

    if (operActions.length > 0) {
        navItems.push({
            label: "Opérations",
            subItems: operActions
        });
    }

    // Gestion + Administration : admin ET controleur
    if (user.role === 'admin' || user.role === 'controleur') {
        const gestionItems = [
            { label: "Conseil Formation", to: "/conseil-formation", icon: <FaGavel /> },
            { label: "Copies Notées", to: "/copies-notees", icon: <FiCheckSquare /> },
            { label: "Gérer Absences", to: "/gestion-absences", icon: <FiSlash /> },
        ];
        // Voir Résultats reste réservé à l'admin
        if (user.role === 'admin') {
            gestionItems.push({ label: "Voir Résultats", to: "/resultats", icon: <FiBarChart2 /> });
        }
        navItems.push({ label: "Gestion", subItems: gestionItems });

        navItems.push({
            label: "Administration",
            subItems: [
                { label: "Gérer Utilisateurs", to: "/gestion-utilisateurs", icon: <FiUsers /> },
                { label: "Assignations", to: "/config-assignation", icon: <FiCheckSquare /> },
                { label: "Créer Matière", to: "/creer-matiere", icon: <FiPlusSquare /> },
                { label: "Importer Élèves", to: "/importer-eleves", icon: <FiUserPlus /> },
                { label: "Importer Matricules (MLE)", to: "/importer-matricules", icon: <FiHash /> },
                { label: "Importer Codes", to: "/importer-codes", icon: <FiKey /> },
                { label: "Générer Codes", to: "/generer-codes-matiere", icon: <FiPrinter /> },
            ]
        });
    }

    return navItems;
};

const AppContent = () => {
    const [user, setUser] = useState(getUserFromToken());
    const [showWelcomeScreen, setShowWelcomeScreen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const navigate = useNavigate();

    const handleLoginSuccess = () => {
        setUser(getUserFromToken());
        setShowWelcomeScreen(true);
    };

    const handleWelcomeComplete = () => {
        setShowWelcomeScreen(false);
        const currentUser = getUserFromToken();
        if (currentUser) {
            if (currentUser.role === 'admin') {
                navigate('/dashboard');
            } else if (currentUser.role === 'operateur_code') {
                navigate('/');
            } else if (currentUser.role === 'controleur') {
                navigate('/validation-notes');
            } else {
                navigate('/noter');
            }
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
        setShowWelcomeScreen(false);
    };

    const navItems = useMemo(() => getNavItemsForUser(user), [user]);

    return (
        <>
            <GlobalActivityTracker />
            <AnimatedNodeBackground />
            {!user ? (
                <AuthPage onLoginSuccess={handleLoginSuccess} />
            ) : showWelcomeScreen ? (
                <WelcomePage onComplete={handleWelcomeComplete} />
            ) : (
                <div className={`app-layout ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                   <Sidebar
                        user={user}
                        items={navItems}
                        onLogout={handleLogout}
                        isCollapsed={isSidebarCollapsed}
                        toggleSidebar={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    />
                    <main className="main-content">
                        <Routes>
                            <Route path="/dashboard" element={user.role === 'admin' ? <Dashboard /> : <Navigate to="/" />} />
                            <Route path="/dashboard/general" element={user.role === 'admin' ? <DashboardGeneral /> : <Navigate to="/" />} />
                            <Route path="/dashboard/:typeExamen" element={user.role === 'admin' ? <DashboardExamen /> : <Navigate to="/" />} />
                            <Route path="/conseil-formation" element={(user.role === 'admin' || user.role === 'controleur') ? <ConseilFormation /> : <Navigate to="/" />} />
                            <Route path="/" element={(user.role === 'admin' || user.role === 'operateur_code' || user.role === 'controleur') ? <LierCode /> : <Navigate to="/noter" />} />
                            <Route path="/noter" element={(user.role === 'admin' || user.role === 'operateur_note' || user.role === 'controleur') ? <NoterCopie /> : <Navigate to="/" />} />
                            <Route path="/saisie-directe" element={(user.role === 'admin' || user.role === 'operateur_note' || user.role === 'controleur') ? <SaisieDirecte /> : <Navigate to="/" />} />
                            <Route path="/gestion-absences" element={(user.role === 'admin' || user.role === 'controleur') ? <GestionAbsences /> : <Navigate to="/" />} />
                            <Route path="/resultats" element={user.role === 'admin' ? <Resultats /> : <Navigate to="/" />} />
                            <Route path="/creer-matiere" element={(user.role === 'admin' || user.role === 'controleur') ? <CreerMatiere /> : <Navigate to="/" />} />
                            <Route path="/gestion-utilisateurs" element={(user.role === 'admin' || user.role === 'controleur') ? <GestionUtilisateurs /> : <Navigate to="/" />} />
                            <Route path="/config-assignation" element={(user.role === 'admin' || user.role === 'controleur') ? <ConfigurationAssignation /> : <Navigate to="/" />} />
                            <Route path="/importer-eleves" element={(user.role === 'admin' || user.role === 'controleur') ? <ImporterEleves /> : <Navigate to="/" />} />
                            <Route path="/importer-matricules" element={(user.role === 'admin' || user.role === 'controleur') ? <ImporterMatricules /> : <Navigate to="/" />} />
                            <Route path="/importer-notes" element={(user.role === 'admin' || user.role === 'operateur_note' || user.role === 'controleur') ? <ImporterNotes /> : <Navigate to="/" />} />
                            <Route path="/importer-codes" element={(user.role === 'admin' || user.role === 'controleur') ? <ImporterCodes /> : <Navigate to="/" />} />
                            <Route path="/generer-codes-matiere" element={(user.role === 'admin' || user.role === 'controleur') ? <CreerCodesMatiere /> : <Navigate to="/" />} />
                            <Route path="/copies-notees" element={(user.role === 'admin' || user.role === 'controleur') ? <CopiesNotees /> : <Navigate to="/" />} />
                            <Route path="/1" element={user.role === 'admin' ? <Inc1 /> : <Navigate to="/" />} />
                            <Route path="/liste-eleves" element={user.role === 'controleur' ? <ListeEleves /> : <Navigate to="/" />} />
                            <Route path="/2" element={user.role === 'admin' ? <Inc2 /> : <Navigate to="/" />} />
                            <Route path="*" element={<Navigate to="/dashboard" />} />
                            <Route
                                path="/validation-notes"
                                element={user.role === 'controleur' ? <ValidationNotes isAdmin={false} /> : <Navigate to="/" />}
                            />
                        </Routes>
                    </main>
                </div>
            )}
        </>
    );
}

function App() {
    return (
        <Router>
            <AppContent />
        </Router>
    );
}

export default App;