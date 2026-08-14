const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('meme').setDescription('Meme aléatoire'),
    async execute(interaction) {
        await interaction.deferReply();
        try {
            const res = await fetch('https://meme-api.com/gimme');
            const data = await res.json();
            if (data.nsfw) return interaction.editReply('❌ Meme NSFW détecté, réessayez.');
            await interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`😂 ${data.title}`).setImage(data.url).setColor(0xe67e22).setFooter({ text: `👍 ${data.ups} | r/${data.subreddit}` }).setTimestamp()] });
        } catch (e) { await interaction.editReply('❌ Erreur API meme.'); }
    }
};