import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './AuthPage.css';

// Passer à false quand la mise à jour sera terminée pour réactiver la connexion
const MAINTENANCE_MODE = true;

const Notification = ({ title, message, index, total }) => {
    const visibleLimit = 3;
    const position = total - 1 - index;

    let style = {
        zIndex: total - position
    };

    if (position < visibleLimit) {
        style = {
            ...style,
            opacity: 1,
            filter: 'blur(0px)',
            transform: 'scale(1) translateY(0)'
        };
    } else {
        const effectIndex = position - visibleLimit + 1;
        style = {
            ...style,
            opacity: Math.max(1 - effectIndex * 0.4, 0),
            filter: `blur(${effectIndex * 2}px)`,
            transform: `scale(${1 - effectIndex * 0.05}) translateY(-${effectIndex * 10}px)`
        };
    }

    return (
        <div className="note" style={style}>
            <div className="note__inner">
                <div className="note__content">
                    <h3 className="note__title">{title}</h3>
                    <p className="note__message">{message}</p>
                </div>
            </div>
        </div>
    );
};

const NotificationCenter = () => {
    const messages = [
        { title: "Technologie Avancée", text: "Découvrez une technologie de pointe au service de l’équité et de la performance." },
        { title: "Sécurité Garantie", text: "Connexion sécurisée, données protégées, et une évaluation totalement impartiale." },
        { title: "Confidentialité", text: "Chaque donnée est traitée avec la plus grande précision, chaque note reste confidentielle." },
        { title: "Évaluation Impartiale", text: "Notre plateforme garantit une évaluation impartiale, anonyme et rapide." },
        { title: "Transparence", text: "Une traçabilité complète pour assurer transparence, fiabilité et responsabilité à chaque étape." }
    ];

    const [notifications, setNotifications] = useState([]);
    const messageIndexRef = useRef(0);
    const notesMax = 4;

    useEffect(() => {
        const intervalId = setInterval(() => {
            const currentMessage = messages[messageIndexRef.current];
            messageIndexRef.current = (messageIndexRef.current + 1) % messages.length;

            const newNotification = {
                id: Date.now(),
                title: currentMessage.title,
                message: currentMessage.text,
            };

            setNotifications(prev => {
                const updated = [...prev, newNotification];
                return updated.slice(-notesMax);
            });

        }, 5000);

        return () => clearInterval(intervalId);
    }, []);

    return (
        <div className="notification-center">
            {notifications.map((note, index) => (
                <Notification key={note.id} {...note} index={index} total={notifications.length} />
            ))}
        </div>
    );
};

