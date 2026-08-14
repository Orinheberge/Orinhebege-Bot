const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'database.json');

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
    // Dans defaultData, ajoutez :
    automod: {
    enabled: false,
    // Filtres
    badWords: {
        enabled: true,
        words: ["pute", "fdp", "ntm", "enculé", "salope", "connard", "merde", "tg", "ftg"],
        action: "delete",       // delete | warn | mute
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
        minChars: 10,           // Nombre min de caractères avant vérification
        maxPercent: 70,         // % max de majuscules autorisé
        action: "delete",
        notifyUser: true
    },
    spam: {
        enabled: true,
        maxMessages: 5,         // Messages max dans la fenêtre
        timeWindow: 3000,       // Fenêtre en ms
        action: "mute",
        muteDuration: 600000,   // Durée mute en ms (10min)
        notifyUser: true
    },
    massMention: {
        enabled: true,
        maxMentions: 5,
        action: "delete",
        notifyUser: true
    },
    // Exemptions
    exemptRoles: [],            // IDs des rôles exemptés
    exemptChannels: []          // IDs des salons exemptés
}
};

class Database {
    static load() {
        try {
            if (fs.existsSync(DB_PATH)) {
                const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
                // Fusionner avec les valeurs par défaut pour éviter les clés manquantes après mise à jour
                return { ...defaultData, ...data, features: { ...defaultData.features, ...(data.features || {}) } };
            }
        } catch (e) {
            console.error('❌ Erreur chargement DB:', e);
        }
        return { ...defaultData };
    }

    static getAutomod() {
    const data = this.load();
    return data.automod || defaultData.automod;
}

static setAutomod(key, value) {
    const data = this.load();
    if (!data.automod) data.automod = { ...defaultData.automod };

    // Support des clés imbriquées ex: "badWords.enabled"
    if (key.includes('.')) {
        const [cat, prop] = key.split('.');
        if (!data.automod[cat]) data.automod[cat] = {};
        data.automod[cat][prop] = value;
    } else {
        data.automod[key] = value;
    }
    return this.save(data);
}

    static save(data) {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4), 'utf-8');
            return true;
        } catch (e) {
            console.error('❌ Erreur sauvegarde DB:', e);
            return false;
        }
    }

    static get(key) {
        const data = this.load();
        if (key.startsWith('features.')) {
            const featureKey = key.split('.')[1];
            return data.features?.[featureKey] ?? true;
        }
        return data[key];
    }

    static set(key, value) {
        const data = this.load();
        if (key.startsWith('features.')) {
            if (!data.features) data.features = {};
            data.features[key.split('.')[1]] = value;
        } else {
            data[key] = value;
        }
        return this.save(data);
    }

    static isFeatureEnabled(feature) {
        return this.get(`features.${feature}`);
    }
}

module.exports = Database;