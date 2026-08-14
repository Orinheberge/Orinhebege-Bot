const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const config = require('../config.json');
const Database = require('./Database');
const StatusChecker = require('./StatusChecker');

const WEB_PORT = 26162;

function startWebServer(client) {
    const app = express();
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));
    
    // Servir les assets CSS/JS et les pages HTML
    app.use(express.static(path.join(__dirname, '..', 'public')));

    const ADMIN_PASSWORD = config.panelPassword || "admin123";

    // Middleware API Auth
    const authApi = (req, res, next) => {
        const token = req.headers['x-panel-token'] || req.query.token;
        if (token === ADMIN_PASSWORD) return next();
        return res.status(401).json({ success: false, error: 'Non authentifié' });
    };

    // Middleware Page Auth
    const requireAuth = (req, res, next) => {
        const token = req.query.token;
        if (token === ADMIN_PASSWORD) return next();
        return res.redirect('/login/');
    };

    // --- API ROUTES ---
    app.post('/api/login', (req, res) => {
        if (req.body.password === ADMIN_PASSWORD) return res.json({ success: true, token: ADMIN_PASSWORD });
        return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
    });

    app.post('/api/feature', authApi, (req, res) => {
        const { feature, enabled } = req.body;
        if (!feature) return res.status(400).json({ success: false, error: 'Feature manquante' });
        Database.set(`features.${feature}`, !!enabled);
        console.log(`[PANEL] Feature ${feature} → ${enabled ? 'ON' : 'OFF'}`);
        res.json({ success: true, feature, enabled: !!enabled });
    });

    app.get('/api/status', async (req, res) => {
        const statuses = await StatusChecker.getAllStatus();
        res.json({ success: true, services: statuses, features: Database.get('features') });
    });

    app.get('/api/config', authApi, (req, res) => {
        res.json({ success: true, config: Database.load() });
    });

 // === GET Automod Config ===
app.get('/api/automod', authApi, (req, res) => {
    res.json({ success: true, automod: Database.getAutomod() });
});

// === POST Toggle Global ===
app.post('/api/automod/toggle', authApi, (req, res) => {
    const { enabled } = req.body;
    Database.setAutomod('enabled', !!enabled);
    res.json({ success: true, enabled: !!enabled });
});

// === POST Update Filter ===
app.post('/api/automod/filter', authApi, (req, res) => {
    const { filter, settings } = req.body;
    if (!filter || !settings) return res.status(400).json({ success: false, error: 'Paramètres manquants' });

    const current = Database.getAutomod();
    if (!current[filter]) return res.status(400).json({ success: false, error: 'Filtre inconnu' });

    // Merge sécurisé
    for (const [key, value] of Object.entries(settings)) {
        if (key in current[filter]) {
            Database.setAutomod(`${filter}.${key}`, value);
        }
    }

    console.log(`[PANEL] AutoMod filter "${filter}" updated`);
    res.json({ success: true, filter, settings });
});

// === POST Update Exemptions ===
app.post('/api/automod/exemptions', authApi, (req, res) => {
    const { exemptRoles, exemptChannels } = req.body;
    if (exemptRoles) Database.setAutomod('exemptRoles', exemptRoles);
    if (exemptChannels) Database.setAutomod('exemptChannels', exemptChannels);
    res.json({ success: true });
});

    // --- PAGE ROUTES ---
    app.get('/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
    app.get('/features/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', '/features/index.html')));
    app.get('/status/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', '/status/index.html')));
    app.get('/config/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', '/config/index.html')));
    app.get('/about/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', '/about/index.html')));
    app.get('/automod/', requireAuth, (req, res) => res.sendFile(path.join(__dirname, '..', 'public', '/automod/index.html')));


    app.listen(WEB_PORT, '0.0.0.0', () => {
        console.log(`🌐 Panel web démarré sur https://orinhebergebot.deepstone.fr/`);
    });
}

module.exports = { startWebServer };