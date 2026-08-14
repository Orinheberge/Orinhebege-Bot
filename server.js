// =============================================
// 0. VARIABLES D'ENVIRONNEMENT
// =============================================
require('dotenv').config();

const {
    Client, GatewayIntentBits, Partials, Collection,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// =============================================
// CONFIGURATION
// =============================================
const config = {
    token:         process.env.DISCORD_TOKEN,
    clientId:      process.env.DISCORD_CLIENT_ID,
    guildId:       process.env.DISCORD_GUILD_ID,
    prefix:        process.env.BOT_PREFIX || '!',
    panelPassword: process.env.PANEL_PASSWORD,
    webPort:       parseInt(process.env.WEB_PORT) || 26162
};

const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'PANEL_PASSWORD'];
const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0) {
    // Utiliser les console originaux car pas encore redirigés
    const _log = console.log;
    _log('❌ Variables d\'environnement manquantes :');
    missingVars.forEach(v => _log(`   → ${v}`));
    _log('\n   Configurez-les dans votre .env ou panel d\'hébergement.\n');
    process.exit(1);
}

// =============================================
// SYSTÈME DE LOG (Discord + Terminal)
// =============================================
const CONSOLE_CHANNEL_ID = process.env.CONSOLE_CHANNEL_ID || null;
const CONSOLE_OWNERS = (process.env.CONSOLE_OWNERS || '').split(',').map(id => id.trim()).filter(Boolean);

const logBuffer = [];
let botReady = false;
let consoleChannel = null;
let isRedirecting = false; // Anti-boucle

function getTimestamp() {
    return new Date().toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'Europe/Paris'
    });
}

// Garder les fonctions console originales AVANT redirection
const _consoleLog   = console.log.bind(console);
const _consoleError = console.error.bind(console);
const _consoleWarn  = console.warn.bind(console);

async function sendLog(message, type = 'INFO') {
    const timestamp = getTimestamp();
    const emojis = { INFO: 'ℹ️', SUCCESS: '✅', WARN: '⚠️', ERROR: '❌', STARTUP: '🚀', CONSOLE: '🖥️', PTERO: '🔌' };
    const emoji = emojis[type] || 'ℹ️';
    const formatted = `[${timestamp}] ${emoji} [${type}] ${message}`;

    // Terminal (toujours)
    if (type === 'ERROR') _consoleError(formatted);
    else if (type === 'WARN') _consoleWarn(formatted);
    else _consoleLog(formatted);

    // Discord (si prêt)
    if (botReady && consoleChannel && !isRedirecting) {
        try {
            const truncated = formatted.length > 1900 ? formatted.substring(0, 1900) + '...' : formatted;
            await consoleChannel.send(`\`${truncated}\``);
        } catch (e) { /* silencieux */ }
    } else if (!botReady) {
        logBuffer.push({ message: formatted, type, ts: Date.now() });
        if (logBuffer.length > 50) logBuffer.shift();
    }
}

async function sendEmbedLog(title, description, color = 0x2f3136, fields = []) {
    if (!botReady || !consoleChannel) return;
    try {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(String(description).substring(0, 4000))
            .setColor(color)
            .setTimestamp();
        if (fields.length > 0) embed.addFields(fields);
        await consoleChannel.send({ embeds: [embed] });
    } catch (e) { /* silencieux */ }
}

async function flushLogBuffer() {
    if (!consoleChannel || logBuffer.length === 0) return;
    const lines = logBuffer.map(l => l.message);
    const content = lines.join('\n');

    if (content.length > 3800) {
        for (let i = 0; i < lines.length; i += 15) {
            const chunk = lines.slice(i, i + 15).join('\n');
            try { await consoleChannel.send(`\`\`\`\n${chunk.substring(0, 1900)}\n\`\`\``); } catch (e) {}
        }
    } else {
        try {
            await consoleChannel.send({
                embeds: [new EmbedBuilder().setTitle('📋 Logs de démarrage').setColor(0x5865F2).setDescription(`\`\`\`\n${content}\n\`\`\``).setTimestamp()]
            });
        } catch (e) {}
    }
    logBuffer.length = 0;
}

