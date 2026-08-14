const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const Database = require('./Database');
const StatusChecker = require('./StatusChecker');
const WebConsole = require('./WebConsole');

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
    function isAuthenticated(req) {
        if (req.cookies?.panelToken === ADMIN_PASSWORD) return true;
        if (req.headers['x-panel-token'] === ADMIN_PASSWORD) return true;
        if (req.query.token === ADMIN_PASSWORD) return true;
        return false;
    }

    const authApi = (req, res, next) => {
        if (isAuthenticated(req)) return next();
        return res.status(401).json({ success: false, error: 'Non authentifié' });
    };

    const requireAuth = (req, res, next) => {
        if (isAuthenticated(req)) {
            if (req.query.token === ADMIN_PASSWORD && !req.cookies?.panelToken) {
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
        const statuses = await StatusChecker.getAllStatus();
        res.json({ success: true, services: statuses, features: Database.get('features') });
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
    app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login', 'index.html')));
    app.get('/login/', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'login', 'index.html')));

    app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

    app.get('/features', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'features', 'index.html')));
    app.get('/features/', requireAuth, (req, res) => res.redirect('/features'));

    app.get('/status', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'status', 'index.html')));
    app.get('/status/', requireAuth, (req, res) => res.redirect('/status'));

    app.get('/config', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'config', 'index.html')));
    app.get('/config/', requireAuth, (req, res) => res.redirect('/config'));

    app.get('/about', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'about', 'index.html')));
    app.get('/about/', requireAuth, (req, res) => res.redirect('/about'));

    app.get('/automod', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'automod', 'index.html')));
    app.get('/automod/', requireAuth, (req, res) => res.redirect('/automod'));

    app.get('/console', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'console', 'index.html')));
    app.get('/console/', requireAuth, (req, res) => res.redirect('/console'));

    // =============================================
    // CRÉATION DU SERVEUR HTTP (nécessaire pour WebSocket)
    // =============================================
    const server = http.createServer(app);

    // ✅ Exposer le client Discord pour la console
    global.discordClient = client;

    // ✅ Initialiser la WebSocket Console
    WebConsole.init(server, ADMIN_PASSWORD);

    // =============================================
    // DÉMARRAGE
    // =============================================
    server.listen(WEB_PORT, '0.0.0.0', () => {
        console.log(`🌐 Panel web démarré sur http://0.0.0.0:${WEB_PORT}`);
        console.log(`   → Dashboard: http://localhost:${WEB_PORT}/`);
        console.log(`   → Console:   http://localhost:${WEB_PORT}/console/`);
    });
}

module.exports = { startWebServer };