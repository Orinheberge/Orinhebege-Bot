const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('hug').setDescription('Câlin').addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)),
    async execute(interaction) {
        const target = interaction.options.getUser('user');
        if (target.id === interaction.user.id) return interaction.reply({ content: '🫂 Câlin solo... 😅', ephemeral: true });
        await interaction.deferReply();
        try {
            const res = await fetch('https://api.waifu.pics/sfw/hug');
            const data = await res.json();
            await interaction.editReply({ content: `${target}`, embeds: [new EmbedBuilder().setTitle('🫕 Câlin !').setDescription(`**${interaction.user.username}** câline **${target.username}** 💖`).setImage(data.url).setColor(0xff69b4).setTimestamp()] });
        } catch (e) { await interaction.editReply('❌ Erreur API hug.'); }
    }
};