// Redirection console.log / error / warn
console.log = (...args) => {
    _consoleLog(...args);
    if (isRedirecting) return;
    isRedirecting = true;
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    if (!msg.includes('[INFO]') && !msg.includes('[SUCCESS]') && !msg.includes('[STARTUP]') && !msg.includes('[CONSOLE]') && !msg.includes('[PTERO]')) {
        sendLog(msg, 'INFO').catch(() => {});
    }
    isRedirecting = false;
};

console.error = (...args) => {
    _consoleError(...args);
    if (isRedirecting) return;
    isRedirecting = true;
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
    if (!msg.includes('[ERROR]')) {
        sendLog(msg, 'ERROR').catch(() => {});
    }
    isRedirecting = false;
};

console.warn = (...args) => {
    _consoleWarn(...args);
    if (isRedirecting) return;
    isRedirecting = true;
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    if (!msg.includes('[WARN]')) {
        sendLog(msg, 'WARN').catch(() => {});
    }
    isRedirecting = false;
};

sendLog('Variables d\'environnement chargées', 'SUCCESS');

// =============================================
// 1. CLIENT DISCORD
// =============================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction]
});

client.commands = new Collection();
client.config = config;
client.sendLog = sendLog;
client.sendEmbedLog = sendEmbedLog;

// =============================================
// 2. ERREURS GLOBALES
// =============================================
client.on('error', (error) => sendLog(`[DISCORD] ${error.message}`, 'ERROR'));
process.on('unhandledRejection', (error) => sendLog(`[UNHANDLED REJECTION] ${error?.stack || error}`, 'ERROR'));
process.on('uncaughtException', (error) => sendLog(`[UNCAUGHT EXCEPTION] ${error?.stack || error}`, 'ERROR'));

// =============================================
// 3. API PTERODACTYL
// =============================================
const PTeroPanelURL  = process.env.PTERO_PANEL_URL || 'https://panel.orinstone.deepstone.fr';
const PTeroAPIKey    = process.env.PTERO_API_KEY;
const PTeroServerID  = process.env.PTERO_SERVER_ID;

class PteroAPI {
    static isConfigured() { return !!(PTeroAPIKey && PTeroServerID); }

