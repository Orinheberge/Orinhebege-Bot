const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('site').setDescription('Lien du site web'),
    async execute(interaction) {
        const url = 'https://heberge.orinstone.deepstone.fr';
        const embed = new EmbedBuilder().setTitle('🌐 Site Web').setDescription('[Accéder au site](https://heberge.orinstone.deepstone.fr)').setURL(url).setColor(0x9b59b6).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Visiter').setURL(url).setStyle(ButtonStyle.Link));
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
};