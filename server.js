const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');

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
    // Ne pas quitter automatiquement pour permettre au bot de rester en ligne
    // mais logger l'erreur critique
});

// =============================================
// 3. CHARGEUR DYNAMIQUE D'ÉVÉNEMENTS
// =============================================
/**
 * Charge récursivement tous les fichiers .js du dossier events/
 * Supporte les exports objet unique ET tableau (multi-events)
 */
function loadEvents(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    let count = 0;

    for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
            count += loadEvents(fullPath);
        } else if (item.name.endsWith('.js')) {
            try {
                const exported = require(fullPath);
                // Supporte Array (channelEvents.js) et Object unique
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
/**
 * Charge récursivement toutes les commandes slash du dossier commands/
 */
function loadCommands(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    let count = 0;

    for (const item of items) {
        const fullPath = path.join(dir, item.name);

        if (item.isDirectory()) {
            count += loadCommands(fullPath);
        } else if (item.name.endsWith('.js')) {
            try {
                const command = require(fullPath);

                if (!command.data || !command.execute) {
                    console.warn(`⚠️  Commande invalide ignorée: ${fullPath}`);
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
    console.log('🚀 Démarrage d\'Orinstone Bot...\n');

    // Charger les événements
    const eventsPath = path.join(__dirname, 'events');
    if (fs.existsSync(eventsPath)) {
        const eventCount = loadEvents(eventsPath);
        console.log(`✅ ${eventCount} événement(s) chargé(s)\n`);
    } else {
        console.warn('⚠️  Dossier events/ introuvable');
    }

    // Charger les commandes
    const commandsPath = path.join(__dirname, 'commands');
    if (fs.existsSync(commandsPath)) {
        const cmdCount = loadCommands(commandsPath);
        console.log(`✅ ${cmdCount} commande(s) chargée(s)\n`);
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