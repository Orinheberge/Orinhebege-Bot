const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('ping').setDescription('Latence du bot'),
    async execute(interaction) {
        const start = Date.now();
        await interaction.deferReply({ ephemeral: true });
        const ping = Date.now() - start;
        await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🏓 Pong!').addFields({ name: '📡 API', value: `${ping}ms`, inline: true }, { name: '💓 WS', value: `${interaction.client.ws.ping}ms`, inline: true }).setColor(0x2ecc71).setTimestamp()] });
    }
};