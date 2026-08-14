const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('8ball').setDescription('Boule magique').addStringOption(o => o.setName('question').setDescription('Question').setRequired(true)),
    async execute(interaction) {
        const responses = ["C'est certain.","Sans aucun doute.","Oui définitivement.","Très probable.","Oui.","Réponse floue, réessaye.","Redemande plus tard.","Mieux vaut ne pas te le dire.","Impossible de prédire.","Concentre-toi et redemande.","N'y compte pas.","Ma réponse est non.","Très douteux."];
        const r = responses[Math.floor(Math.random() * responses.length)];
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎱 Boule Magique').addFields({ name: '❓ Question', value: interaction.options.getString('question') }, { name: '🔮 Réponse', value: r }).setColor(0x8e44ad).setTimestamp()] });
    }
};