const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const LevelDB = require('../../managers/LevelDB');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetrank').setDescription('Réinitialise le niveau d\'un membre')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)),
    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const data = LevelDB.load();
        const key = `${interaction.guild.id}-${user.id}`;
        if (!data[key]) return interaction.reply({ content: `❌ **${user.tag}** n'a pas de données.`, ephemeral: true });

        delete data[key];
        LevelDB.save(data);
        await Logger.warn(interaction.guild, 'Niveau Réinitialisé 🔄', `**${user.tag}** par ${interaction.user.tag}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🔄 Reset').setDescription(`Niveau de **${user.tag}** réinitialisé.`).setColor(0xe74c3c).setTimestamp()] });
    }
};