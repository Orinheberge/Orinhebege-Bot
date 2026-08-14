const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('kick').setDescription('Expulser un membre')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison')),
    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Aucune raison';
        const member = interaction.guild.members.cache.get(user.id);
        if (!member) return interaction.reply({ content: '❌ Membre introuvable.', ephemeral: true });
        if (!member.kickable) return interaction.reply({ content: '❌ Impossible d\'expulser.', ephemeral: true });

        try {
            await member.kick(reason);
            await Logger.moderation(interaction.guild, 'Membre Expulsé 👢', null, [
                { name: '👤 Utilisateur', value: `${user.tag}`, inline: true },
                { name: '🛡️ Modérateur', value: interaction.user.tag, inline: true },
                { name: '📝 Raison', value: reason }
            ]);
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('👢 Membre Expulsé').setColor(0xe67e22).setDescription(`**${user.tag}** expulsé.\nRaison : ${reason}`).setTimestamp()] });
        } catch (e) {
            await interaction.reply({ content: '❌ Erreur.', ephemeral: true });
        }
    }
};