const { WebSocketServer } = require('ws');
const { v4: uuidv4 } = require('uuid');
const Database = require('./Database');

class WebConsole {
    constructor() {
        this.wss = null;
        this.clients = new Map(); // token -> { ws, authenticated, history }
        this.commandHistory = [];
        this.maxHistory = 500;
    }

    /**
     * Initialise le WebSocket server
     */
    init(server, adminPassword) {
        this.wss = new WebSocketServer({ server, path: '/ws/console' });

        this.wss.on('connection', (ws, req) => {
            const clientId = uuidv4();
            this.clients.set(clientId, {
                ws,
                authenticated: false,
                history: [],
                connectedAt: new Date()
            });

            console.log(`[CONSOLE] Client connecté: ${clientId}`);

            // Envoyer message de bienvenue
            this.send(clientId, {
                type: 'system',
                message: '🔌 Connecté à la console Orinstone. Tapez "help" pour la liste des commandes.',
                timestamp: new Date().toISOString()
            });

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    this.handleMessage(clientId, msg, adminPassword);
                } catch (e) {
                    this.send(clientId, { type: 'error', message: 'Message invalide' });
                }
            });

            ws.on('close', () => {
                console.log(`[CONSOLE] Client déconnecté: ${clientId}`);
                this.clients.delete(clientId);
            });

