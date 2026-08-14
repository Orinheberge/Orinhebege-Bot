// =============================================
// 0. CHARGEMENT DES VARIABLES D'ENVIRONNEMENT
// =============================================
require('dotenv').config();

const {
    Client, GatewayIntentBits, Partials, Collection,
    EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
    ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');

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
    console.error('❌ Variables d\'environnement manquantes :');
    missingVars.forEach(v => console.error(`   → ${v}`));
    process.exit(1);
}

// =============================================
// SYSTÈME DE LOG VERS CONSOLE DISCORD
// =============================================
const CONSOLE_CHANNEL_ID = process.env.CONSOLE_CHANNEL_ID || null;
const CONSOLE_OWNERS = (process.env.CONSOLE_OWNERS || '').split(',').map(id => id.trim()).filter(Boolean);

// Buffer pour stocker les logs avant que le bot soit connecté
const logBuffer = [];
let botReady = false;
let consoleChannel = null;

function getTimestamp() {
    return new Date().toLocaleString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: 'Europe/Paris'
    });
}

/**
 * Envoie un log dans la console Discord ET dans la console terminal
 */
async function sendLog(message, type = 'INFO') {
    const timestamp = getTimestamp();
    const emojis = { INFO: 'ℹ️', SUCCESS: '✅', WARN: '⚠️', ERROR: '❌', STARTUP: '🚀', CONSOLE: '🖥️' };
    const emoji = emojis[type] || 'ℹ️';
    const formatted = `[${timestamp}] ${emoji} [${type}] ${message}`;

    // Toujours afficher dans le terminal
    if (type === 'ERROR') console.error(formatted);
    else if (type === 'WARN') console.warn(formatted);
    else console.log(formatted);

    // Envoyer dans Discord si prêt
    if (botReady && consoleChannel) {
        try {
            // Discord limite : 2000 caractères par message
            const truncated = formatted.length > 1900 ? formatted.substring(0, 1900) + '...' : formatted;
            await consoleChannel.send(`\`${truncated}\``);
        } catch (e) {
            // Silencieux pour éviter les boucles infinies
        }
    } else {
        // Stocker dans le buffer
        logBuffer.push({ message: formatted, type, timestamp: Date.now() });
        // Garder seulement les 50 derniers
        if (logBuffer.length > 50) logBuffer.shift();
    }
}

/**
 * Envoie un embed stylisé dans la console Discord
 */
async function sendEmbedLog(title, description, color = 0x2f3136, fields = []) {
    if (!botReady || !consoleChannel) return;
    try {
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description.substring(0, 4000))
            .setColor(color)
            .setTimestamp();
        if (fields.length > 0) embed.addFields(fields);
        await consoleChannel.send({ embeds: [embed] });
    } catch (e) {}
}

/**
 * Vide le buffer de logs dans Discord
 */
async function flushLogBuffer() {
    if (!consoleChannel || logBuffer.length === 0) return;

    const embed = new EmbedBuilder()
        .setTitle('📋 Logs de démarrage')
        .setColor(0x5865F2)
        .setTimestamp();

    const lines = logBuffer.map(l => l.message);
    const content = lines.join('\n');

    if (content.length > 4000) {
        // Découper en plusieurs messages
        for (let i = 0; i < lines.length; i += 20) {
            const chunk = lines.slice(i, i + 20).join('\n');
            try {
                await consoleChannel.send(`\`\`\`\n${chunk.substring(0, 1900)}\n\`\`\``);
            } catch (e) {}
        }
    } else {
        embed.setDescription(`\`\`\`\n${content}\n\`\`\``);
        try { await consoleChannel.send({ embeds: [embed] }); } catch (e) {}
    }

    logBuffer.length = 0;
}

// =============================================
// REDIRECTION DES console.log / console.error
// =============================================
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

console.log = (...args) => {
    originalConsoleLog.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    // Ne pas re-log les messages qui viennent déjà de sendLog (éviter boucle)
    if (!msg.includes('[INFO]') && !msg.includes('[SUCCESS]') && !msg.includes('[STARTUP]')) {
        sendLog(msg, 'INFO').catch(() => {});
    }
};

console.error = (...args) => {
    originalConsoleError.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
    if (!msg.includes('[ERROR]')) {
        sendLog(msg, 'ERROR').catch(() => {});
    }
};

console.warn = (...args) => {
    originalConsoleWarn.apply(console, args);
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
    if (!msg.includes('[WARN]')) {
        sendLog(msg, 'WARN').catch(() => {});
    }
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
    partials: [
        Partials.Channel,
        Partials.Message,
        Partials.User,
        Partials.GuildMember,
        Partials.Reaction
    ]
});

client.commands = new Collection();
client.config = config;

// Exposer les fonctions de log sur le client
client.sendLog = sendLog;
client.sendEmbedLog = sendEmbedLog;

