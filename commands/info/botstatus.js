const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('botstatus').setDescription('Infos du bot'),
    async execute(interaction) {
        const up = process.uptime();
        const d = Math.floor(up / 86400), h = Math.floor((up % 86400) / 3600), m = Math.floor((up % 3600) / 60), s = Math.floor(up % 60);
        const client = interaction.client;
        await interaction.reply({ embeds: [new EmbedBuilder()
            .setTitle('🤖 Statut du Bot').setDescription(`**${client.user.tag}**`)
            .setThumbnail(client.user.displayAvatarURL()).setColor(0x3498db)
            .addFields(
                { name: '📡 Latence', value: `${client.ws.ping}ms`, inline: true },
                { name: '🌐 Serveurs', value: `${client.guilds.cache.size}`, inline: true },
                { name: '👥 Membres', value: `${client.users.cache.size}`, inline: true },
                { name: '⏱️ Uptime', value: `${d}j ${h}h ${m}m ${s}s`, inline: true }
            ).setFooter({ text: `ID: ${client.user.id}` }).setTimestamp()] });
    }
};