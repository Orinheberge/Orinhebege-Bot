const Database = require('../../managers/Database');
const LevelDB = require('../../managers/LevelDB');
const Logger = require('../../utils/logger');
const config = require('../../config.json');

// Cache mémoire pour les cooldowns XP (évite de lire/écrire le JSON à chaque message)
const messageCooldowns = new Map();

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        // Ignorer les bots et les DMs
        if (message.author.bot || !message.guild) return;

        // =============================================
        // 1. SYSTÈME D'XP PAR MESSAGE
        // =============================================
        if (Database.isFeatureEnabled('xpMessages')) {
            await handleXP(message);
        }

        // =============================================
        // 2. LOGS DES COMMANDES LEGACY (préfixe)
        // =============================================
        if (Database.isFeatureEnabled('logs') && message.content && message.content.startsWith(config.prefix)) {
            await Logger.send(message.guild, {
                title: 'Commande Exécutée',
                level: 'info',
                fields: [
                    { name: 'Auteur', value: `${message.author.tag} (${message.author.id})`, inline: true },
                    { name: 'Commande', value: `\`${message.content.substring(0, 1024)}\``, inline: true },
                    { name: 'Salon', value: `${message.channel}`, inline: true }
                ]
            });
        }
    }
};

/**
 * Gère l'attribution d'XP pour un message
 * @param {Message} message
 */
async function handleXP(message) {
    const cooldown = Database.get('xpMessageCooldown') || 60;
    const xpAmount = Database.get('xpMessage') || 15;
    const maxLevel = Database.get('maxLevel') || 5000;

    const cooldownKey = `${message.guild.id}-${message.author.id}`;
    const now = Date.now();

    // Vérification du cooldown en mémoire
    if (messageCooldowns.has(cooldownKey)) {
        const lastTime = messageCooldowns.get(cooldownKey);
        if (now - lastTime < cooldown * 1000) return;
    }

    // Vérifier si l'utilisateur a atteint le niveau max
    const userData = LevelDB.getUser(message.author.id, message.guild.id);
    if (userData.level >= maxLevel) {
        messageCooldowns.set(cooldownKey, now);
        return;
    }

    // XP aléatoire (±20% autour de la valeur configurée)
    const randomXP = Math.floor(xpAmount * (0.8 + Math.random() * 0.4));
    const result = LevelDB.addXP(message.author.id, message.guild.id, randomXP, 'message');

    // Mettre à jour le cooldown
    messageCooldowns.set(cooldownKey, now);

    // Notification de level up
    if (result.leveledUp && Database.isFeatureEnabled('levelUpNotifications')) {
        await sendLevelUpNotification(message, result);
    }
}

/**
 * Envoie la notification de level up dans le salon dédié
 * @param {Message} message
 * @param {Object} result - Résultat de LevelDB.addXP
 */
async function sendLevelUpNotification(message, result) {
    const levelupChannelId = Database.get('levelupChannel');
    const channel = levelupChannelId
        ? message.guild.channels.cache.get(levelupChannelId)
        : message.channel;

    if (!channel) return;

    const { EmbedBuilder } = require('discord.js');
    const maxLevel = Database.get('maxLevel') || 5000;
    const rank = LevelDB.getRank(message.author.id, message.guild.id);

    const embed = new EmbedBuilder()
        .setTitle('🎉 Niveau Supérieur !')
        .setDescription(`Félicitations ${message.author} ! Tu es passé au **niveau ${result.newLevel}** !`)
        .setColor(0xf1c40f)
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: '📊 Niveau', value: `${result.newLevel}`, inline: true },
            { name: '⭐ XP Total', value: `${result.userData.xp.toLocaleString()}`, inline: true },
            { name: '🎯 Max', value: `${maxLevel}`, inline: true }
        )
        .setFooter({ text: `Rang #${rank}` })
        .setTimestamp();

    try {
        await channel.send({ content: `${message.author}`, embeds: [embed] });
    } catch (e) {
        Logger.console('error', `Erreur envoi level up: ${e.message}`, 'XP');
    }

    // Appliquer les rôles de niveau
    await applyLevelRoles(message.guild, message.member, result.newLevel);
}

/**
 * Attribue les rôles de récompense selon le niveau
 * @param {Guild} guild
 * @param {GuildMember} member
 * @param {number} level
 */
async function applyLevelRoles(guild, member, level) {
    const levelRoles = Database.get('levelRoles') || {};

    for (const [requiredLevel, roleId] of Object.entries(levelRoles)) {
        if (level >= parseInt(requiredLevel)) {
            const role = guild.roles.cache.get(roleId);
            if (role && !member.roles.cache.has(roleId)) {
                try {
                    await member.roles.add(role);
                    Logger.console('info', `Rôle niveau ${requiredLevel} attribué à ${member.user.tag}`, 'LEVELROLES');
                } catch (e) {
                    Logger.console('error', `Impossible d'attribuer le rôle ${role.name} à ${member.user.tag}: ${e.message}`, 'LEVELROLES');
                }
            }
        }
    }
}