    static request(method, endpoint, body = null) {
        return new Promise((resolve, reject) => {
            if (!this.isConfigured()) return reject(new Error('PTERO_API_KEY ou PTERO_SERVER_ID non configuré'));

            const url = new URL(`/api/client/servers/${PTeroServerID}${endpoint}`, PTeroPanelURL);
            const isHttps = url.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method,
                headers: {
                    'Authorization': `Bearer ${PTeroAPIKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                rejectUnauthorized: false
            };

            const req = lib.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true, status: res.statusCode, data: data ? JSON.parse(data) : null });
                    } else {
                        reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
                    }
                });
            });

            req.on('error', (e) => reject(new Error(`Réseau: ${e.message}`)));
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    static restart()      { return this.request('POST', '/power', { signal: 'restart' }); }
    static stop()         { return this.request('POST', '/power', { signal: 'stop' }); }
    static kill()         { return this.request('POST', '/power', { signal: 'kill' }); }
    static sendCmd(cmd)   { return this.request('POST', '/command', { command: cmd }); }
    static getDetails()   { return this.request('GET', ''); }
    static getResources() { return this.request('GET', '/resources'); }
}

sendLog(`Pterodactyl API: ${PteroAPI.isConfigured() ? '🟢 Configuré' : '🔴 Non configuré'}`, 'INFO');

// =============================================
// 4. CONSOLE DISCORD
// =============================================
const consoleSessions = new Map();
const POWER_COOLDOWN = 30000;
const powerCooldowns = new Map();

function checkPowerCooldown(userId) {
    const last = powerCooldowns.get(userId) || 0;
    const now = Date.now();
    if (now - last < POWER_COOLDOWN) {
        return `⏳ Cooldown: attendez ${Math.ceil((POWER_COOLDOWN - (now - last)) / 1000)}s`;
    }
    powerCooldowns.set(userId, now);
    return null;
}

const CONSOLE_COMMANDS = {

    // --- AIDE ---
    help: {
        desc: 'Affiche cette aide',
        execute: () => [
            '╔══════════════════════════════════════════╗',
            '║         📋 COMMANDES CONSOLE             ║',
            '╠══════════════════════════════════════════╣',
            '║  help          → Cette aide              ║',
            '║  status        → Statut du bot           ║',
            '║  stats         → Statistiques            ║',
            '║  uptime        → Temps fonctionnement    ║',
            '║  memory        → Usage mémoire           ║',
            '║  guilds        → Liste serveurs          ║',
            '║  commands      → Slash commands          ║',
            '║  logs [n]      → Derniers logs buffer    ║',
            '║  eval <code>   → Exécuter JS ⚠️         ║',
            '║  say <id> <msg>→ Message dans un salon  ║',
            '║  broadcast <msg>→ Message tous serveurs ║',
            '║                                          ║',
            '║  ── 🔌 Pterodactyl ──                    ║',
            '║  ptero         → Infos serveur Ptero     ║',
            '║  restart       → Redémarrer (API Ptero)  ║',
            '║  stop          → Arrêter (API Ptero)     ║',
            '║  kill          → Force kill (API Ptero)  ║',
            '║  cmd <cmd>     → Terminal Pterodactyl    ║',
            '║                                          ║',
            '║  clear         → Effacer la console      ║',
            '║  close         → Fermer la console       ║',
            '╚══════════════════════════════════════════╝'
        ].join('\n')
    },

    // --- STATUT ---
    status: {
        desc: 'Statut du bot',
        execute: () => {
            const u = process.uptime();
            const d = Math.floor(u / 86400), h = Math.floor((u % 86400) / 3600), m = Math.floor((u % 3600) / 60);
            return [
                '📊 **Statut du bot**',
                `├── 🟢 En ligne`,
                `├── 🏓 Latence: ${client.ws.ping}ms`,
                `├── 🌐 Serveurs: ${client.guilds.cache.size}`,
                `├── 👥 Users: ${client.users.cache.size}`,
                `├── 📝 Commands: ${client.commands.size}`,
                `├── ⏱️ Uptime: ${d}j ${h}h ${m}m`,
                `├── 💻 Node: ${process.version}`,
                `└── 🔌 Pterodactyl: ${PteroAPI.isConfigured() ? '🟢 Configuré' : '🔴 Non configuré'}`
            ].join('\n');
        }
    },

    // --- STATISTIQUES ---
    stats: {
        desc: 'Statistiques détaillées',
        execute: () => {
            const mem = process.memoryUsage();
            const fmt = b => `${(b / 1024 / 1024).toFixed(2)} MB`;
            const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
            return [
                '📈 **Statistiques**',
                `├── 🌐 Serveurs: ${client.guilds.cache.size}`,
                `├── 👥 Membres: ${totalMembers.toLocaleString()}`,
                `├── 📝 Commands: ${client.commands.size}`,
                `├── 🏓 Ping: ${client.ws.ping}ms`,
                `├── 💾 RSS: ${fmt(mem.rss)}`,
                `└── 💾 Heap: ${fmt(mem.heapUsed)}/${fmt(mem.heapTotal)}`
            ].join('\n');
        }
    },

    // --- UPTIME ---
    uptime: {
        desc: 'Temps de fonctionnement',
        execute: () => {
            const u = process.uptime();
            return `⏱️ ${Math.floor(u / 86400)}j ${Math.floor((u % 86400) / 3600)}h ${Math.floor((u % 3600) / 60)}m ${Math.floor(u % 60)}s`;
        }
    },

    // --- MÉMOIRE ---
    memory: {
        desc: 'Usage mémoire',
        execute: () => {
            const m = process.memoryUsage();
            const f = b => `${(b / 1024 / 1024).toFixed(2)} MB`;
            return `💾 RSS: ${f(m.rss)} | Heap: ${f(m.heapUsed)}/${f(m.heapTotal)} | Ext: ${f(m.external)}`;
        }
    },

    // --- SERVEURS ---
    guilds: {
        desc: 'Liste des serveurs',
        execute: () => {
            const list = client.guilds.cache.map(g => `• **${g.name}** (${g.memberCount}) \`${g.id}\``);
            return list.length ? list.join('\n') : 'Aucun serveur';
        }
    },

    // --- COMMANDES SLASH ---
    commands: {
        desc: 'Liste slash commands',
        execute: () => {
            const list = client.commands.map(c => `• \`/${c.data.name}\` — ${c.data.description || '-'}`);
            return list.length ? list.join('\n') : 'Aucune commande';
        }
    },

    // --- LOGS ---
    logs: {
        desc: 'Derniers logs du buffer',
        execute: (args) => {
            const n = Math.min(parseInt(args[0]) || 10, 50);
            const recent = logBuffer.slice(-n);
            if (!recent.length) return '📭 Aucun log en buffer';
            const text = recent.map(l => l.message).join('\n');
            return `\`\`\`\n${text.substring(0, 1800)}\n\`\`\``;
        }
    },

    // =============================================
    // COMMANDES PTERODACTYL
    // =============================================

    ptero: {
        desc: 'Infos serveur Pterodactyl',
        execute: async () => {
            if (!PteroAPI.isConfigured()) return '❌ API Pterodactyl non configurée\nAjoutez PTERO_API_KEY et PTERO_SERVER_ID dans le .env';
            try {
                const [details, resources] = await Promise.all([PteroAPI.getDetails(), PteroAPI.getResources()]);
                const d = details.data?.attributes || {};
                const r = resources.data?.attributes?.resources || {};

                const fmtB = (b) => {
                    if (!b || b === 0) return '0 MB';
                    if (b > 1073741824) return `${(b / 1073741824).toFixed(2)} GB`;
                    return `${(b / 1048576).toFixed(2)} MB`;
                };

                return [
                    '🔌 **Serveur Pterodactyl**',
                    `├──  Nom: ${d.name || 'N/A'}`,
                    `├── 🟢 État: ${r.current_state || 'N/A'}`,
                    `├── 💾 Mémoire: ${fmtB(r.memory_bytes)} / ${d.limits?.memory ? d.limits.memory + ' MB' : '∞'}`,
                    `├── 💿 Disque: ${fmtB(r.disk_bytes)} / ${d.limits?.disk ? d.limits.disk + ' MB' : '∞'}`,
                    `├── 🔲 CPU: ${r.cpu_absolute?.toFixed(2) || 0}%`,
                    `├──  Réseau ↑: ${fmtB(r.network_tx_bytes)}`,
                    `├── 🌐 Réseau ↓: ${fmtB(r.network_rx_bytes)}`,
                    `└── 🆔 UUID: ${d.uuid || 'N/A'}`
                ].join('\n');
            } catch (e) {
                return `❌ Erreur API: ${e.message}`;
            }
        }
    },

    restart: {
        desc: 'Redémarrer via Pterodactyl',
        execute: async (args, userId) => {
            if (!PteroAPI.isConfigured()) return '❌ API Pterodactyl non configurée';
            const cd = checkPowerCooldown(userId);
            if (cd) return cd;

            sendLog(`[PTERO] Restart demandé par ${userId}`, 'PTERO');
            try {
                await PteroAPI.restart();
                return '🔄 **Restart envoyé via Pterodactyl !**\nLe bot va se couper et Pterodactyl le relancera.\n⏳ Délai: ~10-30 secondes';
            } catch (e) {
                return `❌ Erreur: ${e.message}`;
            }
        }
    },

    stop: {
        desc: 'Arrêter via Pterodactyl',
        execute: async (args, userId) => {
            if (!PteroAPI.isConfigured()) return '❌ API Pterodactyl non configurée';
            const cd = checkPowerCooldown(userId);
            if (cd) return cd;

            sendLog(`[PTERO] Stop demandé par ${userId}`, 'PTERO');
            try {
                await PteroAPI.stop();
                return '🛑 **Stop envoyé via Pterodactyl !**\nLe bot va s\'arrêter proprement.\n⚠️ Relancez manuellement depuis le panel Pterodactyl.';
            } catch (e) {
                return `❌ Erreur: ${e.message}`;
            }
        }
    },

    kill: {
        desc: 'Force kill via Pterodactyl',
        execute: async (args, userId) => {
            if (!PteroAPI.isConfigured()) return '❌ API Pterodactyl non configurée';
            const cd = checkPowerCooldown(userId);
            if (cd) return cd;

            sendLog(`[PTERO] Kill demandé par ${userId}`, 'ERROR');
            try {
                await PteroAPI.kill();
                return '💀 **Force kill envoyé via Pterodactyl !**\n⚠️ Processus tué brutalement. Risque de corruption.\nÀ utiliser en dernier recours uniquement.';
            } catch (e) {
                return `❌ Erreur: ${e.message}`;
            }
        }
    },

    cmd: {
        desc: 'Commande terminal Pterodactyl',
        execute: async (args) => {
            if (!PteroAPI.isConfigured()) return '❌ API Pterodactyl non configurée';
            const command = args.join(' ');
            if (!command) return 'Usage: `cmd <commande>`\nEx: `cmd npm install`';
            try {
                await PteroAPI.sendCmd(command);
                sendLog(`[PTERO] Commande envoyée: ${command}`, 'PTERO');
                return `✅ Commande envoyée au terminal:\n\`\`\`\n${command}\n\`\`\``;
            } catch (e) {
                return `❌ Erreur: ${e.message}`;
            }
        }
    },

    // =============================================
    // AUTRES COMMANDES
    // =============================================

    eval: {
        desc: 'Exécuter du JavaScript ⚠️',
        execute: async (args) => {
            const code = args.join(' ');
            if (!code) return 'Usage: `eval <code>`';
            try {
                const result = await eval(code);
                const out = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
                return `✅\n\`\`\`js\n${out.substring(0, 1800)}\n\`\`\``;
            } catch (e) {
                return `❌\n\`\`\`\n${e.message}\n\`\`\``;
            }
        }
    },

    say: {
        desc: 'Envoyer un message dans un salon',
        execute: async (args) => {
            if (args.length < 2) return 'Usage: `say <channelId> <message>`';
            try {
                const ch = client.channels.cache.get(args[0]);
                if (!ch) return `❌ Salon \`${args[0]}\` introuvable`;
                await ch.send(args.slice(1).join(' '));
                return `✅ Envoyé dans <#${args[0]}>`;
            } catch (e) { return `❌ ${e.message}`; }
        }
    },

    broadcast: {
        desc: 'Message sur tous les serveurs',
        execute: async (args) => {
            const msg = args.join(' ');
            if (!msg) return 'Usage: `broadcast <message>`';
            let sent = 0;
            for (const g of client.guilds.cache.values()) {
                try {
                    const ch = g.systemChannel || g.channels.cache.find(c => c.type === 0);
                    if (ch) { await ch.send(`📢 ${msg}`); sent++; }
                } catch {}
            }
            return `📢 Envoyé sur **${sent}**/${client.guilds.cache.size} serveurs`;
        }
    },

    clear: { desc: 'Effacer la console', execute: () => '__CLEAR__' },
    close: { desc: 'Fermer la console', execute: () => '__CLOSE__' }
};

// --- Fonctions console ---

async function executeConsoleCmd(input, userId) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const command = CONSOLE_COMMANDS[cmd];
    if (!command) return `❌ Commande inconnue: \`${cmd}\`\nTapez \`help\` pour la liste.`;
    try {
        const result = await command.execute(args, userId);
        sendLog(`[CONSOLE] /${cmd} par ${userId}`, 'CONSOLE');
        return result;
    } catch (e) {
        sendLog(`[CONSOLE] Erreur /${cmd}: ${e.message}`, 'ERROR');
        return `❌ Erreur: ${e.message}`;
    }
}

