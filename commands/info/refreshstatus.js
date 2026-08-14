const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('../../managers/Database');
const StatusChecker = require('../../managers/StatusChecker');

module.exports = {
    data: new SlashCommandBuilder().setName('refresh-status').setDescription('Force la mise à jour du statut').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const chId = Database.get('statusChannel');
        if (!chId) return interaction.editReply('❌ Aucun salon configuré (`/setstatus`).');
        const channel = interaction.guild.channels.cache.get(chId);
        if (!channel) return interaction.editReply('❌ Salon introuvable.');
        try { await StatusChecker.updateStatusMessage(channel); await interaction.editReply(`✅ Statut mis à jour dans ${channel} !`); }
        catch (e) { await interaction.editReply('❌ Erreur.'); }
    }
};