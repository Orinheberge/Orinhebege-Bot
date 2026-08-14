const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder().setName('setup').setDescription('Envoie le panneau de création de ticket'),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const embed = new EmbedBuilder()
            .setTitle('🎫 Support - Ouverture de Ticket')
            .setDescription('**Comment pouvons-nous vous aider ?**\n\n📩 **Support général** : `Ouvrir un ticket`\n🐛 **Bug & Report** : `Signaler un bug`')
            .setColor(0x3498db).setFooter({ text: `${interaction.guild.name}` }).setTimestamp();
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('create_ticket').setLabel('Ouvrir un ticket').setEmoji('📩').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('create_bug_ticket').setLabel('Signaler un bug').setEmoji('🐛').setStyle(ButtonStyle.Danger)
        );
        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Panneau envoyé !', ephemeral: true });
    }
};