function buildConsoleEmbed(history = []) {
    const embed = new EmbedBuilder()
        .setTitle('🖥️ Console Orinstone')
        .setColor(0x2f3136)
        .setTimestamp()
        .setFooter({ text: 'help pour la liste • Owner uniquement' });

    if (!history.length) {
        embed.setDescription('```diff\n+ Console prête. Tapez "help" pour commencer.\n```');
    } else {
        const recent = history.slice(-8);
        const lines = recent.map(e =>
            e.type === 'input'
                ? `> ❯ ${e.content}`
                : (String(e.content).length > 300 ? String(e.content).substring(0, 300) + '...' : String(e.content))
        );
        const content = lines.join('\n');
        embed.setDescription(content.length > 3800 ? content.substring(content.length - 3800) : content);
    }
    return embed;
}

function buildConsoleButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('console_input').setLabel('Entrer commande').setEmoji('⌨️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('console_help').setLabel('Aide').setEmoji('❓').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('console_clear').setLabel('Effacer').setEmoji('🧹').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('console_close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Danger)
    );
}

function isConsoleOwner(userId) {
    if (CONSOLE_OWNERS.length > 0) return CONSOLE_OWNERS.includes(userId);
    return true;
}

// Exposer sur le client
client.consoleSessions = consoleSessions;
client.executeConsoleCmd = executeConsoleCmd;
client.buildConsoleEmbed = buildConsoleEmbed;
client.buildConsoleButtons = buildConsoleButtons;
client.isConsoleOwner = isConsoleOwner;
client.CONSOLE_CHANNEL_ID = CONSOLE_CHANNEL_ID;

