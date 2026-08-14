const { SlashCommandBuilder, ChannelType } = require('discord.js');
const Database = require('../../managers/Database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setwelcome')
        .setDescription('Définit le salon de bienvenue/départ')
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const c = interaction.options.getChannel('salon');
        Database.set('welcomeChannel', c.id);
        await interaction.reply(`✅ Salon de bienvenue défini sur : ${c}`);
    }
};