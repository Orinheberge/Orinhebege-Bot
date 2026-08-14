const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const LevelDB = require('../../managers/LevelDB');
const Database = require('../../managers/Database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank').setDescription('Affiche votre niveau')
        .addUserOption(o => o.setName('user').setDescription('Membre')),
    async execute(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        if (user.bot) return interaction.reply({ content: '❌ Les bots n\'ont pas de niveau.', ephemeral: true });

        const data = LevelDB.getUser(user.id, interaction.guild.id);
        const max = Database.get('maxLevel') || 5000;
        const rank = LevelDB.getRank(user.id, interaction.guild.id);
        const xpNext = LevelDB.xpForNextLevel(data.level);
        const xpCur = LevelDB.xpForLevel(data.level);
        const progress = data.level >= max ? 100 : Math.floor(((data.xp - xpCur) / (xpNext - xpCur)) * 100);
        const barLen = 20;
        const filled = Math.floor((progress / 100) * barLen);
        const bar = '█'.repeat(filled) + '░'.repeat(barLen - filled);
        const h = Math.floor(data.voiceTime / 3600);
        const m = Math.floor((data.voiceTime % 3600) / 60);
        const voiceStr = h > 0 ? `${h}h ${m}min` : `${m}min`;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Carte de Niveau - ${user.tag}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .setColor(interaction.member?.displayColor || 0x3498db)
            .addFields(
                { name: '🏆 Niveau', value: `**${data.level}** / ${max}`, inline: true },
                { name: '🥇 Rang', value: `**#${rank}**`, inline: true },
                { name: '⭐ XP', value: `${data.xp.toLocaleString()}`, inline: true },
                { name: '📈 Progression', value: data.level >= max ? '```\nMAX ATTEINT !\n```' : `\`${bar}\` **${progress}%**\n${data.xp.toLocaleString()} / ${xpNext.toLocaleString()} XP` },
                { name: '💬 Messages', value: `**${data.totalMessages.toLocaleString()}** msgs\n+${data.messageXP.toLocaleString()} XP`, inline: true },
                { name: '🎤 Vocal', value: `**${voiceStr}**\n+${data.voiceXP.toLocaleString()} XP`, inline: true }
            ).setFooter({ text: interaction.guild.name }).setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};