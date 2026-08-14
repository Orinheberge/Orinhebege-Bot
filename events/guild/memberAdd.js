const { EmbedBuilder } = require('discord.js');
const Database = require('../../managers/Database');
const Logger = require('../../utils/logger');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        // === AUTO-RÔLE ===
        const autoRoleId = Database.get('autoRole');
        if (autoRoleId && Database.isFeatureEnabled('welcomeMessages')) {
            try {
                const role = member.guild.roles.cache.get(autoRoleId);
                if (role) {
                    await member.roles.add(role).catch(err => {
                        Logger.console('error', `Auto-rôle ${member.user.tag}: ${err.message}`, 'AUTOROLE');
                    });
                    Logger.success(member.guild, 'Auto-Rôle Attribué', `Le rôle ${role.name} a été attribué à ${member.user.tag}`);
                }
            } catch (e) {
                Logger.console('error', `Auto-rôle erreur: ${e.message}`, 'AUTOROLE');
            }
        }

        // === MESSAGE BIENVENUE ===
        if (!Database.isFeatureEnabled('welcomeMessages')) return;

        const channelId = Database.get('welcomeChannel');
        if (!channelId) return;
        const channel = member.guild.channels.cache.get(channelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle('📥 Nouveau membre !')
            .setDescription(`Bienvenue à ${member} sur **${member.guild.name}** ! 🎉\nNous sommes **${member.guild.memberCount}** membres.`)
            .setThumbnail(member.user.displayAvatarURL())
            .setColor(0x2ecc71)
            .setTimestamp();

        channel.send({ embeds: [embed] }).catch(() => {});
    }
};