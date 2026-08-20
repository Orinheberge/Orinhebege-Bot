const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('../../managers/Database');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('removeautorole')
        .setDescription('Supprime le rôle automatique pour les nouveaux membres'),

    async execute(interaction, client) {
        // Vérification permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        }

        const currentRoleId = Database.get('autoRole');

        if (!currentRoleId) {
            return interaction.reply({
                content: '⚠️ Aucun auto-rôle n\'est actuellement configuré.',
                ephemeral: true
            });
        }

        // On tente de récupérer le rôle pour l'afficher dans les logs/réponse (peut être null si supprimé)
        const role = interaction.guild.roles.cache.get(currentRoleId);

        // Suppression de la config
        Database.set('autoRole', null);

        // Log
        await Logger.success(interaction.guild, 'Auto-Rôle Supprimé 🗑️',
            role
                ? `Le rôle ${role} ne sera plus attribué automatiquement.`
                : `L'ancien auto-rôle (ID: \`${currentRoleId}\`, rôle introuvable) a été retiré de la configuration.`,
            role
                ? [{ name: '📋 Ancien rôle', value: `${role} (\`${role.id}\`)`, inline: true }]
                : [{ name: '📋 Ancien ID', value: `\`${currentRoleId}\``, inline: true }]
        );

        // Réponse
        const embed = new EmbedBuilder()
            .setTitle('🗑️ Auto-Rôle Supprimé')
            .setDescription(
                role
                    ? `Le rôle ${role} ne sera plus attribué automatiquement aux nouveaux membres.`
                    : `L'auto-rôle configuré (rôle introuvable, ID \`${currentRoleId}\`) a été retiré.`
            )
            .setColor(0xe74c3c)
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};