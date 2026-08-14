const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const WarnDB = require('../../managers/WarnDB');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('warn').setDescription('Avertir un membre')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(o => o.setName('user').setDescription('Membre').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Raison').setRequired(true)),
    async execute(interaction) {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');
        if (user.bot) return interaction.reply({ content: '❌ Impossible d\'avertir un bot.', ephemeral: true });

        const count = WarnDB.add(user.id, interaction.guild.id, reason, interaction.user.tag);
        await Logger.moderation(interaction.guild, 'Avertissement ⚠️', null, [
            { name: '👤 Utilisateur', value: user.tag, inline: true },
            { name: '🛡️ Modérateur', value: interaction.user.tag, inline: true },
            { name: '📊 Total', value: `${count}`, inline: true },
            { name: '📝 Raison', value: reason }
        ]);

        // DM
        try {
            await user.send({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement').setDescription(`Serveur : **${interaction.guild.name}**\nRaison : ${reason}\nTotal : ${count}`).setColor(0xf1c40f).setTimestamp()] }).catch(() => {});
        } catch (e) {}

        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⚠️ Avertissement Ajouté').setColor(0xf1c40f).setDescription(`**${user.tag}** — Total : **${count}**`).setTimestamp()] });
    }
};