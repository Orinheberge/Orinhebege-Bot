const { SlashCommandBuilder } = require('discord.js');
const Database = require('../../managers/Database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removelevelrole')
        .setDescription('Retire un rôle de récompense')
        .addIntegerOption(o => o.setName('niveau').setDescription('Niveau à retirer').setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const l = interaction.options.getInteger('niveau');
        const lr = Database.get('levelRoles') || {};
        if (!lr[l]) return interaction.reply({ content: `❌ Aucun rôle pour le niveau ${l}.`, ephemeral: true });
        delete lr[l];
        Database.set('levelRoles', lr);
        await interaction.reply(`✅ Rôle pour le niveau **${l}** supprimé.`);
    }
};
