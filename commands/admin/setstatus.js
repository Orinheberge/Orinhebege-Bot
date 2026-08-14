const { SlashCommandBuilder, ChannelType } = require('discord.js');
const Database = require('../../managers/Database');
const StatusChecker = require('../../managers/StatusChecker');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setstatus')
        .setDescription('Définit le salon pour le statut des services')
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel').setRequired(true).addChannelTypes(ChannelType.GuildText)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const c = interaction.options.getChannel('salon');
        Database.set('statusChannel', c.id);
        Database.set('statusMessageId', null);
        try {
            await StatusChecker.updateStatusMessage(c);
            await interaction.reply(`✅ Salon de statut défini et premier message envoyé dans ${c}`);
        } catch (e) {
            await interaction.reply(`✅ Salon de statut défini sur : ${c}`);
        }
    }
};