const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('cat').setDescription('Image de chat'),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const res = await fetch('https://api.thecatapi.com/v1/images/search');
            const data = await res.json();
            await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🐱 Chat !').setImage(data[0].url).setColor(0xe67e22).setTimestamp()] });
        } catch (e) { await interaction.editReply('❌ Erreur API chat.'); }
    }
};