sendLog(`Console Discord: Salon=${CONSOLE_CHANNEL_ID || 'NON CONFIGURÉ'} | Owners=${CONSOLE_OWNERS.length > 0 ? CONSOLE_OWNERS.join(',') : 'Tous'}`, 'INFO');

// =============================================
// 5. CHARGEUR D'ÉVÉNEMENTS
// =============================================
function loadEvents(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    let count = 0;
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            count += loadEvents(fullPath);
        } else if (item.name.endsWith('.js')) {
            try {
                delete require.cache[require.resolve(fullPath)];
                const exported = require(fullPath);
                const events = Array.isArray(exported) ? exported : [exported];
                for (const event of events) {
                    if (!event.name || typeof event.execute !== 'function') {
                        sendLog(`Event invalide: ${path.basename(fullPath)}`, 'WARN');
                        continue;
                    }
                    if (event.once) {
                        client.once(event.name, (...args) => event.execute(...args, client));
                    } else {
                        client.on(event.name, (...args) => event.execute(...args, client));
                    }
                    count++;
                }
            } catch (error) {
                sendLog(`Erreur event ${path.basename(fullPath)}: ${error.message}`, 'ERROR');
            }
        }
    }
    return count;
}

// =============================================
// 6. CHARGEUR DE COMMANDES
// =============================================
function loadCommands(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    let count = 0;
    for (const item of items) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            count += loadCommands(fullPath);
        } else if (item.name.endsWith('.js')) {
            try {
                delete require.cache[require.resolve(fullPath)];
                const command = require(fullPath);
                if (!command.data || !command.execute) {
                    sendLog(`Commande invalide: ${path.basename(fullPath)}`, 'WARN');
                    continue;
                }
                if (client.commands.has(command.data.name)) {
                    sendLog(`DOUBLON: "${command.data.name}" dans ${path.basename(fullPath)}`, 'ERROR');
                    continue;
                }
                client.commands.set(command.data.name, command);
                count++;
            } catch (error) {
                sendLog(`Erreur commande ${path.basename(fullPath)}: ${error.message}`, 'ERROR');
            }
        }
    }
    return count;
}

