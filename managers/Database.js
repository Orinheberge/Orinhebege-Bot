const fs = require('fs');
const path = require('path');
const MySQL = require('./MySQL');

const DB_PATH = path.join(__dirname, '..', 'database.json');
const MAIN_GUILD_ID = process.env.DISCORD_GUILD_ID;

const defaultData = {
    ticketCategory: null,
    transcriptChannel: null,
    staffRole: null,
    welcomeChannel: null,
    logsChannel: null,
    statusChannel: null,
    statusMessageId: null,
    levelupChannel: null,
    xpMessage: 15,
    xpVoice: 15,
    xpMessageCooldown: 60,
    maxLevel: 5000,
    levelRoles: {},
    autoRole: null,
    features: {
        xpMessages: true,
        xpVoice: true,
        welcomeMessages: true,
        leaveMessages: true,
        logs: true,
        tickets: true,
        statusServices: true,
        botStatusRotation: true,
        levelUpNotifications: true,
        reactionReglement: true
    },
    automod: {
        enabled: false,
        badWords: {
            enabled: true,
            words: ["pute", "fdp", "ntm", "enculé", "salope", "connard", "merde", "tg", "ftg"],
            action: "delete",
            notifyUser: true
        },
        links: {
            enabled: true,
            whitelist: ["discord.gg", "orinstone.deepstone.fr", "youtube.com", "youtu.be", "twitch.tv"],
            action: "delete",
            notifyUser: true
        },
        invites: {
            enabled: true,
            action: "delete",
            notifyUser: true
        },
        caps: {
            enabled: false,
            minChars: 10,
            maxPercent: 70,
            action: "delete",
            notifyUser: true
        },
        spam: {
            enabled: true,
            maxMessages: 5,
            timeWindow: 3000,
            action: "mute",
            muteDuration: 600000,
            notifyUser: true
        },
        massMention: {
            enabled: true,
            maxMentions: 5,
            action: "delete",
            notifyUser: true
        },
        exemptRoles: [],
        exemptChannels: []
    }
};

class Database {

    // =============================================
    // DÉTECTION : JSON ou MySQL ?
    // =============================================

    static isMainGuild(guildId) {
        if (!guildId) return true; // Pas de guildId = serveur principal
        return String(guildId) === String(MAIN_GUILD_ID);
    }

    static useMySQL(guildId) {
        return MySQL.isEnabled() && !this.isMainGuild(guildId);
    }

    // =============================================
    // JSON (serveur principal)
    // =============================================

    static loadJSON() {
        try {
            if (fs.existsSync(DB_PATH)) {
                const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
                return {
                    ...defaultData,
                    ...data,
                    features: { ...defaultData.features, ...(data.features || {}) },
                    automod: { ...defaultData.automod, ...(data.automod || {}) }
                };
            }
        } catch (e) {
            console.error('❌ Erreur chargement DB JSON:', e);
        }
        return { ...defaultData };
    }

