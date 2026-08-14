const Database = require('./Database');
const Logger = require('../utils/logger');

// Cache mémoire pour le spam (userId -> timestamps[])
const spamCache = new Map();

class AutoMod {
    /**
     * Vérifie si un membre est exempté
     */
    static isExempt(message) {
        const config = Database.getAutomod();

        // Staff / Admin toujours exempté
        if (message.member.permissions.has('ManageMessages')) return true;

        // Rôles exemptés
        if (config.exemptRoles?.some(r => message.member.roles.cache.has(r))) return true;

        // Salons exemptés
        if (config.exemptChannels?.includes(message.channel.id)) return true;

        return false;
    }

    /**
     * Point d'entrée unique - appelé depuis messageCreate
     */
    static async check(message) {
        const config = Database.getAutomod();
        if (!config.enabled) return false;
        if (this.isExempt(message)) return false;

        const checks = [
            () => this.checkBadWords(message, config.badWords),
            () => this.checkLinks(message, config.links),
            () => this.checkInvites(message, config.invites),
            () => this.checkCaps(message, config.caps),
            () => this.checkSpam(message, config.spam),
            () => this.checkMassMention(message, config.massMention)
        ];

        for (const check of checks) {
            const triggered = await check();
            if (triggered) return true; // Stop au premier filtre déclenché
        }

        return false;
    }

    // ==================== FILTRES ====================

    static async checkBadWords(message, cfg) {
        if (!cfg.enabled) return false;

        const content = message.content.toLowerCase();
        const found = cfg.words.some(word => {
            // Match mot entier ou entouré de ponctuation
            const regex = new RegExp(`(?:^|\\s|[.,!?])${this.escapeRegex(word)}(?:$|\\s|[.,!?])`, 'i');
            return regex.test(content);
        });

        if (!found) return false;

        await this.executeAction(message, cfg, '🤬 Mot interdit détecté');
        return true;
    }

    static async checkLinks(message, cfg) {
        if (!cfg.enabled) return false;

        const urlRegex = /https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.[a-zA-Z]{2,}\/[^\s]*/gi;
        const urls = message.content.match(urlRegex);
        if (!urls) return false;

        const isWhitelisted = urls.every(url => {
            try {
                const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
                return cfg.whitelist?.some(w => hostname.endsWith(w));
            } catch {
                return false;
            }
        });

        if (isWhitelisted) return false;

        await this.executeAction(message, cfg, '🔗 Lien non autorisé');
        return true;
    }

    static async checkInvites(message, cfg) {
        if (!cfg.enabled) return false;

        const inviteRegex = /discord\.gg\/[a-zA-Z0-9-]+|discord\.com\/invite\/[a-zA-Z0-9-]+/i;
        if (!inviteRegex.test(message.content)) return false;

        await this.executeAction(message, cfg, '📨 Invitation Discord détectée');
        return true;
    }

    static async checkCaps(message, cfg) {
        if (!cfg.enabled) return false;
        if (message.content.length < cfg.minChars) return false;

        const upperCount = (message.content.match(/[A-Z]/g) || []).length;
        const percent = (upperCount / message.content.length) * 100;

        if (percent <= cfg.maxPercent) return false;

        await this.executeAction(message, cfg, '🔠 Abus de majuscules');
        return true;
    }

    static async checkSpam(message, cfg) {
        if (!cfg.enabled) return false;

        const now = Date.now();
        const key = `${message.guild.id}-${message.author.id}`;

        if (!spamCache.has(key)) spamCache.set(key, []);
        const timestamps = spamCache.get(key).filter(t => now - t < cfg.timeWindow);
        timestamps.push(now);
        spamCache.set(key, timestamps);

        if (timestamps.length <= cfg.maxMessages) return false;

        // Nettoyer le cache
        spamCache.delete(key);

        await this.executeAction(message, cfg, '🚫 Spam détecté', cfg.muteDuration);
        return true;
    }

    static async checkMassMention(message, cfg) {
        if (!cfg.enabled) return false;

        const mentionCount = message.mentions.users.size + message.mentions.roles.size;
        if (mentionCount <= cfg.maxMentions) return false;

        await this.executeAction(message, cfg, `📢 Mass mention (${mentionCount} mentions)`);
        return true;
    }

    // ==================== ACTIONS ====================

    static async executeAction(message, cfg, reason, muteDuration = null) {
        // Supprimer le message (sauf si action = warn uniquement)
        if (cfg.action !== 'warn') {
            await message.delete().catch(() => {});
        }

        // Notification DM
        if (cfg.notifyUser) {
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('⚠️ AutoMod')
                .setDescription(`Votre message a été supprimé sur **${message.guild.name}**\n**Raison :** ${reason}`)
                .setColor(0xe74c3c)
                .setTimestamp();
            await message.author.send({ embeds: [embed] }).catch(() => {});
        }

        // Action supplémentaire selon le type
        switch (cfg.action) {
            case 'warn': {
                const WarnDB = require('./WarnDB');
                WarnDB.add(message.author.id, message.guild.id, `[AutoMod] ${reason}`, 'AutoMod');
                break;
            }
            case 'mute': {
                const duration = muteDuration || 600000;
                try {
                    await message.member.timeout(duration, `[AutoMod] ${reason}`);
                } catch (e) {
                    Logger.console('error', `AutoMod mute impossible: ${e.message}`, 'AUTOMOD');
                }
                break;
            }
        }

        // Log staff
        await Logger.warn(message.guild, 'AutoMod ⚙️', null, [
            { name: '👤 Utilisateur', value: `${message.author.tag} (${message.author.id})`, inline: true },
            { name: '📍 Salon', value: `${message.channel}`, inline: true },
            { name: '🔍 Raison', value: reason },
            { name: '⚡ Action', value: cfg.action.toUpperCase(), inline: true },
            { name: '💬 Contenu', value: message.content?.substring(0, 500) || '*vide*' }
        ]);
    }

    // ==================== UTILS ====================

    static escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Nettoie périodiquement le cache spam (à appeler dans ready)
     */
    static startCacheCleanup() {
        setInterval(() => {
            const now = Date.now();
            for (const [key, timestamps] of spamCache) {
                const valid = timestamps.filter(t => now - t < 10000);
                if (valid.length === 0) spamCache.delete(key);
                else spamCache.set(key, valid);
            }
        }, 30000);
        Logger.console('info', 'AutoMod cache cleanup démarré', 'AUTOMOD');
    }
}

module.exports = AutoMod;