// =============================================
// 2. ERREURS GLOBALES
// =============================================
client.on('error', (error) => {
    sendLog(`[DISCORD] ${error.message}`, 'ERROR');
});

process.on('unhandledRejection', (error) => {
    sendLog(`[UNHANDLED REJECTION] ${error?.stack || error}`, 'ERROR');
});

process.on('uncaughtException', (error) => {
    sendLog(`[UNCAUGHT EXCEPTION] ${error?.stack || error}`, 'ERROR');
});

// =============================================
// 3. CONSOLE DISCORD (salon dédié)
// =============================================
const consoleSessions = new Map();

const CONSOLE_COMMANDS = {
    help: {
        desc: 'Affiche cette aide',
        execute: () => [
            '╔══════════════════════════════════════╗',
            '║       📋 COMMANDES CONSOLE           ║',
            '╠══════════════════════════════════════╣',
            '║  help        → Cette aide            ║',
            '║  status      → Statut du bot         ║',
            '║  stats       → Statistiques          ║',
            '║  uptime      → Temps fonctionnement  ║',
            '║  memory      → Usage mémoire         ║',
            '║  guilds      → Liste serveurs        ║',
            '║  commands    → Slash commands        ║',
            '║  logs [n]    → Derniers logs         ║',
            '║  eval <code> → Exécuter JS ⚠️       ║',
            '║  say <id> <msg> → Message salon     ║',
            '║  broadcast <msg> → Tous serveurs    ║',
            '║  restart     → Redémarrer le bot     ║',
            '║  clear       → Effacer console       ║',
            '║  close       → Fermer console        ║',
            '╚══════════════════════════════════════╝'
        ].join('\n')
    },
    status: {
        desc: 'Statut du bot',
        execute: () => {
            const u = process.uptime();
            const d = Math.floor(u / 86400), h = Math.floor((u % 86400) / 3600), m = Math.floor((u % 3600) / 60);
            return [
                '📊 **Statut du bot**',
                `├── 🟢 En ligne`,
                `├── 🏓 Latence: ${client.ws.ping}ms`,
                `├──  Serveurs: ${client.guilds.cache.size}`,
                `├── 👥 Users: ${client.users.cache.size}`,
                `├── 📝 Commands: ${client.commands.size}`,
                `├── ⏱️ Uptime: ${d}j ${h}h ${m}m`,
                `└── 💻 Node: ${process.version}`
            ].join('\n');
        }
    },
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
    uptime: {
        desc: 'Uptime',
        execute: () => {
            const u = process.uptime();
            return `⏱️ ${Math.floor(u / 86400)}j ${Math.floor((u % 86400) / 3600)}h ${Math.floor((u % 3600) / 60)}m ${Math.floor(u % 60)}s`;
        }
    },
    memory: {
        desc: 'Mémoire',
        execute: () => {
            const m = process.memoryUsage();
            const f = b => `${(b / 1024 / 1024).toFixed(2)} MB`;
            return `💾 RSS: ${f(m.rss)} | Heap: ${f(m.heapUsed)}/${f(m.heapTotal)} | Ext: ${f(m.external)}`;
        }
    },
    guilds: {
        desc: 'Serveurs',
        execute: () => client.guilds.cache.map(g => `• **${g.name}** (${g.memberCount}) \`${g.id}\``).join('\n') || 'Aucun serveur'
    },
    commands: {
        desc: 'Slash commands',
        execute: () => client.commands.map(c => `• \`/${c.data.name}\` — ${c.data.description || '-'}`).join('\n') || 'Aucune commande'
    },
    logs: {
        desc: 'Derniers logs',
        execute: (args) => {
            const n = parseInt(args[0]) || 10;
            const recent = logBuffer.slice(-Math.min(n, 50));
            if (!recent.length) return '📭 Aucun log en buffer';
            return recent.map(l => l.message).join('\n');
        }
    },
    eval: {
        desc: 'Exécuter JS ⚠️',
        execute: async (args) => {
            const code = args.join(' ');
            if (!code) return 'Usage: `eval <code>`';
            try {
                const result = await eval(code);
                const out = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
                return `✅\n\`\`\`js\n${out.substring(0, 1800)}\n\`\`\``;
            } catch (e) { return `❌\n\`\`\`\n${e.message}\n\`\`\``; }
        }
    },
    say: {
        desc: 'Message dans un salon',
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
        desc: 'Message tous serveurs',
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
            return `📢 Envoyé sur ${sent}/${client.guilds.cache.size} serveurs`;
        }
    },
    restart: {
        desc: 'Redémarrer',
        execute: () => {
            sendLog('Redémarrage demandé via console Discord', 'WARN');
            setTimeout(() => process.exit(0), 2000);
            return '🔄 Redémarrage dans 2s...';
        }
    },
    clear: { desc: 'Effacer', execute: () => '__CLEAR__' },
    close: { desc: 'Fermer', execute: () => '__CLOSE__' }
};

