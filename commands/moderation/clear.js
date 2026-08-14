const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear').setDescription('Supprimer des messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(o => o.setName('amount').setDescription('Nombre (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption(o => o.setName('user').setDescription('Filtrer par utilisateur')),
    async execute(interaction) {
        const amount = interaction.options.getInteger('amount');
        const target = interaction.options.getUser('user');
        await interaction.deferReply({ ephemeral: true });

        try {
            const msgs = await interaction.channel.messages.fetch({ limit: amount });
            const toDelete = target ? msgs.filter(m => m.author.id === target.id) : msgs;
            const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
            const count = deleted ? deleted.size : 0;
            await Logger.info(interaction.guild, 'Messages Supprimés 🗑️', `**${count}** message(s) supprimé(s) par ${interaction.user.tag}`);
            await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🗑️ Messages Supprimés').setDescription(`**${count}** message(s).`).setColor(0x3498db).setTimestamp()] });
        } catch (e) {
            await interaction.editReply('❌ Erreur lors de la suppression.');
        }
    }
};