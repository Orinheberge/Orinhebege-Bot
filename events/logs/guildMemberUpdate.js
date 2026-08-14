const Logger = require('../../utils/logger');

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember, client) {
        // Boost détecté
        if (!oldMember.premiumSince && newMember.premiumSince) {
            await Logger.send(newMember.guild, {
                title: 'Boost Serveur 🚀',
                description: `**${newMember.user?.tag || 'Inconnu'}** vient de booster le serveur ! 💎`,
                level: 'success'
            });
        }
    }
};