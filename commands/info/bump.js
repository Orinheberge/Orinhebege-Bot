const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bump')
        .setDescription('⬆️ Bumpe le serveur pour augmenter sa visibilité'),
    async execute(interaction, client) {
        const BumpManager = require('../../managers/BumpManager');

        await interaction.deferReply();

        const result = await BumpManager.doBump(interaction.guild.id, interaction.user.id, client);

        if (result.allowed) {
            const embed = new EmbedBuilder()
                .setTitle('⬆️ Serveur Bumpé !')
                .setDescription(`**${interaction.user.username}** a bumpé le serveur depuis Discord !\n\n🕐 Prochain bump disponible dans **2h**`)
                .setColor(0x57F287)
                .setThumbnail(interaction.guild.iconURL({ dynamic: true }))
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else {
            const embed = new EmbedBuilder()
                .setTitle('⏳ Cooldown actif')
                .setDescription(result.message)
                .setColor(0xFEE75C)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        }
    }
};