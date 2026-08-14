const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('flip').setDescription('Pile ou face'),
    async execute(interaction) {
        const r = Math.random() < 0.5 ? '👑 **Pile** !' : '🦅 **Face** !';
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🪙 Pile ou Face').setDescription(r).setColor(0xf1c40f).setTimestamp()] });
    }
};