const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('avatar').setDescription('Avatar d\'un membre').addUserOption(o => o.setName('user').setDescription('Membre')),
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild.members.cache.get(user.id);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`🖼️ Avatar de ${user.tag}`).setImage(user.displayAvatarURL({ size: 1024, dynamic: true })).setColor(member?.displayColor || 0x3498db).setTimestamp()] });
    }
};