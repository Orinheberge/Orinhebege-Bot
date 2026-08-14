const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('ship').setDescription('Compatibilité amoureuse')
        .addUserOption(o => o.setName('user1').setDescription('Membre 1').setRequired(true))
        .addUserOption(o => o.setName('user2').setDescription('Membre 2')),
    async execute(interaction) {
        const u1 = interaction.options.getUser('user1');
        const u2 = interaction.options.getUser('user2') || interaction.user;
        if (u1.id === u2.id) return interaction.reply({ content: '😅 Pas de ship avec soi-même !', ephemeral: true });
        const pct = Math.floor(Math.random() * 101);
        let emoji, text;
        if (pct >= 80) { emoji = '💖'; text = 'Âmes sœurs !'; }
        else if (pct >= 60) { emoji = '💕'; text = 'Très compatible !'; }
        else if (pct >= 40) { emoji = '💞'; text = 'Ça peut coller.'; }
        else { emoji = '💔'; text = 'Pas fait pour s\'entendre...'; }
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('💘 Ship').setDescription(`**${u1.username}** & **${u2.username}**\n\n${emoji} **${pct}%**\n*${text}*`).setColor(0xff69b4).setTimestamp()] });
    }
};