const fs = require('fs');
const path = require('path');
const Database = require('./Database');

const LEVELS_PATH = path.join(__dirname, '..', 'levels.json');
let voiceInterval = null;

class LevelDB {
    static load() {
        try {
            if (fs.existsSync(LEVELS_PATH)) return JSON.parse(fs.readFileSync(LEVELS_PATH, 'utf-8'));
        } catch (e) { console.error('❌ Erreur chargement Levels:', e); }
        return {};
    }

    static save(data) {
        try { fs.writeFileSync(LEVELS_PATH, JSON.stringify(data, null, 4), 'utf-8'); return true; }
        catch (e) { console.error('❌ Erreur sauvegarde Levels:', e); return false; }
    }

    static getUser(userId, guildId) {
        const data = this.load();
        const key = `${guildId}-${userId}`;
        if (!data[key]) {
            data[key] = { xp: 0, level: 0, messageXP: 0, voiceXP: 0, totalMessages: 0, voiceTime: 0, lastMessageXP: 0 };
            this.save(data);
        }
        return data[key];
    }

    static addXP(userId, guildId, xp, type = 'message') {
        const data = this.load();
        const key = `${guildId}-${userId}`;
        if (!data[key]) data[key] = { xp: 0, level: 0, messageXP: 0, voiceXP: 0, totalMessages: 0, voiceTime: 0, lastMessageXP: 0 };

        const maxLevel = Database.get('maxLevel') || 5000;
        const oldLevel = data[key].level;

        data[key].xp += xp;
        if (type === 'message') {
            data[key].messageXP += xp;
            data[key].totalMessages += 1;
            data[key].lastMessageXP = Date.now();
        } else if (type === 'voice') {
            data[key].voiceXP += xp;
            data[key].voiceTime += 60;
        }

        const newLevel = Math.min(this.calculateLevel(data[key].xp), maxLevel);
        data[key].level = newLevel;
        this.save(data);

        return { oldLevel, newLevel, leveledUp: newLevel > oldLevel, userData: data[key] };
    }

    static calculateLevel(xp) { return Math.floor(Math.sqrt(xp / 100)); }
    static xpForNextLevel(level) { return (level + 1) * (level + 1) * 100; }
    static xpForLevel(level) { return level * level * 100; }

    static getLeaderboard(guildId, limit = 10) {
        const data = this.load();
        const prefix = `${guildId}-`;
        const users = Object.entries(data)
            .filter(([k]) => k.startsWith(prefix))
            .map(([k, v]) => ({ userId: k.substring(prefix.length), ...v }))
            .sort((a, b) => b.xp - a.xp);
        return users.slice(0, limit);
    }

    static getRank(userId, guildId) {
        const data = this.load();
        const prefix = `${guildId}-`;
        const users = Object.entries(data)
            .filter(([k]) => k.startsWith(prefix))
            .map(([k, v]) => ({ userId: k.substring(prefix.length), ...v }))
            .sort((a, b) => b.xp - a.xp);
        const rank = users.findIndex(u => u.userId === userId) + 1;
        return rank || users.length;
    }

    /**
     * Démarre la boucle d'XP vocal (à appeler dans ready.js)
     */
    static startVoiceXPSystem(client) {
        if (voiceInterval) clearInterval(voiceInterval);
        
        voiceInterval = setInterval(async () => {
            if (!client.isReady() || !Database.isFeatureEnabled('xpVoice')) return;
            
            const xpAmount = Database.get('xpVoice') || 10;
            const maxLevel = Database.get('maxLevel') || 5000;

            for (const guild of client.guilds.cache.values()) {
                if (!guild.voiceStates) continue;
                for (const [userId, voiceState] of guild.voiceStates.cache) {
                    try {
                        if (!voiceState.member || voiceState.member.user.bot) continue;
                        if (voiceState.selfDeaf || voiceState.selfMute || voiceState.serverDeaf || voiceState.serverMute) continue;
                        if (!voiceState.channel || (guild.afkChannelId && voiceState.channelId === guild.afkChannelId)) continue;

                        const userData = this.getUser(userId, guild.id);
                        if (userData.level >= maxLevel) continue;

                        const randomXP = Math.floor(xpAmount * (0.8 + Math.random() * 0.4));
                        this.addXP(userId, guild.id, randomXP, 'voice');
                    } catch (err) { /* Silencieux pour éviter le spam console */ }
                }
            }
        }, 60 * 1000);
        
        console.log('✅ Système XP Vocal démarré');
    }
}

module.exports = LevelDB;