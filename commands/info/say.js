const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('say').setDescription('Le bot répète votre message')
        .addStringOption(o => o.setName('message').setDescription('Message').setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('ManageMessages')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        await interaction.channel.send(interaction.options.getString('message'));
        await interaction.editReply('✅ Message envoyé !');
    }
};