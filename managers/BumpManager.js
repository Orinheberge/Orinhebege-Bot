const Database = require('./Database');

// Cooldown entre chaque bump (en ms) — 2 heures par défaut
const BUMP_COOLDOWN = parseInt(process.env.BUMP_COOLDOWN) || 2 * 60 * 60 * 1000;

// Stockage en mémoire des derniers bumps (guildId -> timestamp)
const lastBumps = new Map();

class BumpManager {

    // =============================================
    // VÉRIFICATIONS
    // =============================================

    /**
     * Vérifie si un bump est possible
     */
    static canBump(guildId, userId) {
        const key = `${guildId}-${userId}`;
        const lastBump = lastBumps.get(key) || 0;
        const now = Date.now();
        const remaining = BUMP_COOLDOWN - (now - lastBump);

        if (remaining > 0) {
            const hours = Math.floor(remaining / 3600000);
            const minutes = Math.floor((remaining % 3600000) / 60000);
            return {
                allowed: false,
                remaining,
                message: `⏳ Cooldown: attendez ${hours}h ${minutes}min avant de bump à nouveau.`
            };
        }

        return { allowed: true, remaining: 0, message: '' };
    }

    /**
     * Vérifie via la base de données (persistant)
     */
    static async canBumpDB(guildId, userId) {
        // Vérifier d'abord en mémoire (plus rapide)
        const memCheck = this.canBump(guildId, userId);
        if (!memCheck.allowed) return memCheck;

        // Vérifier en DB pour la persistance
        try {
            const MySQL = require('./MySQL');
            if (MySQL && MySQL.isEnabled() && !Database.isMainGuild(guildId)) {
                const rows = await MySQL.query(
                    'SELECT last_bump FROM bump_cooldowns WHERE guild_id = ? AND user_id = ?',
                    [guildId, userId]
                );
                if (rows.length > 0 && rows[0].last_bump) {
                    const lastBump = new Date(rows[0].last_bump).getTime();
                    const remaining = BUMP_COOLDOWN - (Date.now() - lastBump);
                    if (remaining > 0) {
                        const hours = Math.floor(remaining / 3600000);
                        const minutes = Math.floor((remaining % 3600000) / 60000);
                        return { allowed: false, remaining, message: `⏳ Cooldown: attendez ${hours}h ${minutes}min.` };
                    }
                }
            }
        } catch (e) {
            // Silencieux, fallback sur la mémoire
        }

        return { allowed: true, remaining: 0, message: '' };
    }

    // =============================================
    // EXÉCUTION DU BUMP
    // =============================================

    /**
     * Exécute un bump
     */
    static async doBump(guildId, userId, client) {
        const check = await this.canBumpDB(guildId, userId);
        if (!check.allowed) return check;

        const now = Date.now();
        const key = `${guildId}-${userId}`;

        // Sauvegarder en mémoire
        lastBumps.set(key, now);

        // Sauvegarder en DB
        try {
            const MySQL = require('./MySQL');
            if (MySQL && MySQL.isEnabled() && !Database.isMainGuild(guildId)) {
                await MySQL.query(
                    'INSERT INTO bump_cooldowns (guild_id, user_id, last_bump) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE last_bump = NOW()',
                    [guildId, userId]
                );
            }
        } catch (e) {}

        // Sauvegarder en JSON pour le serveur principal
        if (Database.isMainGuild(guildId)) {
            const data = Database.loadJSON();
            if (!data.bumps) data.bumps = {};
            if (!data.bumps[guildId]) data.bumps[guildId] = {};
            data.bumps[guildId][userId] = now;
            data.bumps[guildId]._lastBump = now;
            data.bumps[guildId]._totalBumps = (data.bumps[guildId]._totalBumps || 0) + 1;
            Database.saveJSON(data);
        }

        // Incrémenter le compteur global
        await this.incrementCounter(guildId);

        // Envoyer le message dans le salon bump
        const bumpChannelId = Database.get('bumpChannel', guildId);
        if (bumpChannelId && client) {
            try {
                const channel = client.channels.cache.get(bumpChannelId);
                if (channel) {
                    const { EmbedBuilder } = require('discord.js');
                    const member = await channel.guild.members.fetch(userId).catch(() => null);
                    const username = member?.displayName || userId;

                    const embed = new EmbedBuilder()
                        .setTitle('⬆️ Serveur Bumpé !')
                        .setDescription(`**${username}** a bumpé le serveur !\n\n🕐 Prochain bump disponible dans **${Math.floor(BUMP_COOLDOWN / 3600000)}h**`)
                        .setColor(0x57F287)
                        .setThumbnail(channel.guild.iconURL({ dynamic: true }))
                        .addFields(
                            { name: '📊 Total bumps', value: `${await this.getTotalBumps(guildId)}`, inline: true },
                            { name: '⏰ Cooldown', value: `${Math.floor(BUMP_COOLDOWN / 3600000)}h`, inline: true }
                        )
                        .setTimestamp();

                    await channel.send({ embeds: [embed] });
                }
            } catch (e) {
                console.error('[BUMP] Erreur envoi message:', e.message);
            }
        }

        return {
            allowed: true,
            remaining: 0,
            message: '✅ Bump enregistré avec succès !',
            nextBump: now + BUMP_COOLDOWN
        };
    }

