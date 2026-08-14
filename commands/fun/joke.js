const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
module.exports = {
    data: new SlashCommandBuilder().setName('joke').setDescription('Blague aléatoire'),
    async execute(interaction) {
        const jokes = ["Pourquoi les plongeurs plongent en arrière ?\n*Sinon ils tombent dans le bateau.* 🤣","Que fait une fraise sur un cheval ?\n*Tagada tagada !* 🍓","Quel est le comble pour un électricien ?\n*De ne pas être au courant !* ⚡","Comment appelle-t-on un chien sans pattes ?\n*On ne l'appelle pas, on va le chercher.* 🐶","Un mec rentre dans un café... et plouf ! ☕"];
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('😂 Blague').setDescription(jokes[Math.floor(Math.random() * jokes.length)]).setColor(0xf1c40f).setFooter({ text: `Par ${interaction.user.tag}` }).setTimestamp()] });
    }
};