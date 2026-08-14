const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const WarnDB = require('../../managers/WarnDB');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warnings').setDescription('Voir les avertissements')
        .addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true)),
    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const warns = WarnDB.get(user.id, interaction.guild.id);
        if (!warns.length) return interaction.reply({ content: `✅ **${user.tag}** n'a aucun avertissement.`, ephemeral: true });

        const fields = warns.slice(0, 25).map((w, i) => ({
            name: `#${i + 1} — ${new Date(w.date).toLocaleDateString('fr-FR')}`,
            value: `**Raison:** ${w.reason}\n**Par:** ${w.moderator}`
        }));

        await interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📋 Avertissements de ${user.tag}`).setDescription(`Total: **${warns.length}**`).setColor(0xf1c40f).addFields(fields).setTimestamp()], ephemeral: true });
    }
};