    static saveJSON(data) {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4), 'utf-8');
            return true;
        } catch (e) {
            console.error('❌ Erreur sauvegarde DB JSON:', e);
            return false;
        }
    }

    // =============================================
    // LOAD / SAVE (route automatiquement)
    // =============================================

    static load(guildId) {
        if (this.useMySQL(guildId)) {
            return null; // MySQL se gère via les méthodes async
        }
        return this.loadJSON();
    }

    static save(data) {
        return this.saveJSON(data);
    }

    // =============================================
    // GET / SET (route automatiquement)
    // =============================================

    static get(key, guildId) {
        if (this.useMySQL(guildId)) {
            return null; // Utiliser les méthodes async MySQL
        }
        const data = this.loadJSON();
        if (key.startsWith('features.')) {
            const featureKey = key.split('.')[1];
            return data.features?.[featureKey] ?? true;
        }
        return data[key];
    }

    static set(key, value, guildId) {
        if (this.useMySQL(guildId)) {
            return MySQL.setGuildConfig(guildId, key, value);
        }
        const data = this.loadJSON();
        if (key.startsWith('features.')) {
            if (!data.features) data.features = {};
            data.features[key.split('.')[1]] = value;
        } else {
            data[key] = value;
        }
        return this.saveJSON(data);
    }

    static isFeatureEnabled(feature, guildId) {
        if (this.useMySQL(guildId)) {
            return true; // Par défaut activé pour MySQL, configurable via guild_config
        }
        return this.get(`features.${feature}`);
    }

    // =============================================
    // AUTOMOD (route automatiquement)
    // =============================================

    static getAutomod(guildId) {
        if (this.useMySQL(guildId)) {
            return null; // Utiliser getAutomodAsync
        }
        const data = this.loadJSON();
        return data.automod || defaultData.automod;
    }

    static async getAutomodAsync(guildId) {
        if (this.useMySQL(guildId)) {
            const config = await MySQL.getGuildConfig(guildId);
            return config.automod || defaultData.automod;
        }
        return this.getAutomod();
    }

    static setAutomod(key, value, guildId) {
        if (this.useMySQL(guildId)) {
            return MySQL.setGuildConfig(guildId, `automod.${key}`, value);
        }
        const data = this.loadJSON();
        if (!data.automod) data.automod = { ...defaultData.automod };
        if (key.includes('.')) {
            const [cat, prop] = key.split('.');
            if (!data.automod[cat]) data.automod[cat] = {};
            data.automod[cat][prop] = value;
        } else {
            data.automod[key] = value;
        }
        return this.saveJSON(data);
    }

    // =============================================
    // LEVELS (route automatiquement)
    // =============================================

    static async getUserLevel(userId, guildId) {
        if (this.useMySQL(guildId)) {
            const row = await MySQL.getLevel(guildId, userId);
            return {
                xp: row.xp,
                level: row.level,
                messageXP: row.message_xp,
                voiceXP: row.voice_xp,
                totalMessages: row.total_messages,
                voiceTime: row.voice_time,
                lastMessageXP: row.last_message_xp
            };
        }
        // JSON : utiliser LevelDB
        const LevelDB = require('./LevelDB');
        return LevelDB.getUser(userId, guildId);
    }

    static async addXP(userId, guildId, xp, type = 'message') {
        if (this.useMySQL(guildId)) {
            return MySQL.addXP(guildId, userId, xp, type);
        }
        const LevelDB = require('./LevelDB');
        return LevelDB.addXP(userId, guildId, xp, type);
    }

    static async getLeaderboard(guildId, limit = 10) {
        if (this.useMySQL(guildId)) {
            const rows = await MySQL.getLeaderboard(guildId, limit);
            return rows.map(r => ({
                userId: r.user_id,
                xp: r.xp,
                level: r.level,
                totalMessages: r.total_messages,
                voiceTime: r.voice_time
            }));
        }
        const LevelDB = require('./LevelDB');
        return LevelDB.getLeaderboard(guildId, limit);
    }

    static async getRank(userId, guildId) {
        if (this.useMySQL(guildId)) {
            return MySQL.getRank(guildId, userId);
        }
        const LevelDB = require('./LevelDB');
        return LevelDB.getRank(userId, guildId);
    }

    static async resetLevel(userId, guildId) {
        if (this.useMySQL(guildId)) {
            return MySQL.resetLevel(guildId, userId);
        }
        const LevelDB = require('./LevelDB');
        const data = LevelDB.load();
        delete data[`${guildId}-${userId}`];
        return LevelDB.save(data);
    }

    // =============================================
    // WARNINGS (route automatiquement)
    // =============================================

    static async addWarning(userId, guildId, reason, moderator) {
        if (this.useMySQL(guildId)) {
            return MySQL.addWarning(guildId, userId, reason, moderator);
        }
        const WarnDB = require('./WarnDB');
        return WarnDB.add(userId, guildId, reason, moderator);
    }

    static async getWarnings(userId, guildId) {
        if (this.useMySQL(guildId)) {
            return MySQL.getWarnings(guildId, userId);
        }
        const WarnDB = require('./WarnDB');
        return WarnDB.get(userId, guildId);
    }

    static async clearWarnings(userId, guildId) {
        if (this.useMySQL(guildId)) {
            return MySQL.clearWarnings(guildId, userId);
        }
        const WarnDB = require('./WarnDB');
        return WarnDB.clear(userId, guildId);
    }

    // =============================================
    // TICKETS (route automatiquement)
    // =============================================

    static async createTicket(guildId, channelId, userId) {
        if (this.useMySQL(guildId)) {
            return MySQL.createTicket(guildId, channelId, userId);
        }
        // JSON : pas de suivi tickets persistant
    }

    static async closeTicket(channelId) {
        if (MySQL.isEnabled()) {
            return MySQL.closeTicket(channelId);
        }
    }

    static async getOpenTicket(guildId, userId) {
        if (MySQL.isEnabled()) {
            return MySQL.getOpenTicket(guildId, userId);
        }
        return null;
    }

    // =============================================
    // LOGS
    // =============================================

    static async addLog(guildId, type, message) {
        if (this.useMySQL(guildId)) {
            return MySQL.addLog(guildId, type, message);
        }
        // JSON : les logs vont dans le salon Discord uniquement
    }

    // =============================================
    // INITIALISATION
    // =============================================

    static async init() {
        if (MySQL.isEnabled()) {
            const ok = await MySQL.init();
            if (ok) {
                console.log(`[DB] MySQL activé pour les serveurs secondaires (main: ${MAIN_GUILD_ID})`);
            }
        } else {
            console.log('[DB] Mode JSON uniquement (MySQL désactivé)');
        }
    }

    static async close() {
        await MySQL.close();
    }
}

module.exports = Database;