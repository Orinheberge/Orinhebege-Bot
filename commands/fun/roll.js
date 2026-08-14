const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('roll').setDescription('Lance un dé').addIntegerOption(o => o.setName('faces').setDescription('Faces').setMinValue(2).setMaxValue(100)),
    async execute(interaction) {
        const f = interaction.options.getInteger('faces') || 6;
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎲 Dé').setDescription(`Résultat : **${Math.floor(Math.random() * f) + 1}** / ${f}`).setColor(0xe67e22).setTimestamp()] });
    }
};