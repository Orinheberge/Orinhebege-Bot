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
    console.error('\n   Copiez .env.example vers .env et remplissez les valeurs.\n');
    process.exit(1);
}

console.log('✅ Variables d\'environnement chargées');

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

// =============================================
// 2. ERREURS GLOBALES
// =============================================
client.on('error', (error) => {
    console.error(`[DISCORD ERROR] ${error.message}`);
});

process.on('unhandledRejection', (error) => {
    console.error('[UNHANDLED REJECTION]', error);
});

process.on('uncaughtException', (error) => {
    console.error('[UNCAUGHT EXCEPTION]', error);
});

// =============================================
// 3. CONSOLE DISCORD (salon dédié)
// =============================================
const CONSOLE_CHANNEL_ID = process.env.CONSOLE_CHANNEL_ID || null;
const CONSOLE_OWNERS = (process.env.CONSOLE_OWNERS || '').split(',').map(id => id.trim()).filter(Boolean);
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
        execute: () => { setTimeout(() => process.exit(0), 2000); return '🔄 Redémarrage dans 2s...'; }
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
                        console.warn(`⚠️  Event invalide ignoré: ${fullPath}`);
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
                console.error(`❌ Erreur chargement event ${fullPath}:`, error.message);
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
                    console.warn(`⚠️  Commande invalide ignorée: ${fullPath}`);
                    continue;
                }
                if (client.commands.has(command.data.name)) {
                    console.error(`🔴 DOUBLON DÉTECTÉ: "${command.data.name}" dans ${fullPath}`);
                    continue;
                }

                client.commands.set(command.data.name, command);
                count++;
            } catch (error) {
                console.error(`❌ Erreur chargement commande ${fullPath}:`, error.message);
            }
        }
    }
    return count;
}

// =============================================
// 6. DÉMARRAGE
// =============================================
async function start() {
    console.log('\n🚀 Démarrage d\'Orinstone Bot v2.1...\n');

    // Charger les événements
    const eventsPath = path.join(__dirname, 'events');
    if (fs.existsSync(eventsPath)) {
        const eventCount = loadEvents(eventsPath);
        console.log(`✅ ${eventCount} événement(s) chargé(s)`);
    } else {
        console.warn('⚠️  Dossier events/ introuvable');
    }

    // Charger les commandes
    const commandsPath = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsPath)) {
        const cmdCount = loadCommands(commandsPath);
        console.log(`✅ ${cmdCount} commande(s) chargée(s)`);
    } else {
        console.warn('⚠️  Dossier commands/ introuvable');
    }

    // Démarrer le panel web
    try {
        const { startWebServer } = require('./managers/WebPanel');
        startWebServer(client);
    } catch (error) {
        console.error('❌ Erreur démarrage panel web:', error.message);
    }

    // Connexion à Discord
    try {
        await client.login(config.token);
    } catch (error) {
        console.error('❌ Échec de connexion Discord:', error.message);
        process.exit(1);
    }
}

start();