    // =============================================
    // COMPTEURS
    // =============================================

    static async incrementCounter(guildId) {
        try {
            const MySQL = require('./MySQL');
            if (MySQL && MySQL.isEnabled() && !Database.isMainGuild(guildId)) {
                await MySQL.query(
                    'INSERT INTO bump_stats (guild_id, total_bumps) VALUES (?, 1) ON DUPLICATE KEY UPDATE total_bumps = total_bumps + 1',
                    [guildId]
                );
            }
        } catch (e) {}
    }

    static async getTotalBumps(guildId) {
        try {
            const MySQL = require('./MySQL');
            if (MySQL && MySQL.isEnabled() && !Database.isMainGuild(guildId)) {
                const rows = await MySQL.query('SELECT total_bumps FROM bump_stats WHERE guild_id = ?', [guildId]);
                return rows[0]?.total_bumps || 0;
            }
        } catch (e) {}

        // Fallback JSON
        const data = Database.loadJSON();
        return data.bumps?.[guildId]?._totalBumps || 0;
    }

    static async getLastBump(guildId) {
        try {
            const MySQL = require('./MySQL');
            if (MySQL && MySQL.isEnabled() && !Database.isMainGuild(guildId)) {
                const rows = await MySQL.query('SELECT MAX(last_bump) as last_bump FROM bump_cooldowns WHERE guild_id = ?', [guildId]);
                return rows[0]?.last_bump ? new Date(rows[0].last_bump).getTime() : 0;
            }
        } catch (e) {}

        const data = Database.loadJSON();
        return data.bumps?.[guildId]?._lastBump || 0;
    }

    // =============================================
    // INFOS POUR LE PANEL WEB
    // =============================================

    static async getBumpInfo(guildId, userId) {
        const check = await this.canBumpDB(guildId, userId);
        const totalBumps = await this.getTotalBumps(guildId);
        const lastBump = await this.getLastBump(guildId);

        return {
            canBump: check.allowed,
            cooldownRemaining: check.remaining,
            cooldownMessage: check.message,
            totalBumps,
            lastBump,
            nextBumpAvailable: lastBump ? lastBump + BUMP_COOLDOWN : 0,
            cooldownDuration: BUMP_COOLDOWN
        };
    }

    // =============================================
    // INITIALISATION DES TABLES MySQL
    // =============================================

    static async initTables() {
        try {
            const MySQL = require('./MySQL');
            if (!MySQL || !MySQL.isEnabled()) return;

            await MySQL.query(`
                CREATE TABLE IF NOT EXISTS bump_cooldowns (
                    guild_id VARCHAR(20) NOT NULL,
                    user_id VARCHAR(20) NOT NULL,
                    last_bump DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (guild_id, user_id)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            await MySQL.query(`
                CREATE TABLE IF NOT EXISTS bump_stats (
                    guild_id VARCHAR(20) PRIMARY KEY,
                    total_bumps INT DEFAULT 0
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            `);

            console.log('[BUMP] ✅ Tables MySQL créées');
        } catch (e) {
            console.error('[BUMP] Erreur tables MySQL:', e.message);
        }
    }
}

module.exports = BumpManager;