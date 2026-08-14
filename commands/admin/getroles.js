const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('getroles').setDescription('Envoie un panneau pour obtenir des rôles'),
    async execute(interaction) {
        if (!interaction.member.permissions.has('ManageRoles')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const embed = new EmbedBuilder()
            .setTitle('🎭 Rôles Disponibles')
            .setDescription('Cliquez ci-dessous pour obtenir vos rôles !\n\n- <@&1521937325595037906>\n- <@&1534896300414472312>')
            .setColor(0x9b59b6).setFooter({ text: interaction.guild.name }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_roles').setLabel('Obtenir les rôles').setEmoji('🎁').setStyle(ButtonStyle.Primary)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Panneau envoyé !', ephemeral: true });
    }
};