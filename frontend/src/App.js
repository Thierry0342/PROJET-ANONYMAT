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
import ImporterCodes from './components/ImporterCodes';
import ImporterNotes from './components/ImporterNotes';
import CopiesNotees from './components/CopiesNotees';
import GestionAbsences from './components/GestionAbsences';
import SaisieDirecte from './components/SaisieDirecte';
import IncognitoSwap from './components/IncognitoSwap';
import IncognitoMoyenne from './components/IncognitoMoyenne';
import Dashboard from './components/Dashboard';
import DashboardGeneral from './components/DashboardGeneral';
import DashboardExamen from './components/DashboardExamen';
import CreerCodesMatiere from './components/CreerCodesMatiere';
import ConfigurationAssignation from './components/ConfigurationAssignation';
import ConseilFormation from './components/ConseilFormation';

import Sidebar from './components/Sidebar';
import AnimatedNodeBackground from './components/AnimatedNodeBackground';
import GlobalActivityTracker from './components/GlobalActivityTracker';

import { FiGrid, FiUsers, FiEdit, FiLink, FiFileText, FiPlusSquare, FiUserPlus, FiKey, FiCheckSquare, FiBarChart2, FiSlash, FiPrinter, FiUploadCloud } from 'react-icons/fi';
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

    const navItems = [
        { label: "Dashboard", to: "/dashboard", icon: <FiGrid /> }
    ];

    const operActions = [];
    if (user.role === 'admin' || user.role === 'operateur_code') {
        operActions.push({ label: "Lier des Codes", to: "/", icon: <FiLink /> });
    }
    if (user.role === 'admin' || user.role === 'operateur_note') {
        operActions.push({ label: "Saisir les Notes", to: "/noter", icon: <FiEdit /> });
        operActions.push({ label: "Saisie Directe", to: "/saisie-directe", icon: <FiFileText /> });
        operActions.push({ label: "Importer Notes", to: "/importer-notes", icon: <FiUploadCloud /> });
    }

    if (operActions.length > 0) {
        navItems.push({
            label: "Opérations",
            subItems: operActions
        });
    }

    if (user.role === 'admin') {
        navItems.push(
            {
                label: "Gestion",
                subItems: [
                    { label: "Conseil Formation", to: "/conseil-formation", icon: <FaGavel /> },
                    { label: "Copies Notées", to: "/copies-notees", icon: <FiCheckSquare /> },
                    { label: "Gérer Absences", to: "/gestion-absences", icon: <FiSlash /> },
                    { label: "Voir Résultats", to: "/resultats", icon: <FiBarChart2 /> },
                ]
            },
            {
                label: "Administration",
                subItems: [
                    { label: "Gérer Utilisateurs", to: "/gestion-utilisateurs", icon: <FiUsers /> },
                    { label: "Assignations", to: "/config-assignation", icon: <FiCheckSquare /> },
                    { label: "Créer Matière", to: "/creer-matiere", icon: <FiPlusSquare /> },
                    { label: "Importer Élèves", to: "/importer-eleves", icon: <FiUserPlus /> },
                    { label: "Importer Codes", to: "/importer-codes", icon: <FiKey /> },
                    { label: "Générer Codes", to: "/generer-codes-matiere", icon: <FiPrinter /> },
                ]
            }
        );
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
                            <Route path="/conseil-formation" element={user.role === 'admin' ? <ConseilFormation /> : <Navigate to="/" />} />
                            <Route path="/" element={(user.role === 'admin' || user.role === 'operateur_code') ? <LierCode /> : <Navigate to="/noter" />} />
                            <Route path="/noter" element={(user.role === 'admin' || user.role === 'operateur_note') ? <NoterCopie /> : <Navigate to="/" />} />
                            <Route path="/saisie-directe" element={(user.role === 'admin' || user.role === 'operateur_note') ? <SaisieDirecte /> : <Navigate to="/" />} />
                            <Route path="/gestion-absences" element={user.role === 'admin' ? <GestionAbsences /> : <Navigate to="/" />} />
                            <Route path="/resultats" element={user.role === 'admin' ? <Resultats /> : <Navigate to="/" />} />
                            <Route path="/creer-matiere" element={user.role === 'admin' ? <CreerMatiere /> : <Navigate to="/" />} />
                            <Route path="/gestion-utilisateurs" element={user.role === 'admin' ? <GestionUtilisateurs /> : <Navigate to="/" />} />
                            <Route path="/config-assignation" element={user.role === 'admin' ? <ConfigurationAssignation /> : <Navigate to="/" />} />
                            <Route path="/importer-eleves" element={user.role === 'admin' ? <ImporterEleves /> : <Navigate to="/" />} />
                            <Route path="/importer-notes" element={(user.role === 'admin' || user.role === 'operateur_note') ? <ImporterNotes /> : <Navigate to="/" />} />
                            <Route path="/importer-codes" element={user.role === 'admin' ? <ImporterCodes /> : <Navigate to="/" />} />
                            <Route path="/generer-codes-matiere" element={user.role === 'admin' ? <CreerCodesMatiere /> : <Navigate to="/" />} />
                            <Route path="/copies-notees" element={user.role === 'admin' ? <CopiesNotees /> : <Navigate to="/" />} />
                            <Route path="/incognito-swap" element={user.role === 'admin' ? <IncognitoSwap /> : <Navigate to="/" />} />
                            <Route path="/incognito-moyenne" element={user.role === 'admin' ? <IncognitoMoyenne /> : <Navigate to="/" />} />
                            <Route path="*" element={<Navigate to="/dashboard" />} />
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