            ws.on('error', (err) => {
                console.error(`[CONSOLE] Erreur client ${clientId}:`, err.message);
                this.clients.delete(clientId);
            });
        });

        console.log('✅ WebSocket Console démarré sur /ws/console');
    }

    /**
     * Gère les messages entrants
     */
    handleMessage(clientId, msg, adminPassword) {
        const client = this.clients.get(clientId);
        if (!client) return;

        switch (msg.type) {
            case 'auth':
                if (msg.token === adminPassword) {
                    client.authenticated = true;
                    this.send(clientId, { type: 'auth_success', message: '✅ Authentifié avec succès' });
                    // Envoyer l'historique récent
                    this.sendHistory(clientId);
                } else {
                    this.send(clientId, { type: 'auth_error', message: '❌ Mot de passe incorrect' });
                }
                break;

            case 'command':
                if (!client.authenticated) {
                    this.send(clientId, { type: 'error', message: 'Non authentifié. Envoyez {"type":"auth","token":"..."}' });
                    return;
                }
                this.executeCommand(clientId, msg.command);
                break;

            case 'ping':
                this.send(clientId, { type: 'pong', timestamp: Date.now() });
                break;

            default:
                this.send(clientId, { type: 'error', message: `Type inconnu: ${msg.type}` });
        }
    }

    /**
     * Exécute une commande
     */
    async executeCommand(clientId, command) {
        const trimmed = command.trim();
        if (!trimmed) return;

        // Log dans l'historique
        const entry = {
            type: 'input',
            command: trimmed,
            timestamp: new Date().toISOString()
        };
        this.addToHistory(entry);
        this.broadcastToAuthenticated(entry);

        const args = trimmed.split(/\s+/);
        const cmd = args[0].toLowerCase();
        const params = args.slice(1);

        try {
            let result;

            switch (cmd) {
                case 'help':
                    result = this.getHelpText();
                    break;

                case 'status':
                    result = await this.cmdStatus();
                    break;

                case 'stats':
                    result = await this.cmdStats();
                    break;

                case 'features':
                    result = this.cmdFeatures();
                    break;

                case 'toggle':
                    result = this.cmdToggle(params);
                    break;

                case 'automod':
                    result = this.cmdAutomod(params);
                    break;

                case 'eval':
                    result = await this.cmdEval(params.join(' '), clientId);
                    break;

                case 'broadcast':
                    result = await this.cmdBroadcast(params.join(' '));
                    break;

                case 'guilds':
                    result = this.cmdGuilds();
                    break;

                case 'uptime':
                    result = this.cmdUptime();
                    break;

                case 'memory':
                    result = this.cmdMemory();
                    break;

                case 'clear':
                    this.send(clientId, { type: 'clear' });
                    return;

                case 'history':
                    this.sendHistory(clientId);
                    return;

                case 'ping':
                    result = `🏓 Pong! Latence: ${Date.now() - new Date(entry.timestamp).getTime()}ms`;
                    break;

                default:
                    result = `❌ Commande inconnue: "${cmd}". Tapez "help" pour la liste.`;
            }

            const output = {
                type: 'output',
                command: trimmed,
                result: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                timestamp: new Date().toISOString()
            };

            this.addToHistory(output);
            this.broadcastToAuthenticated(output);

        } catch (error) {
            const errOutput = {
                type: 'error',
                command: trimmed,
                message: error.message,
                timestamp: new Date().toISOString()
            };
            this.addToHistory(errOutput);
            this.broadcastToAuthenticated(errOutput);
        }
    }

    // =============================================
    // COMMANDES
    // =============================================

    getHelpText() {
        return `
╔══════════════════════════════════════════╗
║         📋 COMMANDES DISPONIBLES         ║
╠══════════════════════════════════════════╣
║  help          → Affiche cette aide      ║
║  status        → Statut des services     ║
║  stats         → Statistiques du bot     ║
║  features      → Liste des fonctionnalités║
║  toggle <nom>  → Active/désactive feature║
║  automod       → Statut AutoMod          ║
║  automod on/off→ Active/désactive AutoMod║
║  guilds        → Liste des serveurs      ║
║  uptime        → Temps de fonctionnement ║
║  memory        → Usage mémoire           ║
║  broadcast <msg>→ Message sur tous serveurs║
║  eval <code>   → Exécute du JS (⚠️)     ║
║  history       → Historique commandes    ║
║  clear         → Efface la console       ║
║  ping          → Test latence            ║
╚══════════════════════════════════════════╝`.trim();
    }

    async cmdStatus() {
        const StatusChecker = require('./StatusChecker');
        const statuses = await StatusChecker.getAllStatus();
        const lines = statuses.map(s => {
            const icon = s.online ? '🟢' : '🔴';
            const lat = s.responseTime ? ` (${s.responseTime}ms)` : '';
            return `${icon} ${s.name}${lat}`;
        });
        return `📊 Statut des services:\n${lines.join('\n')}`;
    }

    async cmdStats() {
        const client = this.getClient();
        if (!client) return '❌ Client Discord non disponible';

        const uptime = process.uptime();
        const d = Math.floor(uptime / 86400);
        const h = Math.floor((uptime % 86400) / 3600);
        const m = Math.floor((uptime % 3600) / 60);

        return `📈 Statistiques du bot:
├── Serveurs: ${client.guilds.cache.size}
├── Utilisateurs: ${client.users.cache.size}
├── Commandes: ${client.commands.size}
├── Latence WS: ${client.ws.ping}ms
├── Uptime: ${d}j ${h}h ${m}m
└── Node.js: ${process.version}`;
    }

    cmdFeatures() {
        const features = Database.get('features') || {};
        const lines = Object.entries(features).map(([key, val]) => {
            const icon = val ? '✅' : '❌';
            return `${icon} ${key}`;
        });
        return `⚙️ Fonctionnalités:\n${lines.join('\n')}`;
    }

    cmdToggle(params) {
        if (!params.length) return 'Usage: toggle <feature_name>';
        const feature = params[0];
        const current = Database.isFeatureEnabled(feature);
        Database.set(`features.${feature}`, !current);
        const newState = !current ? 'activée' : 'désactivée';
        return `🔄 Feature "${feature}" ${newState}`;
    }

    cmdAutomod(params) {
        const automod = Database.getAutomod();
        if (!params.length) {
            const status = automod.enabled ? '🟢 Activé' : '🔴 Désactivé';
            const filters = Object.entries(automod)
                .filter(([k]) => k !== 'enabled' && k !== 'exemptRoles' && k !== 'exemptChannels')
                .map(([k, v]) => `${v.enabled ? '✅' : '❌'} ${k}`)
                .join('\n');
            return `🛡️ AutoMod: ${status}\n\nFiltres:\n${filters}`;
        }
        if (params[0] === 'on') {
            Database.setAutomod('enabled', true);
            return '🛡️ AutoMod activé';
        }
        if (params[0] === 'off') {
            Database.setAutomod('enabled', false);
            return '🛡️ AutoMod désactivé';
        }
        return 'Usage: automod [on|off]';
    }

    async cmdEval(code, clientId) {
        if (!code) return 'Usage: eval <code JavaScript>';
        try {
            const client = this.getClient();
            // eslint-disable-next-line no-eval
            const result = await eval(code);
            return `✅ Résultat:\n${typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)}`;
        } catch (error) {
            return `❌ Erreur: ${error.message}`;
        }
    }

    async cmdBroadcast(message) {
        if (!message) return 'Usage: broadcast <message>';
        const client = this.getClient();
        if (!client) return '❌ Client Discord non disponible';

        let sent = 0;
        for (const guild of client.guilds.cache.values()) {
            try {
                const channel = guild.systemChannel || guild.channels.cache.find(c => c.type === 0);
                if (channel) {
                    await channel.send(`📢 **Annonce:** ${message}`);
                    sent++;
                }
            } catch (e) {}
        }
        return `📢 Message envoyé sur ${sent}/${client.guilds.cache.size} serveur(s)`;
    }

    cmdGuilds() {
        const client = this.getClient();
        if (!client) return '❌ Client Discord non disponible';

        const guilds = client.guilds.cache.map(g =>
            `• ${g.name} (${g.memberCount} membres) [${g.id}]`
        );
        return `🌐 Serveurs (${guilds.length}):\n${guilds.join('\n')}`;
    }

    cmdUptime() {
        const uptime = process.uptime();
        const d = Math.floor(uptime / 86400);
        const h = Math.floor((uptime % 86400) / 3600);
        const m = Math.floor((uptime % 3600) / 60);
        const s = Math.floor(uptime % 60);
        return `⏱️ Uptime: ${d} jours, ${h} heures, ${m} minutes, ${s} secondes`;
    }

    cmdMemory() {
        const mem = process.memoryUsage();
        const format = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
        return `💾 Mémoire:
├── RSS: ${format(mem.rss)}
├── Heap Total: ${format(mem.heapTotal)}
├── Heap Used: ${format(mem.heapUsed)}
└── External: ${format(mem.external)}`;
    }

    // =============================================
    // UTILITAIRES
    // =============================================

    getClient() {
        // Récupérer le client Discord depuis le cache global
        // Le client est passé au démarrage via startWebServer
        return global.discordClient || null;
    }

    send(clientId, data) {
        const client = this.clients.get(clientId);
        if (client && client.ws.readyState === 1) {
            client.ws.send(JSON.stringify(data));
        }
    }

    broadcastToAuthenticated(data) {
        for (const [id, client] of this.clients) {
            if (client.authenticated) {
                this.send(id, data);
            }
        }
    }

    addToHistory(entry) {
        this.commandHistory.push(entry);
        if (this.commandHistory.length > this.maxHistory) {
            this.commandHistory.shift();
        }
    }

    sendHistory(clientId) {
        const recent = this.commandHistory.slice(-50);
        this.send(clientId, {
            type: 'history',
            entries: recent
        });
    }
}

module.exports = new WebConsole();