const AuthPage = ({ onLoginSuccess }) => {
    const [isSignUpActive, setIsSignUpActive] = useState(false);

    const [loginData, setLoginData] = useState({ nom_utilisateur: '', password: '' });
    const [isLoginLoading, setIsLoginLoading] = useState(false);
    const [loginError, setLoginError] = useState('');

    const [registerData, setRegisterData] = useState({
        nom: '', prenom: '', matricule: '', service: '', numero_telephone: '',
        nom_utilisateur: '', mot_de_passe: '', role: 'operateur_note'
    });
    const [isRegisterLoading, setIsRegisterLoading] = useState(false);
    const [registerError, setRegisterError] = useState('');
    const [registerSuccess, setRegisterSuccess] = useState('');

    const handleLoginChange = (e) => setLoginData({ ...loginData, [e.target.name]: e.target.value });
    const handleRegisterChange = (e) => setRegisterData({ ...registerData, [e.target.name]: e.target.value });

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        if (MAINTENANCE_MODE) return;
        setIsLoginLoading(true);
        setLoginError('');
        try {
            const response = await axios.post('/api/login', loginData);
            localStorage.setItem('token', response.data.token);
            onLoginSuccess();
        } catch (err) {
            setLoginError(err.response?.data?.message || "Nom d'utilisateur ou mot de passe incorrect.");
        } finally {
            setIsLoginLoading(false);
        }
    };

    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        setIsRegisterLoading(true);
        setRegisterError('');
        setRegisterSuccess('');
        try {
            const response = await axios.post('/api/register', registerData);
            setRegisterSuccess(response.data.message);
            setRegisterData({
                nom: '', prenom: '', matricule: '', service: '',
                numero_telephone: '', nom_utilisateur: '', mot_de_passe: '', role: 'operateur_note'
            });
        } catch (err) {
            setRegisterError(err.response?.data?.message || 'Une erreur est survenue.');
        } finally {
            setIsRegisterLoading(false);
        }
    };

    const backgroundImageUrl = `${process.env.PUBLIC_URL}/IMAGE.png`;

    return (
        <div className="auth-page-wrapper" style={{ backgroundImage: `url(${backgroundImageUrl})` }}>
            <div className={`container ${isSignUpActive ? 'right-panel-active' : ''}`}>
                <div className="container__form container--signup">
                    <form className="form" onSubmit={handleRegisterSubmit}>
                        <h2 className="form__title">Créer un compte</h2>
                        <div className="form__inputs-grid">
                            <input type="text" placeholder="Nom *" name="nom" value={registerData.nom} onChange={handleRegisterChange} className="input" required />
                            <input type="text" placeholder="Prénom *" name="prenom" value={registerData.prenom} onChange={handleRegisterChange} className="input" required />
                            <input type="text" placeholder="Matricule" name="matricule" value={registerData.matricule} onChange={handleRegisterChange} className="input" />
                            <input type="text" placeholder="Service" name="service" value={registerData.service} onChange={handleRegisterChange} className="input" />
                            <input type="tel" placeholder="N° de téléphone" name="numero_telephone" value={registerData.numero_telephone} onChange={handleRegisterChange} className="input" />
                            <select name="role" value={registerData.role} onChange={handleRegisterChange} className="input" required>
                                <option value="operateur_note">Rôle: Opérateur de Note</option>
                                <option value="operateur_code">Rôle: Opérateur de Code</option>
                                <option value="admin">Rôle: Administrateur</option>
                            </select>
                        </div>
                        <input type="text" placeholder="Nom d'utilisateur *" name="nom_utilisateur" value={registerData.nom_utilisateur} onChange={handleRegisterChange} className="input full-width" autoComplete="username" required />
                        <input type="password" placeholder="Mot de passe *" name="mot_de_passe" value={registerData.mot_de_passe} onChange={handleRegisterChange} className="input full-width" autoComplete="new-password" required />

                        <button className="btn" type="submit" disabled={isRegisterLoading}>
                            {isRegisterLoading ? 'Envoi...' : 'Envoyer la demande'}
                        </button>

                        {registerError && <p className="message error">{registerError}</p>}
                        {registerSuccess && <p className="message success">{registerSuccess}</p>}

                        <p className="mobile-toggle">
                            Déjà un compte ? <span onClick={() => setIsSignUpActive(false)}>Se connecter</span>
                        </p>
                    </form>
                </div>

                <div className="container__form container--signin">
                    <form className="form" onSubmit={handleLoginSubmit}>
                        <h2 className="form__title">Connexion</h2>
                        <p className="form__subtitle">Accédez à votre espace sécurisé</p>

                        {MAINTENANCE_MODE && (
                            <div className="maintenance-banner">
                                <span className="maintenance-banner__icon">🔧</span>
                                <p>Des mises à jour sont en cours de déploiement. La connexion est temporairement indisponible.</p>
                            </div>
                        )}

                        <input
                            type="text"
                            placeholder="Nom d'utilisateur"
                            name="nom_utilisateur"
                            value={loginData.nom_utilisateur}
                            onChange={handleLoginChange}
                            className="input"
                            autoComplete="username"
                            disabled={MAINTENANCE_MODE}
                            required
                        />
                        <input
                            type="password"
                            placeholder="Mot de passe"
                            name="password"
                            value={loginData.password}
                            onChange={handleLoginChange}
                            className="input"
                            autoComplete="current-password"
                            disabled={MAINTENANCE_MODE}
                            required
                        />
                        <a href="#" className="link">Mot de passe oublié ?</a>

                        <button className="btn" type="submit" disabled={MAINTENANCE_MODE || isLoginLoading}>
                            {MAINTENANCE_MODE
                                ? 'Mise à jour en cours...'
                                : (isLoginLoading ? 'Connexion en cours...' : 'Se connecter')}
                        </button>

                        {loginError && <p className="message error">{loginError}</p>}

                        <p className="mobile-toggle">
                            Pas encore de compte ? <span onClick={() => setIsSignUpActive(true)}>S'inscrire</span>
                        </p>
                    </form>
                </div>

                <div className="container__overlay">
                    <div className="overlay" style={{ backgroundImage: `url(${backgroundImageUrl})` }}>
                        <div className="overlay__panel overlay--left">
                            <h1>Heureux de vous revoir !</h1>
                            <p>Pour rester connecté avec nous, veuillez vous connecter avec vos informations personnelles.</p>
                            <button className="btn btn--outline" onClick={() => setIsSignUpActive(false)}>Se connecter</button>
                        </div>
                        <div className="overlay__panel overlay--right">
                            <h1>Mes respects !</h1>
                            <p>Veuillez saisir vos informations. Elles sont indispensables pour que l’administrateur puisse examiner et approuver votre accès.</p>
                            <button className="btn btn--outline" onClick={() => setIsSignUpActive(true)}>Créer un compte</button>
                        </div>
                    </div>
                </div>
            </div>

            <NotificationCenter />
        </div>
    );
};

export default AuthPage;