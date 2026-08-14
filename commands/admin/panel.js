const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('panel').setDescription('Affiche le lien vers le panel de gestion'),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Administrateur requis.', ephemeral: true });
        const url = 'http://node.orinstone.deepstone.fr:26162';
        const embed = new EmbedBuilder()
            .setTitle('🎛️ Panel de Gestion')
            .setDescription(`🔗 **[Ouvrir le panel](${url})**`)
            .setColor(0x9b59b6).setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Ouvrir le Panel').setURL(url).setStyle(ButtonStyle.Link));
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
};