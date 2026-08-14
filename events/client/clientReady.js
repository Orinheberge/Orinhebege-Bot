const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');
const LevelDB = require('../../managers/LevelDB');
const StatusChecker = require('../../managers/StatusChecker');
const Logger = require('../../utils/logger');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`✅ Bot connecté en tant que ${client.user.tag}`);

        // === Enregistrement des Slash Commands ===
        const commands = [];
        const loadCommands = (dir) => {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                if (item.isDirectory()) loadCommands(fullPath);
                else if (item.name.endsWith('.js')) {
                    const cmd = require(fullPath);
                    if (cmd.data) commands.push(cmd.data.toJSON());
                }
            }
        };
        loadCommands(path.join(__dirname, '../../commands'));

        try {
            const rest = new REST({ version: '10' }).setToken(config.token);
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands }
            );
            console.log(`✅ ${commands.length} slash commands enregistrées`);
        } catch (error) {
            console.error('❌ Erreur enregistrement commandes:', error);
        }

        // === Démarrage des systèmes périodiques ===
        LevelDB.startVoiceXPSystem(client);
        StatusChecker.startStatusInterval(client);

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
            const Database = require('../../managers/Database');
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