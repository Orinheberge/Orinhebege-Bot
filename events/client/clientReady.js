const { REST, Routes } = require('discord.js');
const config = require('../../config.json');
const LevelDB = require('../../managers/LevelDB');
const StatusChecker = require('../../managers/StatusChecker');
const AutoMod = require('../../managers/AutoMod');
const Logger = require('../../utils/logger');
const Database = require('../../managers/Database');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`✅ Bot connecté en tant que ${client.user.tag}`);

        // === Enregistrement des Slash Commands ===
        // ✅ Utilise client.commands DÉJÀ rempli par server.js (pas de rechargement disque)
        const commands = Array.from(client.commands.values())
            .map(cmd => cmd.data.toJSON());

        // ✅ Détection de doublons AVANT envoi à Discord
        const seen = new Set();
        const uniqueCommands = [];
        for (const cmd of commands) {
            if (seen.has(cmd.name)) {
                console.error(`🔴 DOUBLON COMMANDÉ DÉTECTÉ ET IGNORÉ: "${cmd.name}"`);
                continue;
            }
            seen.add(cmd.name);
            uniqueCommands.push(cmd);
        }

        if (uniqueCommands.length !== commands.length) {
            console.warn(`⚠️  ${commands.length - uniqueCommands.length} commande(s) dupliquée(s) ignorée(s)`);
        }

        try {
            const rest = new REST({ version: '10' }).setToken(config.token);
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: uniqueCommands }
            );
            console.log(`✅ ${uniqueCommands.length} slash commands enregistrées`);
        } catch (error) {
            console.error('❌ Erreur enregistrement commandes:', error);
        }

        // === Démarrage des systèmes périodiques ===
        LevelDB.startVoiceXPSystem(client);
        const channel = await client.channels.fetch('1505013861932208221');
        StatusChecker.startStatusInterval(channel, 5 * 60 * 1000);
        AutoMod.startCacheCleanup();

        // === Rotation du statut bot ===
        const botStatuses = [
            { type: 3, text: () => `${client.guilds.cache.size} serveur(s)` },
            { type: 0, text: () => `avec ${client.users.cache.size} membres` },
            { type: 3, text: () => 'les commandes (/help)' },
            { type: 5, text: () => 'sur Orinstone Network' },
            { type: 2, text: () => 'vos demandes de support' },
            { type: 0, text: () => '/rank pour voir ton niveau' },
            { type: 2, text: () => `${client.ws.ping}ms de latence` }
        ];

        let statusIndex = 0;
        const updateStatus = async () => {
            if (!client.isReady() || !Database.isFeatureEnabled('botStatusRotation')) return;
            try {
                const s = botStatuses[statusIndex];
                const text = typeof s.text === 'function' ? s.text() : s.text;
                await client.user.setPresence({
                    activities: [{ name: text, type: s.type }],
                    status: 'online'
                });
                statusIndex = (statusIndex + 1) % botStatuses.length;
            } catch (e) { /* silencieux */ }
        };

        updateStatus();
        setInterval(updateStatus, 15 * 60 * 1000);

        Logger.console('success', 'Tous les systèmes sont démarrés !', 'READY');
    }
};