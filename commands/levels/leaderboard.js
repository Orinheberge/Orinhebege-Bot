const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const LevelDB = require('../../managers/LevelDB');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard').setDescription('Classement des niveaux')
        .addIntegerOption(o => o.setName('page').setDescription('Page').setMinValue(1)),
    async execute(interaction) {
        const page = interaction.options.getInteger('page') || 1;
        const perPage = 10;
        const lb = LevelDB.getLeaderboard(interaction.guild.id, 100);
        const totalPages = Math.ceil(lb.length / perPage) || 1;
        const offset = (page - 1) * perPage;
        const pageData = lb.slice(offset, offset + perPage);

        if (!pageData.length) return interaction.reply({ content: '❌ Aucune donnée.', ephemeral: true });

        let desc = '';
        for (let i = 0; i < pageData.length; i++) {
            const u = pageData[i];
            const member = interaction.guild.members.cache.get(u.userId);
            const r = offset + i + 1;
            const medal = r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : `**#${r}**`;
            desc += `${medal} **${member?.displayName || 'Inconnu'}**\n└ Lvl **${u.level}** • ${u.xp.toLocaleString()} XP • ${u.totalMessages.toLocaleString()} msgs\n\n`;
        }

        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Classement').setDescription(desc).setColor(0xf1c40f).setFooter({ text: `Page ${page}/${totalPages} • ${lb.length} membres` }).setTimestamp()] });
    }
};