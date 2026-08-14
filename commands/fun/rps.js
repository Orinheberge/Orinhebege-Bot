const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('rps').setDescription('Pierre-Feuille-Ciseaux')
        .addStringOption(o => o.setName('choix').setDescription('Ton choix').setRequired(true).addChoices({ name: '🪨 Pierre', value: 'pierre' }, { name: '📄 Feuille', value: 'feuille' }, { name: '✂️ Ciseaux', value: 'ciseaux' })),
    async execute(interaction) {
        const choices = ['pierre', 'feuille', 'ciseaux'];
        const emojis = { pierre: '🪨', feuille: '📄', ciseaux: '✂️' };
        const user = interaction.options.getString('choix');
        const bot = choices[Math.floor(Math.random() * 3)];
        let result, color;
        if (user === bot) { result = '🤝 Égalité !'; color = 0xf1c40f; }
        else if ((user === 'pierre' && bot === 'ciseaux') || (user === 'feuille' && bot === 'pierre') || (user === 'ciseaux' && bot === 'feuille')) { result = '🎉 Tu as gagné !'; color = 0x2ecc71; }
        else { result = '💀 Tu as perdu !'; color = 0xe74c3c; }
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('✊ Pierre-Feuille-Ciseaux ✋').setDescription(`Toi : ${emojis[user]} | Bot : ${emojis[bot]}\n\n**${result}**`).setColor(color).setTimestamp()] });
    }
};