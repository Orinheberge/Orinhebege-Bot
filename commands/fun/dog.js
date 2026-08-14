const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('dog').setDescription('Image de chien'),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const res = await fetch('https://dog.ceo/api/breeds/image/random');
            const data = await res.json();
            await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🐶 Chien !').setImage(data.message).setColor(0x3498db).setTimestamp()] });
        } catch (e) { await interaction.editReply('❌ Erreur API chien.'); }
    }
};