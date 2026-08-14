const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('help').setDescription('Aide générale'),
    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('📖 Aide - Commandes')
            .setDescription('Bienvenue ! Voici les commandes disponibles.')
            .setColor(0x3498db)
            .addFields(
                { name: '🎫 Tickets', value: 'Bouton **Ouvrir un ticket** dans le panneau support.' },
                { name: '📊 Niveaux', value: '`/rank` `/leaderboard`', inline: true },
                { name: 'ℹ️ Info', value: '`/help` `/site` `/ping` `/avatar` `/status` `/botstatus` `/reglement`', inline: true },
                { name: '🎮 Fun', value: '`/8ball` `/roll` `/flip` `/cat` `/dog` `/joke` `/rps` `/meme` `/hug` `/ship`', inline: true },
                { name: '💬 Autre', value: '`/say` `/warnings`', inline: true }
            ).setFooter({ text: interaction.guild.name }).setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};