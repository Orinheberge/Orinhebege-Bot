const { SlashCommandBuilder } = require('discord.js');
const Database = require('../../managers/Database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setstaff')
        .setDescription('Définit le rôle Staff')
        .addRoleOption(opt => opt.setName('role').setDescription('Rôle autorisé à voir les tickets').setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const r = interaction.options.getRole('role');
        Database.set('staffRole', r.id);
        await interaction.reply(`✅ Rôle Staff défini sur : **${r.name}**`);
    }
};