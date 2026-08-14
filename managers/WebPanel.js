const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const Database = require('./Database');
const StatusChecker = require('./StatusChecker');
const WebConsole = require('./WebConsole');
const DiscordAuth = require('./DiscordAuth');

const WEB_PORT = parseInt(process.env.WEB_PORT) || 26162;
const ADMIN_PASSWORD = process.env.PANEL_PASSWORD;

function startWebServer(client) {
    const app = express();

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // =============================================
    // AUTHENTIFICATION
    // =============================================

    // Ancien système (mot de passe)
    function isAuthenticated(req) {
        if (req.cookies?.panelToken === ADMIN_PASSWORD) return true;
        if (req.headers['x-panel-token'] === ADMIN_PASSWORD) return true;
        if (req.query.token === ADMIN_PASSWORD) return true;
        return false;
    }

    // Système unifié : Discord OAuth2 + fallback mot de passe
    function isFullyAuthenticated(req) {
        // 1. Vérifier session Discord OAuth2
        const sessionToken = req.cookies?.panelSession;
        const session = DiscordAuth.verifySession(sessionToken);
        if (session) {
            req.userSession = session;
            return true;
        }
        // 2. Fallback ancien système mot de passe
        return isAuthenticated(req);
    }

    // Middleware API (JSON 401)
    const authApi = (req, res, next) => {
        if (isFullyAuthenticated(req)) return next();
        return res.status(401).json({ success: false, error: 'Non authentifié' });
    };

    // Middleware Pages (redirect vers login)
    const requireAuth = (req, res, next) => {
        if (isFullyAuthenticated(req)) {
            // Si authentifié via query string, créer cookie et rediriger proprement
            if (req.query.token === ADMIN_PASSWORD && !req.cookies?.panelToken && !req.cookies?.panelSession) {
                res.cookie('panelToken', ADMIN_PASSWORD, {
                    httpOnly: true,
                    secure: false,
                    sameSite: 'lax',
                    maxAge: 7 * 24 * 60 * 60 * 1000
                });
                return res.redirect(req.path);
            }
            return next();
        }
        return res.redirect('/login/');
    };

    // =============================================
    // DISCORD OAUTH2 ROUTES
    // =============================================

    // Nettoyage périodique des sessions expirées
    setInterval(() => DiscordAuth.cleanupSessions(), 30 * 60 * 1000);

    // Étape 1 : Redirection vers Discord
    app.get('/api/auth/login', (req, res) => {
        try {
            const url = DiscordAuth.getAuthorizationUrl();
            res.redirect(url);
        } catch (err) {
            console.error('[AUTH] Erreur génération URL:', err.message);
            res.redirect('/login/?error=oauth_config_error');
        }
    });

    // Étape 2 : Callback Discord
    app.get('/api/auth/callback', async (req, res) => {
        const { code, state, error } = req.query;

        if (error) {
            console.error(`[AUTH] Erreur OAuth2: ${error}`);
            return res.redirect(`/login/?error=${encodeURIComponent(error)}`);
        }

        if (!code || !state) {
            return res.redirect('/login/?error=missing_params');
        }

        try {
            const { sessionToken, user } = await DiscordAuth.handleCallback(code, state);

            res.cookie('panelSession', sessionToken, {
                httpOnly: true,
                secure: false, // Mettre true si HTTPS avec certificat valide
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000 // 24h
            });

            console.log(`[AUTH] ✅ ${user.username} connecté au panel`);
            res.redirect('/');

        } catch (err) {
            console.error(`[AUTH] Erreur callback: ${err.message}`);
            res.redirect(`/login/?error=${encodeURIComponent(err.message)}`);
        }
    });

    // Déconnexion (nettoie les deux systèmes)
    app.get('/api/auth/logout', (req, res) => {
        const sessionToken = req.cookies?.panelSession;
        if (sessionToken) {
            DiscordAuth.destroySession(sessionToken);
        }
        res.clearCookie('panelSession');
        res.clearCookie('panelToken');
        res.redirect('/login/');
    });

    // API : Infos utilisateur connecté
    app.get('/api/auth/me', authApi, (req, res) => {
        const session = req.userSession;
        if (session && session.user) {
            return res.json({
                success: true,
                user: session.user,
                avatar: DiscordAuth.getAvatarURL(session.user),
                guildMember: session.guildMember
            });
        }
        // Fallback : utilisateur connecté via mot de passe
        return res.json({ success: true, user: null, avatar: null, guildMember: null });
    });

    // =============================================
    // API ROUTES
    // =============================================

    // Login mot de passe (fallback)
    app.post('/api/login', (req, res) => {
        if (req.body.password === ADMIN_PASSWORD) {
            res.cookie('panelToken', ADMIN_PASSWORD, {
                httpOnly: true,
                secure: false,
                sameSite: 'lax',
                maxAge: 7 * 24 * 60 * 60 * 1000
            });
            return res.json({ success: true, token: ADMIN_PASSWORD });
        }
        return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
    });

    // Logout ancien système
    app.get('/api/logout', (req, res) => {
        res.clearCookie('panelToken');
        res.clearCookie('panelSession');
        res.redirect('/login/');
    });

    app.post('/api/feature', authApi, (req, res) => {
        const { feature, enabled } = req.body;
        if (!feature) return res.status(400).json({ success: false, error: 'Feature manquante' });
        Database.set(`features.${feature}`, !!enabled);
        console.log(`[PANEL] Feature ${feature} → ${enabled ? 'ON' : 'OFF'}`);
        res.json({ success: true, feature, enabled: !!enabled });
    });

    app.get('/api/status', authApi, async (req, res) => {
        try {
            const statuses = await StatusChecker.getAllStatus();
            res.json({ success: true, services: statuses, features: Database.get('features') });
        } catch (err) {
            console.error('[PANEL] Erreur status:', err.message);
            res.json({ success: true, services: [], features: Database.get('features') });
        }
    });

    app.get('/api/config', authApi, (req, res) => {
        res.json({ success: true, config: Database.load() });
    });

    app.get('/api/automod', authApi, (req, res) => {
        res.json({ success: true, automod: Database.getAutomod() });
    });

    app.post('/api/automod/toggle', authApi, (req, res) => {
        const { enabled } = req.body;
        Database.setAutomod('enabled', !!enabled);
        res.json({ success: true, enabled: !!enabled });
    });

    app.post('/api/automod/filter', authApi, (req, res) => {
        const { filter, settings } = req.body;
        if (!filter || !settings) return res.status(400).json({ success: false, error: 'Paramètres manquants' });
        const current = Database.getAutomod();
        if (!current[filter]) return res.status(400).json({ success: false, error: 'Filtre inconnu' });
        for (const [key, value] of Object.entries(settings)) {
            if (key in current[filter]) {
                Database.setAutomod(`${filter}.${key}`, value);
            }
        }
        console.log(`[PANEL] AutoMod filter "${filter}" updated`);
        res.json({ success: true, filter, settings });
    });

    app.post('/api/automod/exemptions', authApi, (req, res) => {
        const { exemptRoles, exemptChannels } = req.body;
        if (exemptRoles) Database.setAutomod('exemptRoles', exemptRoles);
        if (exemptChannels) Database.setAutomod('exemptChannels', exemptChannels);
        res.json({ success: true });
    });

    // =============================================
    // PAGE ROUTES
    // =============================================

    // Login (public - pas d'auth requise)
    app.get('/login', (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'login', 'index.html'))
    );
    app.get('/login/', (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'login', 'index.html'))
    );

    // Pages protégées
    app.get('/', requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'))
    );

    app.get('/features', requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'features', 'index.html'))
    );
    app.get('/features/', requireAuth, (req, res) => res.redirect('/features'));

    app.get('/status', requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'status', 'index.html'))
    );
    app.get('/status/', requireAuth, (req, res) => res.redirect('/status'));

    app.get('/config', requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'config', 'index.html'))
    );
    app.get('/config/', requireAuth, (req, res) => res.redirect('/config'));

    app.get('/about', requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'about', 'index.html'))
    );
    app.get('/about/', requireAuth, (req, res) => res.redirect('/about'));

    app.get('/automod', requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'automod', 'index.html'))
    );
    app.get('/automod/', requireAuth, (req, res) => res.redirect('/automod'));

    app.get('/console', requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'console', 'index.html'))
    );
    app.get('/console/', requireAuth, (req, res) => res.redirect('/console'));

    // =============================================
    // SERVEUR HTTP + WEBSOCKET
    // =============================================
    const server = http.createServer(app);

    // Exposer le client Discord pour la console WebSocket
    global.discordClient = client;

    // Initialiser la WebSocket Console
    try {
        WebConsole.init(server, ADMIN_PASSWORD);
    } catch (err) {
        console.error('[PANEL] Erreur WebSocket Console:', err.message);
    }

    // =============================================
    // DÉMARRAGE
    // =============================================
    server.listen(WEB_PORT, '0.0.0.0', () => {
        console.log(`🌐 Panel web démarré sur http://0.0.0.0:${WEB_PORT}`);
        console.log(`   → Dashboard:  http://localhost:${WEB_PORT}/`);
        console.log(`   → Console WS: ws://localhost:${WEB_PORT}/ws/console`);
        console.log(`   → Login:      http://localhost:${WEB_PORT}/login/`);
    });
}

module.exports = { startWebServer };