async function executeConsoleCmd(input, userId) {
    const parts = input.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const command = CONSOLE_COMMANDS[cmd];
    if (!command) return `❌ Inconnu: \`${cmd}\`. Tapez \`help\`.`;
    try { return await command.execute(args, userId); }
    catch (e) { return `❌ ${e.message}`; }
}

function buildConsoleEmbed(history = []) {
    const embed = new EmbedBuilder()
        .setTitle('🖥️ Console Orinstone')
        .setColor(0x2f3136)
        .setTimestamp()
        .setFooter({ text: 'help pour la liste • Owner uniquement' });

    if (!history.length) {
        embed.setDescription('```diff\n+ Console prête. Tapez "help".\n```');
    } else {
        const recent = history.slice(-8);
        const lines = recent.map(e =>
            e.type === 'input'
                ? `> ❯ ${e.content}`
                : (e.content.length > 300 ? e.content.substring(0, 300) + '...' : e.content)
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
// 4. CHARGEUR DYNAMIQUE D'ÉVÉNEMENTS
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
                        sendLog(`Event invalide ignoré: ${fullPath}`, 'WARN');
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
                sendLog(`Erreur chargement event ${path.basename(fullPath)}: ${error.message}`, 'ERROR');
            }
        }
    }
    return count;
}

// =============================================
// 5. CHARGEUR DYNAMIQUE DE COMMANDES
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
                    sendLog(`Commande invalide ignorée: ${path.basename(fullPath)}`, 'WARN');
                    continue;
                }
                if (client.commands.has(command.data.name)) {
                    sendLog(`DOUBLON DÉTECTÉ: "${command.data.name}" dans ${path.basename(fullPath)}`, 'ERROR');
                    continue;
                }

                client.commands.set(command.data.name, command);
                count++;
            } catch (error) {
                sendLog(`Erreur chargement commande ${path.basename(fullPath)}: ${error.message}`, 'ERROR');
            }
        }
    }
    return count;
}

// =============================================
// 6. ÉVÉNEMENT READY (intégré directement)
// =============================================
client.once('clientReady', async () => {
    sendLog(`Bot connecté en tant que ${client.user.tag}`, 'SUCCESS');

    // Récupérer le salon console
    if (CONSOLE_CHANNEL_ID) {
        consoleChannel = client.channels.cache.get(CONSOLE_CHANNEL_ID);
        if (consoleChannel) {
            botReady = true;
            sendLog(`Salon console trouvé: #${consoleChannel.name}`, 'SUCCESS');

            // Envoyer un embed de démarrage
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
                    { name: '📦 discord.js', value: `v${require('discord.js').version}`, inline: true }
                )
                .setTimestamp()
                .setFooter({ text: 'Orinstone Bot v2.1' });

            try { await consoleChannel.send({ embeds: [embed] }); } catch (e) {}

            // Vider le buffer de logs
            await flushLogBuffer();

        } else {
            sendLog(`Salon console ID ${CONSOLE_CHANNEL_ID} introuvable !`, 'ERROR');
        }
    } else {
        sendLog('CONSOLE_CHANNEL_ID non configuré - logs Discord désactivés', 'WARN');
        botReady = true; // Activer quand même pour le panel web
    }
});

// =============================================
// 7. DÉMARRAGE
// =============================================
async function start() {
    sendLog('Démarrage d\'Orinstone Bot v2.1...', 'STARTUP');

    // Charger les événements
    const eventsPath = path.join(__dirname, 'events');
    if (fs.existsSync(eventsPath)) {
        const eventCount = loadEvents(eventsPath);
        sendLog(`${eventCount} événement(s) chargé(s)`, 'SUCCESS');
    } else {
        sendLog('Dossier events/ introuvable', 'WARN');
    }

    // Charger les commandes
    const commandsPath = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsPath)) {
        const cmdCount = loadCommands(commandsPath);
        sendLog(`${cmdCount} commande(s) chargée(s)`, 'SUCCESS');
    } else {
        sendLog('Dossier commands/ introuvable', 'WARN');
    }

    // Démarrer le panel web
    try {
        const { startWebServer } = require('./managers/WebPanel');
        startWebServer(client);
        sendLog(`Panel web démarré sur le port ${config.webPort}`, 'SUCCESS');
    } catch (error) {
        sendLog(`Erreur démarrage panel web: ${error.message}`, 'ERROR');
    }

    // Connexion à Discord
    try {
        sendLog('Connexion à Discord en cours...', 'STARTUP');
        await client.login(config.token);
    } catch (error) {
        sendLog(`Échec de connexion Discord: ${error.message}`, 'ERROR');
        process.exit(1);
    }
}

start();