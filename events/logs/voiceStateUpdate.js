const Logger = require('../../utils/logger');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        const member = newState.member || oldState.member;
        if (!member || !member.user) return;

        let title, description, level;

        if (!oldState.channelId && newState.channelId) {
            title = 'Connexion Vocal';
            description = `**${member.user.tag}** a rejoint ${newState.channel}`;
            level = 'success';
        } else if (oldState.channelId && !newState.channelId) {
            title = 'Déconnexion Vocal';
            description = `**${member.user.tag}** a quitté ${oldState.channel}`;
            level = 'error';
        } else if (oldState.channelId !== newState.channelId) {
            title = 'Changement Vocal';
            description = `**${member.user.tag}** : ${oldState.channel} → ${newState.channel}`;
            level = 'info';
        } else {
            return; // Mute/deaf uniquement, pas loggé
        }

        await Logger.send(member.guild, { title, description, level });
    }
};