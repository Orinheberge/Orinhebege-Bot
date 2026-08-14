const { SlashCommandBuilder } = require('discord.js');
const reglement = require('../../utils/reglement');

module.exports = {
    data: new SlashCommandBuilder().setName('reglement').setDescription('Affiche le règlement'),
    async execute(interaction) {
        if (!reglement.isLoaded()) return interaction.reply({ content: '❌ Règlement non configuré.', ephemeral: true });
        const embed = reglement.createEmbed();
        if (!embed) return interaction.reply({ content: '❌ Erreur génération.', ephemeral: true });
        const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
        try { await reply.react('1535995172419272774'); } catch (e) {}
    }
};