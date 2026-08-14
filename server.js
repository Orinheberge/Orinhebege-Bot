// =============================================
// 0. CHARGEMENT DES VARIABLES D'ENVIRONNEMENT
// =============================================
require('dotenv').config();

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');

// =============================================
// CONFIGURATION DEPUIS LES VARIABLES D'ENV
// =============================================
const config = {
    token:         process.env.DISCORD_TOKEN,
    clientId:      process.env.DISCORD_CLIENT_ID,
    guildId:       process.env.DISCORD_GUILD_ID,
    prefix:        process.env.BOT_PREFIX || '!',
    panelPassword: process.env.PANEL_PASSWORD,
    webPort:       parseInt(process.env.WEB_PORT) || 26162
};

// Vérification des variables obligatoires au démarrage
const requiredEnvVars = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DISCORD_GUILD_ID', 'PANEL_PASSWORD'];
const missingVars = requiredEnvVars.filter(key => !process.env[key]);

if (missingVars.length > 0) {
    console.error('❌ Variables d\'environnement manquantes :');
    missingVars.forEach(v => console.error(`   → ${v}`));
    console.error('\n   Copiez .env.example vers .env et remplissez les valeurs.');
    console.error('   Ou configurez-les dans votre panel d\'hébergement.\n');
    process.exit(1);
}

console.log('✅ Variables d\'environnement chargées');

// =============================================
// 1. INITIALISATION DU CLIENT DISCORD
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

// Collection pour stocker les commandes en mémoire
client.commands = new Collection();

// Exposer la config globalement sur le client (accessible partout via client.config)
client.config = config;

// =============================================
// 2. GESTION DES ERREURS GLOBALES
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
// 3. CHARGEUR DYNAMIQUE D'ÉVÉNEMENTS
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
                // Vider le cache pour éviter les problèmes en dev
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
// 4. CHARGEUR DYNAMIQUE DE COMMANDES
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
                // Vider le cache pour éviter les problèmes en dev
                delete require.cache[require.resolve(fullPath)];

                const command = require(fullPath);

                if (!command.data || !command.execute) {
                    console.warn(`⚠️  Commande invalide ignorée: ${fullPath}`);
                    continue;
                }

                // Détection de doublons
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
// 5. DÉMARRAGE
// =============================================
async function start() {
    console.log('\n🚀 Démarrage d\'Orinstone Bot v2.0...\n');

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

// Lancer le bot
start();