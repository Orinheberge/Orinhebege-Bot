const Logger = require('../../utils/logger');

// Export multiple events depuis un seul fichier
// Le chargeur dans index.js doit être adapté OU vous pouvez créer des fichiers séparés
// Ci-dessous : version multi-events avec un chargeur adapté

module.exports = [
    {
        name: 'channelCreate',
        async execute(channel, client) {
            if (!channel.guild) return;
            await Logger.send(channel.guild, {
                title: 'Salon Créé',
                description: `**${channel.name}** (${channel.type})`,
                level: 'success'
            });
        }
    },
    {
        name: 'channelUpdate',
        async execute(oldChannel, newChannel, client) {
            if (oldChannel.name === newChannel.name) return;
            await Logger.send(newChannel.guild, {
                title: 'Salon Modifié',
                description: `${oldChannel.name} → **${newChannel.name}**`,
                level: 'warn'
            });
        }
    },
    {
        name: 'roleCreate',
        async execute(role, client) {
            await Logger.send(role.guild, {
                title: 'Rôle Créé',
                description: `**${role.name}** (${role.hexColor})`,
                level: 'success'
            });
        }
    },
    {
        name: 'roleUpdate',
        async execute(oldRole, newRole, client) {
            if (oldRole.name === newRole.name) return;
            await Logger.send(newRole.guild, {
                title: 'Rôle Modifié',
                description: `${oldRole.name} → **${newRole.name}**`,
                level: 'warn'
            });
        }
    }
];