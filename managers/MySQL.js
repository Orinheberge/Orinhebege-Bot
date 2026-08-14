const mysql = require('mysql2/promise');

const DB_CONFIG = {
    host:     process.env.DB_HOST || '5.48.143.126',
    port:     parseInt(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 's43_',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const DB_STATUS = process.env.DB_STATUS || 'on';
const MAIN_GUILD_ID = process.env.MAIN_GUILD_ID;

let pool = null;

class MySQL {

    static isEnabled() {
        return DB_STATUS === 'on';
    }

    static isMainGuild(guildId) {
        return String(guildId) === String(MAIN_GUILD_ID);
    }

    /**
     * Détermine si un serveur doit utiliser MySQL ou JSON
     */
    static useMySQL(guildId) {
        return this.isEnabled() && !this.isMainGuild(guildId);
    }

    /**
     * Initialise le pool de connexions et crée les tables
     */
    static async init() {
        if (!this.isEnabled()) {
            console.log('[MySQL] Désactivé (DB_STATUS != on)');
            return false;
        }

        try {
            pool = mysql.createPool(DB_CONFIG);

            // Tester la connexion
            const conn = await pool.getConnection();
            conn.release();
            console.log('[MySQL] ✅ Connecté à MySQL');

            // Créer les tables
            await this.createTables();
            return true;

        } catch (err) {
            console.error(`[MySQL] ❌ Erreur connexion: ${err.message}`);
            return false;
        }
    }

    static async createTables() {
        const queries = [
            // --- XP & Niveaux ---
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

            // --- Warnings ---
            `CREATE TABLE IF NOT EXISTS warnings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20) NOT NULL,
                user_id VARCHAR(20) NOT NULL,
                reason TEXT,
                moderator VARCHAR(100),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_guild_user (guild_id, user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

            // --- Configuration par serveur ---
            `CREATE TABLE IF NOT EXISTS guild_config (
                guild_id VARCHAR(20) PRIMARY KEY,
                config JSON NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

            // --- AutoMod logs ---
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

            // --- Logs généraux ---
            `CREATE TABLE IF NOT EXISTS logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                guild_id VARCHAR(20),
                type VARCHAR(20) NOT NULL,
                message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_guild_type (guild_id, type)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

            // --- Tickets ---
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

    /**
     * Exécute une requête SQL
     */
    static async query(sql, params = []) {
        if (!pool) throw new Error('MySQL non initialisé');
        const [rows] = await pool.execute(sql, params);
        return rows;
    }

    // =============================================
    // LEVELS (XP & Niveaux)
    // =============================================

    static async getLevel(guildId, userId) {
        const rows = await this.query(
            'SELECT * FROM levels WHERE guild_id = ? AND user_id = ?',
            [guildId, userId]
        );
        if (rows.length > 0) return rows[0];

        // Créer l'entrée si inexistante
        await this.query(
            'INSERT INTO levels (guild_id, user_id) VALUES (?, ?)',
            [guildId, userId]
        );
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
                `UPDATE levels SET xp = ?, level = ?, message_xp = message_xp + ?,
                 total_messages = total_messages + 1, last_message_xp = ?
                 WHERE guild_id = ? AND user_id = ?`,
                [newXp, newLevel, xp, Date.now(), guildId, userId]
            );
        } else if (type === 'voice') {
            await this.query(
                `UPDATE levels SET xp = ?, level = ?, voice_xp = voice_xp + ?,
                 voice_time = voice_time + 60
                 WHERE guild_id = ? AND user_id = ?`,
                [newXp, newLevel, xp, guildId, userId]
            );
        }

        return {
            oldLevel,
            newLevel,
            leveledUp: newLevel > oldLevel,
            userData: { xp: newXp, level: newLevel, messageXP: data.message_xp + (type === 'message' ? xp : 0), voiceXP: data.voice_xp + (type === 'voice' ? xp : 0), totalMessages: data.total_messages + (type === 'message' ? 1 : 0), voiceTime: data.voice_time + (type === 'voice' ? 60 : 0) }
        };
    }

    static async getLeaderboard(guildId, limit = 10) {
        return this.query(
            'SELECT user_id, xp, level, total_messages, voice_time FROM levels WHERE guild_id = ? ORDER BY xp DESC LIMIT ?',
            [guildId, limit]
        );
    }
}