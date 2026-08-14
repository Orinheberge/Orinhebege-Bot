const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Database = require('../../managers/Database');
const Logger = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setautorole')
        .setDescription('Définit le rôle automatique pour les nouveaux membres')
        .addRoleOption(o => o.setName('role').setDescription('Rôle à attribuer').setRequired(true)),
    async execute(interaction) {
        if (!interaction.member.permissions.has('Administrator')) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        const r = interaction.options.getRole('role');
        const me = interaction.guild.members.me;
        if (r.position >= me.roles.highest.position) return interaction.reply({ content: `❌ Le rôle **${r.name}** est trop haut dans la hiérarchie.`, ephemeral: true });
        if (!r.editable) return interaction.reply({ content: `❌ Je ne peux pas attribuer **${r.name}**.`, ephemeral: true });
        Database.set('autoRole', r.id);
        await Logger.success(interaction.guild, 'Auto-Rôle Configuré', `Les nouveaux membres recevront ${r}`);
        await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🎭 Auto-Rôle Configuré').setDescription(`${r} sera attribué automatiquement.`).setColor(0x2ecc71).setTimestamp()] });
    }
};