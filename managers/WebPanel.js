const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const Database = require('./Database');
const BumpManager = require('./BumpManager');
const StatusChecker = require('./StatusChecker');
const WebConsole = require('./WebConsole');
const DiscordAuth = require('./DiscordAuth');

const WEB_PORT = parseInt(process.env.WEB_PORT) || 26162;
const ADMIN_PASSWORD = process.env.PANEL_PASSWORD;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BUMP_COOLDOWN = parseInt(process.env.BUMP_COOLDOWN) || 7200000;

function startWebServer(client) {
    const app = express();

    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, '..', 'public')));

    // =============================================
    // AUTHENTIFICATION
    // =============================================

    function isAuthenticated(req) {
        if (req.cookies?.panelToken === ADMIN_PASSWORD) return true;
        if (req.headers['x-panel-token'] === ADMIN_PASSWORD) return true;
        if (req.query.token === ADMIN_PASSWORD) return true;
        return false;
    }

    function isFullyAuthenticated(req) {
        const sessionToken = req.cookies?.panelSession;
        const session = DiscordAuth.verifySession(sessionToken);
        if (session) {
            req.userSession = session;
            return true;
        }
        return isAuthenticated(req);
    }

    const authApi = (req, res, next) => {
        if (isFullyAuthenticated(req)) return next();
        return res.status(401).json({ success: false, error: 'Non authentifié' });
    };

    const requireAuth = (req, res, next) => {
        if (isFullyAuthenticated(req)) {
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
    // DISCORD OAUTH2
    // =============================================

    setInterval(() => DiscordAuth.cleanupSessions(), 30 * 60 * 1000);

    app.get('/api/auth/login', (req, res) => {
        try {
            const url = DiscordAuth.getAuthorizationUrl();
            res.redirect(url);
        } catch (err) {
            console.error('[AUTH] Erreur génération URL:', err.message);
            res.redirect('/login/?error=oauth_config_error');
        }
    });

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
                secure: false,
                sameSite: 'lax',
                maxAge: 24 * 60 * 60 * 1000
            });

            console.log(`[AUTH] ✅ ${user.username} connecté au panel`);
            res.redirect('/');

        } catch (err) {
            console.error(`[AUTH] Erreur callback: ${err.message}`);
            res.redirect(`/login/?error=${encodeURIComponent(err.message)}`);
        }
    });

    app.get('/api/auth/logout', (req, res) => {
        const sessionToken = req.cookies?.panelSession;
        if (sessionToken) {
            DiscordAuth.destroySession(sessionToken);
        }
        res.clearCookie('panelSession');
        res.clearCookie('panelToken');
        res.redirect('/login/');
    });

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
        return res.json({ success: true, user: null, avatar: null, guildMember: null });
    });

    // =============================================
    // API ROUTES
    // =============================================

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
    // API BUMP
    // =============================================

    BumpManager.initTables().catch(() => {});

    app.get('/api/bump/info', authApi, async (req, res) => {
        try {
            const guildId = req.query.guildId || GUILD_ID;
            const userId = req.userSession?.user?.id || req.query.userId || 'web';
            const info = await BumpManager.getBumpInfo(guildId, userId);
            res.json({ success: true, ...info });
        } catch (err) {
            console.error('[PANEL] Erreur bump info:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.post('/api/bump', authApi, async (req, res) => {
        try {
            const guildId = req.body.guildId || GUILD_ID;
            const userId = req.userSession?.user?.id || req.body.userId || 'web';

            const result = await BumpManager.doBump(guildId, userId, client);

            if (result.allowed) {
                console.log(`[PANEL] Bump effectué par ${userId} pour le serveur ${guildId}`);
            }

            res.json({ success: result.allowed, ...result });
        } catch (err) {
            console.error('[PANEL] Erreur bump:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.get('/api/bump/stats', authApi, async (req, res) => {
        try {
            const guildId = req.query.guildId || GUILD_ID;
            const totalBumps = await BumpManager.getTotalBumps(guildId);
            const lastBump = await BumpManager.getLastBump(guildId);

            res.json({
                success: true,
                totalBumps,
                lastBump,
                cooldownDuration: BUMP_COOLDOWN
            });
        } catch (err) {
            console.error('[PANEL] Erreur bump stats:', err.message);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // =============================================
    // PAGE ROUTES
    // =============================================

    app.get('/login', (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'login', 'index.html'))
    );
    app.get('/login/', (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'login', 'index.html'))
    );

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

    app.get('/bump', requireAuth, (req, res) =>
        res.sendFile(path.join(__dirname, '..', 'public', 'bump', 'index.html'))
    );
    app.get('/bump/', requireAuth, (req, res) => res.redirect('/bump'));

    // =============================================
    // SERVEUR HTTP + WEBSOCKET
    // =============================================
    const server = http.createServer(app);

    global.discordClient = client;

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