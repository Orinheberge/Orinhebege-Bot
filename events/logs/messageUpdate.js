const Logger = require('../../utils/logger');

module.exports = {
    name: 'messageDelete',
    async execute(message, client) {
        if (!message.author || message.author.bot) return;

        await Logger.send(message.guild, {
            title: 'Message Supprimé',
            level: 'error',
            fields: [
                { name: 'Auteur', value: `${message.author.tag}`, inline: true },
                { name: 'Salon', value: `${message.channel}`, inline: true },
                { name: 'Contenu', value: message.content?.substring(0, 1024) || '*vide ou non en cache*' }
            ]
        });
    }
};