// =============================================
// 7. ÉVÉNEMENT READY
// =============================================
client.once('clientReady', async () => {
    sendLog(`Bot connecté: ${client.user.tag}`, 'SUCCESS');

    if (CONSOLE_CHANNEL_ID) {
        consoleChannel = client.channels.cache.get(CONSOLE_CHANNEL_ID);
        if (consoleChannel) {
            botReady = true;
            sendLog(`Salon console: #${consoleChannel.name}`, 'SUCCESS');

            // Embed de démarrage
            const uptime = process.uptime();
            const embed = new EmbedBuilder()
                .setTitle('🚀 Bot Démarré')
                .setColor(0x57F287)
                .addFields(
                    { name: '🤖 Bot', value: client.user.tag, inline: true },
                    { name: '🏓 Latence', value: `${client.ws.ping}ms`, inline: true },
                    { name: '⏱️ Démarrage', value: `${uptime.toFixed(1)}s`, inline: true },
                    { name: '🌐 Serveurs', value: `${client.guilds.cache.size}`, inline: true },
                    { name: '👥 Utilisateurs', value: `${client.users.cache.size}`, inline: true },
                    { name: '📝 Commandes', value: `${client.commands.size}`, inline: true },
                    { name: '💻 Node.js', value: process.version, inline: true },
                    { name: '📦 discord.js', value: `v${require('discord.js').version}`, inline: true },
                    { name: '🔌 Pterodactyl', value: PteroAPI.isConfigured() ? '🟢 Connecté' : '🔴 Non configuré', inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Orinstone Bot v2.2' });

            try { await consoleChannel.send({ embeds: [embed] }); } catch (e) {}
            await flushLogBuffer();
        } else {
            sendLog(`Salon console ID ${CONSOLE_CHANNEL_ID} introuvable !`, 'ERROR');
            botReady = true;
        }
    } else {
        sendLog('CONSOLE_CHANNEL_ID non configuré - logs Discord désactivés', 'WARN');
        botReady = true;
    }
});

// =============================================
// 8. DÉMARRAGE
// =============================================
async function start() {
    sendLog('Démarrage Orinstone Bot v2.2...', 'STARTUP');

    // Événements
    const eventsPath = path.join(__dirname, 'events');
    if (fs.existsSync(eventsPath)) {
        const n = loadEvents(eventsPath);
        sendLog(`${n} événement(s) chargé(s)`, 'SUCCESS');
    } else {
        sendLog('Dossier events/ introuvable', 'WARN');
    }

    // Commandes
    const commandsPath = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsPath)) {
        const n = loadCommands(commandsPath);
        sendLog(`${n} commande(s) chargée(s)`, 'SUCCESS');
    } else {
        sendLog('Dossier commands/ introuvable', 'WARN');
    }

    // Panel web
    try {
        const { startWebServer } = require('./managers/WebPanel');
        startWebServer(client);
        sendLog(`Panel web sur le port ${config.webPort}`, 'SUCCESS');
    } catch (error) {
        sendLog(`Erreur panel web: ${error.message}`, 'ERROR');
    }

    // Connexion Discord
    try {
        sendLog('Connexion Discord...', 'STARTUP');
        await client.login(config.token);
    } catch (error) {
        sendLog(`Échec connexion Discord: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

start();