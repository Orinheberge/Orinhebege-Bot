const Logger = require('../../utils/logger');
const Database = require('../../managers/Database');

module.exports = {
    name: 'messageReactionAdd',
    async execute(reaction, user, client) {
        if (user.bot) return;
        if (!Database.isFeatureEnabled('reactionReglement')) return;

        if (reaction.partial) {
            try { await reaction.fetch(); } catch (e) { return; }
        }

        // ID de l'emoji personnalisé du règlement
        if (reaction.emoji.id === '1535995172419272774' && reaction.message.author.id === client.user.id) {
            Logger.console('info', `${user.tag} a accepté le règlement`, 'REGLEMENT');
            await Logger.send(reaction.message.guild, {
                title: 'Règlement Accepté 📜',
                description: `${user} a accepté le règlement.`,
                level: 'success'
            });
        }
    }
};