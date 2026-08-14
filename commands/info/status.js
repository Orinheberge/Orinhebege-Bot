const { SlashCommandBuilder } = require('discord.js');
const Database = require('../../managers/Database');
const StatusChecker = require('../../managers/StatusChecker');

module.exports = {
    data: new SlashCommandBuilder().setName('status').setDescription('Statut des services'),
    async execute(interaction) {
        if (!Database.isFeatureEnabled('statusServices')) return interaction.reply({ content: '❌ Statuts désactivés.', ephemeral: true });
        await interaction.deferReply();
        const statuses = await StatusChecker.getAllStatus();
        await interaction.editReply({ embeds: [StatusChecker.createStatusEmbed(statuses)], components: [StatusChecker.createStatusButtons()] });
    }
};