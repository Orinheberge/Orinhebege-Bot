const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Database = require('../../managers/Database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addlevelrole')
        .setDescription('Ajoute un rôle de récompense pour un niveau')
        .addIntegerOption(o => o.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1).setMaxValue(5000))
        .addRoleOption(o => o.setName('role').setDescription('Rôle à donner').setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const l = interaction.options.getInteger('niveau');
        const r = interaction.options.getRole('role');
        const lr = Database.get('levelRoles') || {};
        lr[l] = r.id;
        Database.set('levelRoles', lr);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Rôle Ajouté').setDescription(`${r} sera donné au niveau **${l}**.`).setColor(0x2ecc71).setTimestamp()] });
    }
};