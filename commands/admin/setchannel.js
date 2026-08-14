const { SlashCommandBuilder, ChannelType } = require('discord.js');
const Database = require('../../managers/Database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('Définit la catégorie des tickets')
        .addChannelOption(opt => opt.setName('categorie').setDescription('Catégorie des tickets').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const c = interaction.options.getChannel('categorie');
        Database.set('ticketCategory', c.id);
        await interaction.reply(`✅ Catégorie des tickets définie sur : **${c.name}**`);
    }
};