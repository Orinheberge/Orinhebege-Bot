const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('transfert')
        .setDescription('Transférer un ticket vers une autre catégorie')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addChannelOption(option =>
            option
                .setName('categorie')
                .setDescription('Catégorie de destination')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildCategory)
        ),

    async execute(interaction, client) {
        // Vérification type de salon
        if (interaction.channel.type !== ChannelType.GuildText) {
            return interaction.reply({
                content: '❌ Cette commande ne peut être utilisée que dans un salon textuel.',
                ephemeral: true
            });
        }

        const category = interaction.options.getChannel('categorie');

        try {
            // Déplacement du salon
            await interaction.channel.setParent(category.id);

            // Log
            await Logger.info(interaction.guild, 'Ticket Transféré 📂',
                `Le salon ${interaction.channel} a été déplacé vers la catégorie **${category.name}**`,
                [
                    { name: '📁 Destination', value: `${category.name} (\`${category.id}\`)`, inline: true },
                    { name: '🛡️ Par', value: `${interaction.user.tag}`, inline: true }
                ]
            );

            // Réponse
            const embed = new EmbedBuilder()
                .setTitle('📂 Ticket Transféré')
                .setDescription(`Ce salon a été déplacé vers la catégorie **${category.name}**.`)
                .setColor(0x3498db)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur transfert ticket:', error);
            await interaction.reply({
                content: '❌ Erreur lors du transfert. Vérifiez mes permissions et la hiérarchie des rôles.',
                ephemeral: true
            });
        }
    }
};