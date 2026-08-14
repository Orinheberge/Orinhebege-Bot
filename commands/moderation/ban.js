const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ban').setDescription('Bannir un membre')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(o => o.setName('user').setDescription('Membre à bannir').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison'))
        .addIntegerOption(o => o.setName('days').setDescription('Jours de messages (0-7)').setMinValue(0).setMaxValue(7)),
    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'Aucune raison';
        const days = interaction.options.getInteger('days') || 0;
        const member = interaction.guild.members.cache.get(user.id);
        if (member && !member.bannable) return interaction.reply({ content: '❌ Impossible de bannir ce membre.', ephemeral: true });

        try {
            await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: days * 86400 });
            await Logger.moderation(interaction.guild, 'Membre Banni 🔨', null, [
                { name: '👤 Utilisateur', value: `${user.tag} (${user.id})`, inline: true },
                { name: '🛡️ Modérateur', value: interaction.user.tag, inline: true },
                { name: '📝 Raison', value: reason },
                { name: '📅 Jours supprimés', value: `${days}`, inline: true }
            ]);
            await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔨 Membre Banni').setColor(0xe74c3c).setDescription(`**${user.tag}** a été banni.\nRaison : ${reason}`).setTimestamp()] });
        } catch (e) {
            await interaction.reply({ content: '❌ Erreur lors du bannissement.', ephemeral: true });
        }
    }
};