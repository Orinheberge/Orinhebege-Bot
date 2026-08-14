const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '1504',
    database: process.env.DB_NAME || 's43_Orinhebergebot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const DB_STATUS = process.env.DB_STATUS || 'on';
const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID || process.env.DISCORD_GUILD_ID;

let pool = null;

class MySQL {

    static isEnabled() {
        return DB_STATUS === 'on';
    }

    static isMainGuild(guildId) {
        return String(guildId) === String(MAIN_GUILD_ID);
    }

    static useMySQL(guildId) {
        return this.isEnabled() && !this.isMainGuild(guildId);
    }

    static async init() {
        if (!this.isEnabled()) {
            console.log('[MySQL] Désactivé (DB_STATUS != on)');
            return false;
        }

        try {
            pool = mysql.createPool(DB_CONFIG);
            const conn = await pool.getConnection();
            conn.release();
            console.log('[MySQL] ✅ Connecté à MySQL');
            await this.createTables();
            return true;
        } catch (err) {
            console.error(`[MySQL] ❌ Erreur connexion: ${err.message}`);
            // Ne pas crasher - continuer sans MySQL
            pool = null;
            return false;
        }
    }

    static async createTables() {
        if (!pool) return;

        const queries = [
            `CREATE TABLE IF NOT EXISTS levels (
                guild_id VARCHAR(20) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                xp INT DEFAULT 0,
                level INT DEFAULT 0,
                message_xp INT DEFAULT 0,
                voice_xp INT DEFAULT 0,
                total_messages INT DEFAULT 0,
                voice_time INT DEFAULT 0,
                last_message_xp BIGINT DEFAULT 0,
                PRIMARY KEY (guild_id, user_id),
                INDEX idx_guild_xp (guild_id, xp DESC)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

            `CREATE TABLE IF NOT EXISTS warnings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                reason TEXT,
                moderator VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_guild_user (guild_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

            `CREATE TABLE IF NOT EXISTS guild_config (
                guild_id VARCHAR(20) PRIMARY KEY,
                config JSON NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

            `CREATE TABLE IF NOT EXISTS automod_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                filter VARCHAR(50),
                action VARCHAR(20),
                content TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_guild (guild_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

            `CREATE TABLE IF NOT EXISTS logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20),
                type VARCHAR(20) NOT NULL,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_guild_type (guild_id, type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

            `CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                channel_id VARCHAR(20) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                status ENUM('open','closed') DEFAULT 'open',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                closed_at DATETIME NULL,
                INDEX idx_guild_status (guild_id, status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        ];

        for (const query of queries) {
            try {
                await pool.execute(query);
            } catch (err) {
                console.error(`[MySQL] Erreur création table: ${err.message}`);
            }
        }
        console.log('[MySQL] ✅ Tables vérifiées/créées');
    }

    static async query(sql, params = []) {
        if (!pool) throw new Error('MySQL non initialisé');
        const [rows] = await pool.execute(sql, params);
        return rows;
    }

    // --- LEVELS ---
    static async getLevel(guildId, userId) {
        const rows = await this.query(
            'SELECT * FROM levels WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        if (rows.length > 0) return rows[0];
        await this.query('INSERT INTO levels (guild_id, user_id) VALUES (?, ?)', [guildId, userId]);
        return { guild_id: guildId, user_id: userId, xp: 0, level: 0, message_xp: 0, voice_xp: 0, total_messages: 0, voice_time: 0, last_message_xp: 0 };
    }

    static async addXP(guildId, userId, xp, type = 'message') {
        const data = await this.getLevel(guildId, userId);
        const maxLevel = 5000;
        const oldLevel = data.level;
        let newXp = data.xp + xp;
        let newLevel = Math.min(Math.floor(Math.sqrt(newXp / 100)), maxLevel);

        if (type === 'message') {
            await this.query(
                `UPDATE levels SET xp = ?, level = ?, message_xp = message_xp + ?, total_messages = total_messages + 1, last_message_xp = ? WHERE guild_id = ? AND user_id = ?`,
                [newXp, newLevel, xp, Date.now(), guildId, userId]
            );
        } else if (type === 'voice') {
            await this.query(
                `UPDATE levels SET xp = ?, level = ?, voice_xp = voice_xp + ?, voice_time = voice_time + 60 WHERE guild_id = ? AND user_id = ?`,
                [newXp, newLevel, xp, guildId, userId]
            );
        }

        return {
            oldLevel, newLevel,
            leveledUp: newLevel > oldLevel,
            userData: { xp: newXp, level: newLevel, messageXP: data.message_xp + (type === 'message' ? xp : 0), voiceXP: data.voice_xp + (type === 'voice' ? xp : 0), totalMessages: data.total_messages + (type === 'message' ? 1 : 0), voiceTime: data.voice_time + (type === 'voice' ? 60 : 0) }
        };
    }

    static async getLeaderboard(guildId, limit = 10) {
        return this.query('SELECT user_id, xp, level, total_messages, voice_time FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?', [guildId, limit]);
    }

    static async getRank(guildId, userId) {
        const rows = await this.query(
            'SELECT COUNT(*) + 1 as rank FROM levels WHERE guild_id = ? AND xp > (SELECT xp FROM levels WHERE guild_id = ? AND user_id = ?)',
            [guildId, guildId, userId]
        );
        return rows[0]?.rank || 1;
    }

    static async resetLevel(guildId, userId) {
        await this.query('DELETE FROM levels WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    }

    // --- WARNINGS ---
    static async addWarning(guildId, userId, reason, moderator) {
        await this.query('INSERT INTO warnings (guild_id, user_id, reason, moderator) VALUES (?, ?, ?, ?)', [guildId, userId, reason, moderator]);
        const rows = await this.query('SELECT COUNT(*) as count FROM warnings WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
        return rows[0]?.count || 1;
    }

    static async getWarnings(guildId, userId) {
        return this.query('SELECT reason, moderator, created_at as date FROM warnings WHERE guild_id = ? AND user_id = ? ORDER BY id ASC', [guildId, userId]);
    }

    static async clearWarnings(guildId, userId) {
        await this.query('DELETE FROM warnings WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    }

    // --- CONFIG ---
    static async getGuildConfig(guildId) {
        const rows = await this.query('SELECT config FROM guild_config WHERE guild_id = ?', [guildId]);
        if (rows.length > 0) return typeof rows[0].config === 'string' ? JSON.parse(rows[0].config) : rows[0].config;
        return {};
    }

    static async setGuildConfig(guildId, key, value) {
        const config = await this.getGuildConfig(guildId);
        if (key.includes('.')) {
            const [cat, prop] = key.split('.');
            if (!config[cat]) config[cat] = {};
            config[cat][prop] = value;
        } else {
            config[key] = value;
        }
        await this.query('INSERT INTO guild_config (guild_id, config) VALUES (?, ?) ON DUPLICATE KEY UPDATE config = ?', [guildId, JSON.stringify(config), JSON.stringify(config)]);
        return config;
    }

    // --- LOGS ---
    static async addLog(guildId, type, message) {
        await this.query('INSERT INTO logs (guild_id, type, message) VALUES (?, ?, ?)', [guildId, type, message?.substring(0, 2000)]);
    }

    // --- AUTOMOD ---
    static async addAutomodLog(guildId, userId, filter, action, content) {
        await this.query('INSERT INTO automod_logs (guild_id, user_id, filter, action, content) VALUES (?, ?, ?, ?, ?)', [guildId, userId, filter, action, content?.substring(0, 1000)]);
    }

    // --- TICKETS ---
    static async createTicket(guildId, channelId, userId) {
        await this.query('INSERT INTO tickets (guild_id, channel_id, user_id) VALUES (?, ?, ?)', [guildId, channelId, userId]);
    }

    static async closeTicket(channelId) {
        await this.query("UPDATE tickets SET status = 'closed', closed_at = NOW() WHERE channel_id = ?", [channelId]);
    }

    static async getOpenTicket(guildId, userId) {
        const rows = await this.query("SELECT * FROM tickets WHERE guild_id = ? AND user_id = ? AND status = 'open'", [guildId, userId]);
        return rows[0] || null;
    }

    // --- FERMETURE ---
    static async close() {
        if (pool) {
            await pool.end();
            pool = null;
            console.log('[MySQL] Connexion fermée');
        }
    }
}

module.exports = MySQL;