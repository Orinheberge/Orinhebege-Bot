const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Database = require('../../managers/Database');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setautorole')
        .setDescription('Définit le rôle automatique pour les nouveaux membres')
        .addRoleOption(option =>
            option
                .setName('role')
                .setDescription('Rôle à attribuer automatiquement')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        // Vérification permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const botMember = interaction.guild.members.me;

        // Vérification hiérarchie
        if (role.position >= botMember.roles.highest.position) {
            return interaction.reply({
                content: `❌ Je ne peux pas attribuer le rôle **${role.name}** car il est supérieur ou égal à mon rôle le plus haut.`,
                ephemeral: true
            });
        }

        // Vérification permission de gérer le rôle
        if (!role.editable) {
            return interaction.reply({
                content: `❌ Je n'ai pas la permission de modifier/attribuer le rôle **${role.name}**.`,
                ephemeral: true
            });
        }

        // Sauvegarde
        Database.set('autoRole', role.id);

        // Log
        await Logger.success(interaction.guild, 'Auto-Rôle Configuré 🎭', 
            `Les nouveaux membres recevront automatiquement ${role}`,
            [
                { name: '📋 Rôle', value: `${role} (\`${role.id}\`)`, inline: true },
                { name: '👥 Position', value: `${role.position}`, inline: true },
                { name: '🎨 Couleur', value: `${role.hexColor}`, inline: true }
            ]
        );

        // Réponse
        const embed = new EmbedBuilder()
            .setTitle('🎭 Auto-Rôle Configuré')
            .setDescription(`Les nouveaux membres recevront automatiquement le rôle ${role} en rejoignant le serveur.`)
            .setColor(0x2ecc71)
            .addFields(
                { name: '📋 Rôle', value: `${role} (\`${role.id}\`)`, inline: true },
                { name: '👥 Position', value: `${role.position}`, inline: true },
                { name: '🎨 Couleur', value: `${role.hexColor}`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};