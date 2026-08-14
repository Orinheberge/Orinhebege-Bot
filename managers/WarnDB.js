const fs = require('fs');
const path = require('path');

const WARNS_PATH = path.join(__dirname, '..', 'warns.json');

class WarnDB {
    static load() {
        try {
            if (fs.existsSync(WARNS_PATH)) return JSON.parse(fs.readFileSync(WARNS_PATH, 'utf-8'));
        } catch (e) { console.error('❌ Erreur chargement Warns:', e); }
        return {};
    }

    static save(data) {
        try { fs.writeFileSync(WARNS_PATH, JSON.stringify(data, null, 4), 'utf-8'); return true; }
        catch (e) { console.error('❌ Erreur sauvegarde Warns:', e); return false; }
    }

    static add(userId, guildId, reason, moderator) {
        const data = this.load();
        const key = `${guildId}-${userId}`;
        if (!data[key]) data[key] = [];
        data[key].push({ reason, moderator, date: new Date().toISOString() });
        this.save(data);
        return data[key].length;
    }

    static get(userId, guildId) {
        const data = this.load();
        return data[`${guildId}-${userId}`] || [];
    }

    static clear(userId, guildId) {
        const data = this.load();
        delete data[`${guildId}-${userId}`];
        this.save(data);
    }
    
    static remove(userId, guildId, index) {
        const data = this.load();
        const key = `${guildId}-${userId}`;
        if (data[key] && data[key][index]) {
            data[key].splice(index, 1);
            this.save(data);
            return true;
        }
        return false;
    }
}

module.exports = WarnDB;