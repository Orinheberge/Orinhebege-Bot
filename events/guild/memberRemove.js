const { EmbedBuilder } = require('discord.js');
const Database = require('../../managers/Database');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        if (!Database.isFeatureEnabled('leaveMessages')) return;

        const channelId = Database.get('welcomeChannel');
        if (!channelId) return;
        const channel = member.guild.channels.cache.get(channelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle('📤 Départ d\'un membre')
            .setDescription(`**${member.user?.tag || 'Inconnu'}** a quitté le serveur. 😢\nNous sommes **${member.guild.memberCount}** membres.`)
            .setThumbnail(member.user.displayAvatarURL())
            .setColor(0xe74c3c)
            .setTimestamp();

        channel.send({ embeds: [embed] }).catch(() => {});
    }
};