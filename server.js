const {
    Client,
    GatewayIntentBits,
    Partials,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    ChannelType,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const net = require('net');

// ===== NOUVEAUX MODULES POUR LE PANEL WEB =====
const express = require('express');
const bodyParser = require('body-parser');

// --- CHARGEMENT DE LA CONFIGURATION ---
const config = require('./config.json');
const DB_PATH = path.join(__dirname, 'database.json');
const WARNS_PATH = path.join(__dirname, 'warns.json');
const LEVELS_PATH = path.join(__dirname, 'levels.json');

// ===== CONFIGURATION DU SERVEUR WEB =====
const WEB_PORT = 26162; // Port pour node.orinstone.deepstone.fr:26162

// --- CHARGEMENT DU RÈGLEMENT ---
const REGLEMENT_PATH = path.join(__dirname, 'reglement.json');
let reglementData = null;

try {
    if (fs.existsSync(REGLEMENT_PATH)) {
        reglementData = JSON.parse(fs.readFileSync(REGLEMENT_PATH, 'utf-8'));
        console.log('✅ Règlement chargé avec succès');
    } else {
        console.warn('⚠️ Fichier reglement.json introuvable');
    }
} catch (e) {
    console.error('Erreur de chargement du règlement:', e);
}

// --- FONCTION DE CRÉATION DE L'EMBED RÈGLEMENT ---
function createReglementEmbed() {
    if (!reglementData) return null;

    const embed = new EmbedBuilder()
        .setTitle(reglementData.title || "📜 Règlement")
        .setDescription(reglementData.description || "");

    if (reglementData.color) {
        embed.setColor(reglementData.color);
    }

    if (reglementData.thumbnail) {
        embed.setThumbnail(reglementData.thumbnail);
    }

    if (reglementData.image) {
        embed.setImage(reglementData.image);
    }

    if (Array.isArray(reglementData.fields)) {
        for (const field of reglementData.fields) {
            embed.addFields({
                name: field.name || "Champ sans titre",
                value: field.value || "—",
                inline: field.inline === true
            });
        }
    }

    if (reglementData.footer && reglementData.footer.text) {
        const footerObj = { text: reglementData.footer.text };
        if (reglementData.footer.icon_url) {
            footerObj.iconURL = reglementData.footer.icon_url;
        }
        embed.setFooter(footerObj);
    }

    if (reglementData.timestamp === true || reglementData.timestamp === "true") {
        embed.setTimestamp();
    }

    if (reglementData.author) {
        embed.setAuthor({
            name: reglementData.author.name || "",
            iconURL: reglementData.author.icon_url || null,
            url: reglementData.author.url || null
        });
    }

    if (reglementData.url) {
        embed.setURL(reglementData.url);
    }

    return embed;
}

// --- SYSTÈME DE BASE DE DONNÉES JSON ---
const Database = {
    load() {
        try {
            if (fs.existsSync(DB_PATH)) {
                return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
            }
        } catch (e) {
            console.error('Erreur de chargement DB:', e);
        }
        return {
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
            // ===== NOUVELLES CLÉS POUR LE PANEL : ACTIVATION/DÉSACTIVATION =====
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
            }
        };
    },
    save(data) {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 4), 'utf-8');
            return true;
        } catch (e) {
            console.error('Erreur de sauvegarde DB:', e);
            return false;
        }
    },
    get(key) {
        const data = this.load();
        if (key.startsWith('features.')) {
            const featureKey = key.split('.')[1];
            if (data.features && featureKey in data.features) {
                return data.features[featureKey];
            }
            return true; // Par défaut, activé
        }
        return data[key];
    },
    set(key, value) {
        const data = this.load();
        if (key.startsWith('features.')) {
            if (!data.features) data.features = {};
            const featureKey = key.split('.')[1];
            data.features[featureKey] = value;
        } else {
            data[key] = value;
        }
        return this.save(data);
    },
    isFeatureEnabled(feature) {
        return this.get(`features.${feature}`);
    }
};

const WarnDB = {
    load() {
        try {
            if (fs.existsSync(WARNS_PATH)) {
                return JSON.parse(fs.readFileSync(WARNS_PATH, 'utf-8'));
            }
        } catch (e) {
            console.error('Erreur de chargement Warns:', e);
        }
        return {};
    },
    save(data) {
        try {
            fs.writeFileSync(WARNS_PATH, JSON.stringify(data, null, 4), 'utf-8');
            return true;
        } catch (e) {
            console.error('Erreur de sauvegarde Warns:', e);
            return false;
        }
    },
    add(userId, guildId, reason, moderator) {
        const data = this.load();
        const key = `${guildId}-${userId}`;
        if (!data[key]) data[key] = [];
        data[key].push({ reason, moderator, date: new Date().toISOString() });
        this.save(data);
        return data[key].length;
    },
    get(userId, guildId) {
        const data = this.load();
        return data[`${guildId}-${userId}`] || [];
    },
    clear(userId, guildId) {
        const data = this.load();
        delete data[`${guildId}-${userId}`];
        this.save(data);
    }
};

// --- SYSTÈME DE NIVEAUX ---
const LevelDB = {
    load() {
        try {
            if (fs.existsSync(LEVELS_PATH)) {
                return JSON.parse(fs.readFileSync(LEVELS_PATH, 'utf-8'));
            }
        } catch (e) {
            console.error('Erreur de chargement Levels:', e);
        }
        return {};
    },
    save(data) {
        try {
            fs.writeFileSync(LEVELS_PATH, JSON.stringify(data, null, 4), 'utf-8');
            return true;
        } catch (e) {
            console.error('Erreur de sauvegarde Levels:', e);
            return false;
        }
    },
    getUser(userId, guildId) {
        const data = this.load();
        const key = `${guildId}-${userId}`;
        if (!data[key]) {
            data[key] = {
                xp: 0,
                level: 0,
                messageXP: 0,
                voiceXP: 0,
                totalMessages: 0,
                voiceTime: 0,
                lastMessageXP: 0
            };
            this.save(data);
        }
        return data[key];
    },
    addXP(userId, guildId, xp, type = 'message') {
        const data = this.load();
        const key = `${guildId}-${userId}`;
        
        if (!data[key]) {
            data[key] = {
                xp: 0,
                level: 0,
                messageXP: 0,
                voiceXP: 0,
                totalMessages: 0,
                voiceTime: 0,
                lastMessageXP: 0
            };
        }

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

        const newLevel = this.calculateLevel(data[key].xp);
        data[key].level = Math.min(newLevel, maxLevel);

        this.save(data);
        
        return {
            oldLevel,
            newLevel: data[key].level,
            leveledUp: data[key].level > oldLevel,
            userData: data[key]
        };
    },
    calculateLevel(xp) {
        return Math.floor(Math.sqrt(xp / 100));
    },
    xpForNextLevel(level) {
        return (level + 1) * (level + 1) * 100;
    },
    xpForLevel(level) {
        return level * level * 100;
    },
    getLeaderboard(guildId, limit = 10) {
        const data = this.load();
        const prefix = `${guildId}-`;
        const users = [];
        
        for (const key in data) {
            if (key.startsWith(prefix)) {
                const userId = key.substring(prefix.length);
                users.push({
                    userId,
                    ...data[key]
                });
            }
        }
        
        users.sort((a, b) => b.xp - a.xp);
        return users.slice(0, limit);
    },
    getRank(userId, guildId) {
        const data = this.load();
        const prefix = `${guildId}-`;
        const users = [];
        
        for (const key in data) {
            if (key.startsWith(prefix)) {
                const id = key.substring(prefix.length);
                users.push({ userId: id, ...data[key] });
            }
        }
        
        users.sort((a, b) => b.xp - a.xp);
        const rank = users.findIndex(u => u.userId === userId) + 1;
        return rank || users.length;
    }
};

const db = Database.load();
const messageCooldowns = new Map();

// --- INITIALISATION DU CLIENT ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User, Partials.GuildMember, Partials.Reaction]
});

// --- GESTION DES ERREURS GLOBALES ---
client.on('error', console.error);
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// --- SYSTÈME DE NIVEAUX - GESTION DES MESSAGES (VÉRIFIE SI ACTIVÉ) ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    
    // ===== VÉRIFICATION : FEATURE ACTIVÉE ? =====
    if (!Database.isFeatureEnabled('xpMessages')) return;
    
    const cooldown = Database.get('xpMessageCooldown') || 60;
    const xpAmount = Database.get('xpMessage') || 15;
    const maxLevel = Database.get('maxLevel') || 5000;
    
    const cooldownKey = `${message.guild.id}-${message.author.id}`;
    const now = Date.now();
    
    if (messageCooldowns.has(cooldownKey)) {
        const lastTime = messageCooldowns.get(cooldownKey);
        if (now - lastTime < cooldown * 1000) {
            return;
        }
    }
    
    const userData = LevelDB.getUser(message.author.id, message.guild.id);
    
    if (userData.level >= maxLevel) {
        messageCooldowns.set(cooldownKey, now);
        return;
    }
    
    const randomXP = Math.floor(xpAmount * (0.8 + Math.random() * 0.4));
    const result = LevelDB.addXP(message.author.id, message.guild.id, randomXP, 'message');
    
    messageCooldowns.set(cooldownKey, now);
    
    if (result.leveledUp && Database.isFeatureEnabled('levelUpNotifications')) {
        await sendLevelUpNotification(message, result);
    }
});

// --- SYSTÈME DE NIVEAUX - GESTION DU VOCAL ---
let voiceInterval = null;

function startVoiceXPSystem() {
    if (voiceInterval) {
        clearInterval(voiceInterval);
        voiceInterval = null;
    }
    
    voiceInterval = setInterval(async () => {
        if (!client.isReady()) return;
        
        // ===== VÉRIFICATION : FEATURE ACTIVÉE ? =====
        if (!Database.isFeatureEnabled('xpVoice')) return;
        
        const xpAmount = Database.get('xpVoice') || 10;
        const maxLevel = Database.get('maxLevel') || 5000;
        
        console.log(`[VOCAL XP] Vérification en cours...`);
        
        for (const guild of client.guilds.cache.values()) {
            try {
                if (!guild.voiceStates) continue;
                
                const voiceStates = guild.voiceStates.cache;
                
                for (const [userId, voiceState] of voiceStates) {
                    try {
                        if (!voiceState.member || voiceState.member.user.bot) continue;
                        if (voiceState.selfDeaf || voiceState.selfMute) continue;
                        if (voiceState.serverDeaf || voiceState.serverMute) continue;
                        if (!voiceState.channel) continue;
                        if (guild.afkChannelId && voiceState.channelId === guild.afkChannelId) continue;
                        
                        const userData = LevelDB.getUser(userId, guild.id);
                        if (userData.level >= maxLevel) continue;
                        
                        const randomXP = Math.floor(xpAmount * (0.8 + Math.random() * 0.4));
                        const result = LevelDB.addXP(userId, guild.id, randomXP, 'voice');
                        
                        console.log(`[VOCAL XP] ${voiceState.member.user.tag} a gagné ${randomXP} XP (Niveau ${result.newLevel})`);
                        
                        if (result.leveledUp) {
                            await applyLevelRoles(guild, voiceState.member, result.newLevel);
                            
                            if (!Database.isFeatureEnabled('levelUpNotifications')) continue;
                            
                            const levelupChannelId = Database.get('levelupChannel');
                            if (levelupChannelId) {
                                const channel = guild.channels.cache.get(levelupChannelId);
                                if (channel) {
                                    const embed = new EmbedBuilder()
                                        .setTitle("🎉 Niveau Supérieur !")
                                        .setDescription(`Félicitations ${voiceState.member} ! Tu es passé au **niveau ${result.newLevel}** grâce au vocal !`)
                                        .setColor(0xf1c40f)
                                        .setThumbnail(voiceState.member.user.displayAvatarURL())
                                        .addFields(
                                            { name: "📊 Niveau", value: `${result.newLevel}`, inline: true },
                                            { name: "⭐ XP Total", value: `${result.userData.xp}`, inline: true }
                                        )
                                        .setTimestamp();
                                    
                                    channel.send({ content: `${voiceState.member}`, embeds: [embed] }).catch(() => {});
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`[VOCAL XP] Erreur pour ${userId}:`, err);
                    }
                }
            } catch (guildErr) {
                console.error(`[VOCAL XP] Erreur guild ${guild.id}:`, guildErr);
            }
        }
    }, 60 * 1000);
    
    console.log('✅ Système d\'XP vocal démarré (vérification toutes les minutes)');
}

// --- FONCTION DE NOTIFICATION DE LEVEL UP ---
async function sendLevelUpNotification(message, result) {
    if (!Database.isFeatureEnabled('levelUpNotifications')) return;
    
    const levelupChannelId = Database.get('levelupChannel');
    const channel = levelupChannelId 
        ? message.guild.channels.cache.get(levelupChannelId)
        : message.channel;
    
    if (!channel) return;
    
    const userData = result.userData;
    const maxLevel = Database.get('maxLevel') || 5000;
    
    const embed = new EmbedBuilder()
        .setTitle("🎉 Niveau Supérieur !")
        .setDescription(`Félicitations ${message.author} ! Tu es passé au **niveau ${result.newLevel}** !`)
        .setColor(0xf1c40f)
        .setThumbnail(message.author.displayAvatarURL())
        .addFields(
            { name: "📊 Niveau", value: `${result.newLevel}`, inline: true },
            { name: "⭐ XP Total", value: `${userData.xp}`, inline: true },
            { name: "🎯 Max", value: `${maxLevel}`, inline: true }
        )
        .setFooter({ text: `Rang #${LevelDB.getRank(message.author.id, message.guild.id)}` })
        .setTimestamp();
    
    try {
        await channel.send({ 
            content: `${message.author}`,
            embeds: [embed] 
        });
    } catch (e) {
        console.error('Erreur envoi level up:', e);
    }
    
    await applyLevelRoles(message.guild, message.member, result.newLevel);
}

// --- APPLICATION DES RÔLES DE NIVEAU ---
async function applyLevelRoles(guild, member, level) {
    const levelRoles = Database.get('levelRoles') || {};
    
    for (const [requiredLevel, roleId] of Object.entries(levelRoles)) {
        if (level >= parseInt(requiredLevel)) {
            const role = guild.roles.cache.get(roleId);
            if (role && !member.roles.cache.has(roleId)) {
                try {
                    await member.roles.add(role).catch(() => {});
                } catch (e) {}
            }
        }
    }
}

// --- SYSTÈME DE STATUT DU BOT ---
const botStatuses = [
    { type: 'WATCHING', text: () => `${client.guilds.cache.size} serveur(s)` },
    { type: 'PLAYING', text: () => `avec ${client.users.cache.size} membres` },
    { type: 'WATCHING', text: () => 'les commandes (/help)' },
    { type: 'COMPETING', text: () => 'sur Orinstone Network' },
    { type: 'WATCHING', text: () => 'heberge.orinstone.deepstone.fr' },
    { type: 'PLAYING', text: () => 'Minecraft & Discord' },
    { type: 'LISTENING', text: () => 'vos demandes de support' },
    { type: 'WATCHING', text: () => 'panel.orinstone.deepstone.fr' },
    { type: 'COMPETING', text: () => 'avec la communauté' },
    { type: 'PLAYING', text: () => `/rank pour voir ton niveau` },
    { type: 'WATCHING', text: () => 'node.orinstone.deepstone.fr' },
    { type: 'LISTENING', text: () => `${client.ws.ping}ms de latence` }
];

let currentStatusIndex = 0;

async function updateBotStatus() {
    try {
        if (!client.isReady() || !client.user) return;
        
        // ===== VÉRIFICATION : FEATURE ACTIVÉE ? =====
        if (!Database.isFeatureEnabled('botStatusRotation')) return;
        
        const status = botStatuses[currentStatusIndex];
        const activityType = {
            'PLAYING': 0,
            'STREAMING': 1,
            'LISTENING': 2,
            'WATCHING': 3,
            'COMPETING': 5
        };

        const text = typeof status.text === 'function' ? status.text() : status.text;
        
        if (text.includes('orinstone.deepstone.fr')) {
            await client.user.setPresence({
                activities: [{
                    name: text,
                    type: activityType[status.type],
                    url: 'https://heberge.orinstone.deepstone.fr'
                }],
                status: 'online'
            });
        } else {
            await client.user.setPresence({
                activities: [{
                    name: text,
                    type: activityType[status.type]
                }],
                status: 'online'
            });
        }
        
        console.log(`📊 Statut du bot mis à jour : ${status.type} ${text}`);
        currentStatusIndex = (currentStatusIndex + 1) % botStatuses.length;
    } catch (error) {
        console.error('Erreur mise à jour statut bot:', error);
    }
}

function startBotStatusRotation() {
    updateBotStatus();
    setInterval(updateBotStatus, 15 * 60 * 1000);
    console.log('🔄 Rotation des statuts du bot activée (toutes les 15min)');
}

// --- FONCTIONS DE VÉRIFICATION DE STATUT ---
function checkURL(url) {
    return new Promise((resolve) => {
        const start = Date.now();
        const clientHttp = url.startsWith('https') ? https : http;
        
        const req = clientHttp.get(url, { timeout: 5000 }, (res) => {
            const responseTime = Date.now() - start;
            res.on('data', () => {});
            res.on('end', () => {
                resolve({
                    online: res.statusCode >= 200 && res.statusCode < 400,
                    responseTime,
                    statusCode: res.statusCode
                });
            });
        });
        
        req.on('error', () => {
            resolve({ online: false, responseTime: null, statusCode: null });
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve({ online: false, responseTime: null, statusCode: null });
        });
    });
}

function pingServer(host, port = 80) {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = new net.Socket();
        
        socket.setTimeout(5000);
        
        socket.connect(port, host, () => {
            const responseTime = Date.now() - start;
            socket.destroy();
            resolve({ online: true, responseTime });
        });
        
        socket.on('error', () => {
            socket.destroy();
            resolve({ online: false, responseTime: null });
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve({ online: false, responseTime: null });
        });
    });
}

async function getAllStatus() {
    const services = [
        { name: 'Hébergement Web', url: 'https://heberge.orinstone.deepstone.fr', type: 'url' },
        { name: 'Panel de Gestion', url: 'https://panel.orinstone.deepstone.fr', type: 'url' },
        { name: 'Node Orinstone', host: 'node.orinstone.deepstone.fr', port: 8080, type: 'ping' },
        { name: 'PHPMYADMIN', url: 'https://php.orinstone.deepstone.fr', type: 'url' }
    ];

    const results = [];

    for (const service of services) {
        try {
            let result;
            if (service.type === 'url') {
                result = await checkURL(service.url);
                results.push({
                    name: service.name,
                    url: service.url,
                    online: result.online,
                    responseTime: result.responseTime,
                    statusCode: result.statusCode
                });
            } else {
                result = await pingServer(service.host, service.port);
                results.push({
                    name: service.name,
                    host: service.host,
                    port: service.port,
                    online: result.online,
                    responseTime: result.responseTime
                });
            }
        } catch (e) {
            results.push({
                name: service.name,
                online: false,
                responseTime: null,
                statusCode: null
            });
        }
    }

    return results;
}

function createStatusEmbed(statuses) {
    const allOnline = statuses.every(s => s.online);
    const someOnline = statuses.some(s => s.online);
    
    const color = allOnline ? 0x2ecc71 : (someOnline ? 0xf39c12 : 0xe74c3c);
    const statusEmoji = allOnline ? '✅' : (someOnline ? '⚠️' : '❌');
    const statusText = allOnline ? 'Tous les services opérationnels' : (someOnline ? 'Certains services dégradés' : 'Services hors ligne');

    const embed = new EmbedBuilder()
        .setTitle(`${statusEmoji} Statut des Services`)
        .setDescription(`**État global :** ${statusText}`)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'Dernière vérification' });

    for (const status of statuses) {
        const emoji = status.online ? '🟢' : '🔴';
        const statusLabel = status.online ? 'En ligne' : 'Hors ligne';
        
        let value = `**Statut :** ${statusLabel}`;
        
        if (status.responseTime) {
            value += `\n**Latence :** ${status.responseTime}ms`;
        }
        
        if (status.statusCode) {
            value += `\n**Code HTTP :** ${status.statusCode}`;
        }
        
        if (status.url) {
            const displayUrl = status.url.replace(/^https?:\/\//, '');
            value += `\n**URL :** [${displayUrl}](${status.url})`;
        } else if (status.host) {
            value += `\n**Hôte :** ${status.host}${status.port ? ':' + status.port : ''}`;
        }

        embed.addFields({
            name: `${emoji} ${status.name}`,
            value,
            inline: false
        });
    }

    return embed;
}

function createStatusButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('refresh_status')
            .setLabel('Rafraîchir')
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Secondary)
    );
}

// --- DÉFINITION DES SLASH COMMANDS ---
const slashCommands = [
    new SlashCommandBuilder().setName('setchannel').setDescription('Définit la catégorie des tickets').addChannelOption(opt => opt.setName('categorie').setDescription('La catégorie des tickets').setRequired(true)),
    new SlashCommandBuilder().setName('settranscript').setDescription('Définit le salon des transcripts').addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour les transcripts').setRequired(true)),
    new SlashCommandBuilder().setName('setstaff').setDescription('Définit le rôle Staff').addRoleOption(opt => opt.setName('role').setDescription('Rôle autorisé à voir les tickets').setRequired(true)),
    new SlashCommandBuilder().setName('setwelcome').setDescription('Définit le salon de bienvenue/départ').addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour Join/Quit').setRequired(true)),
    new SlashCommandBuilder().setName('setlogs').setDescription('Définit le salon des logs').addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour les logs').setRequired(true)),
    new SlashCommandBuilder().setName('setstatus').setDescription('Définit le salon pour le statut des services').addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour le statut').setRequired(true)),
    new SlashCommandBuilder().setName('setlevelup').setDescription('Définit le salon pour les notifications de level up').addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour les level up').setRequired(true)),
    new SlashCommandBuilder().setName('setxp').setDescription('Configure les gains d\'XP').addIntegerOption(opt => opt.setName('message').setDescription('XP par message').setRequired(false).setMinValue(1).setMaxValue(100)).addIntegerOption(opt => opt.setName('voice').setDescription('XP par minute en vocal').setRequired(false).setMinValue(1).setMaxValue(100)).addIntegerOption(opt => opt.setName('cooldown').setDescription('Cooldown en secondes entre chaque message').setRequired(false).setMinValue(10).setMaxValue(300)),
    new SlashCommandBuilder().setName('addlevelrole').setDescription('Ajoute un rôle de récompense pour un niveau').addIntegerOption(opt => opt.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1).setMaxValue(5000)).addRoleOption(opt => opt.setName('role').setDescription('Rôle à donner').setRequired(true)),
    new SlashCommandBuilder().setName('removelevelrole').setDescription('Retire un rôle de récompense').addIntegerOption(opt => opt.setName('niveau').setDescription('Niveau à retirer').setRequired(true)),
    new SlashCommandBuilder().setName('setautorole').setDescription('Définit le rôle automatique à donner aux nouveaux membres').addRoleOption(opt => opt.setName('role').setDescription('Le rôle à attribuer automatiquement').setRequired(true)),
    new SlashCommandBuilder().setName('setup').setDescription('Envoie le panneau de création de ticket'),
    new SlashCommandBuilder().setName('help-admin').setDescription('Affiche l\'aide des commandes d\'administration du bot'),

    new SlashCommandBuilder().setName('ban').setDescription('Bannir un membre').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption(opt => opt.setName('user').setDescription('Le membre à bannir').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Raison du ban').setRequired(false)).addIntegerOption(opt => opt.setName('days').setDescription('Jours de messages à supprimer (0-7)').setRequired(false).setMinValue(0).setMaxValue(7)),
    new SlashCommandBuilder().setName('kick').setDescription('Expulser un membre').setDefaultMemberPermissions(PermissionFlagsBits.KickMembers).addUserOption(opt => opt.setName('user').setDescription('Le membre à expulser').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Raison du kick').setRequired(false)),
    new SlashCommandBuilder().setName('warn').setDescription('Avertir un membre').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(opt => opt.setName('user').setDescription('Le membre à avertir').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Raison de l\'avertissement').setRequired(true)),
    new SlashCommandBuilder().setName('clear').setDescription('Supprimer des messages').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption(opt => opt.setName('amount').setDescription('Nombre de messages à supprimer (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).addUserOption(opt => opt.setName('user').setDescription('Supprimer uniquement les messages de ce membre').setRequired(false)),
    new SlashCommandBuilder().setName('transfert').setDescription('Transférer un ticket vers une autre catégorie').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addChannelOption(opt => opt.setName('categorie').setDescription('Catégorie de destination').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder().setName('warnings').setDescription('Voir les avertissements d\'un membre').addUserOption(opt => opt.setName('user').setDescription('Le membre à vérifier').setRequired(true)),

    new SlashCommandBuilder().setName('rank').setDescription('Affiche votre niveau ou celui d\'un membre').addUserOption(opt => opt.setName('user').setDescription('Le membre à vérifier').setRequired(false)),
    new SlashCommandBuilder().setName('leaderboard').setDescription('Affiche le classement des niveaux').addIntegerOption(opt => opt.setName('page').setDescription('Numéro de page').setRequired(false).setMinValue(1)),
    new SlashCommandBuilder().setName('resetrank').setDescription('Réinitialise le niveau d\'un membre (Admin)').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).addUserOption(opt => opt.setName('user').setDescription('Le membre à réinitialiser').setRequired(true)),

    new SlashCommandBuilder().setName('status').setDescription('Affiche le statut des services'),
    new SlashCommandBuilder().setName('refresh-status').setDescription('Force la mise à jour du statut dans le salon dédié').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder().setName('botstatus').setDescription('Affiche le statut actuel du bot et les informations'),

    new SlashCommandBuilder().setName('help').setDescription('Affiche l\'aide générale du bot'),
    new SlashCommandBuilder().setName('reglement').setDescription('Affiche le règlement officiel du serveur'),
    new SlashCommandBuilder().setName('site').setDescription('Affiche le lien vers notre site web'),
    new SlashCommandBuilder().setName('ping').setDescription('Affiche la latence du bot'),
    new SlashCommandBuilder().setName('8ball').setDescription('Pose une question à la boule magique').addStringOption(opt => opt.setName('question').setDescription('Votre question').setRequired(true)),
    new SlashCommandBuilder().setName('roll').setDescription('Lance un dé').addIntegerOption(opt => opt.setName('faces').setDescription('Nombre de faces du dé').setRequired(false).setMinValue(2).setMaxValue(100)),
    new SlashCommandBuilder().setName('flip').setDescription('Pile ou face'),
    new SlashCommandBuilder().setName('say').setDescription('Le bot répète votre message').addStringOption(opt => opt.setName('message').setDescription('Message à répéter').setRequired(true)),
    new SlashCommandBuilder().setName('avatar').setDescription('Affiche l\'avatar d\'un membre').addUserOption(opt => opt.setName('user').setDescription('Le membre').setRequired(false)),
    new SlashCommandBuilder().setName('cat').setDescription('Affiche une image de chat aléatoire'),
    new SlashCommandBuilder().setName('dog').setDescription('Affiche une image de chien aléatoire'),

    new SlashCommandBuilder().setName('joke').setDescription('Raconte une blague aléatoire'),
    new SlashCommandBuilder().setName('rps').setDescription('Joue à Pierre-Feuille-Ciseaux contre le bot').addStringOption(opt => opt.setName('choix').setDescription('Ton choix').setRequired(true).addChoices({ name: '🪨 Pierre', value: 'pierre' },{ name: '📄 Feuille', value: 'feuille' },{ name: '✂️ Ciseaux', value: 'ciseaux' })),
    new SlashCommandBuilder().setName('meme').setDescription('Affiche un meme aléatoire'),
    new SlashCommandBuilder().setName('hug').setDescription('Fais un câlin à un membre').addUserOption(opt => opt.setName('user').setDescription('Le membre à câliner').setRequired(true)),
    new SlashCommandBuilder().setName('ship').setDescription('Calcule l\'affinité amoureuse entre deux membres').addUserOption(opt => opt.setName('user1').setDescription('Premier membre').setRequired(true)).addUserOption(opt => opt.setName('user2').setDescription('Deuxième membre').setRequired(false)),

    new SlashCommandBuilder().setName('getroles').setDescription('Envoie un panneau pour obtenir des rôles spécifiques'),

    // COMMANDE : panel
    new SlashCommandBuilder().setName('panel').setDescription('Affiche le lien vers le panel de gestion').setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
];

// --- ENREGISTREMENT DES SLASH COMMANDS ---
client.once('ready', async () => {
    console.log(`✅ Bot connecté en tant que ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(config.token);
    try {
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: slashCommands.map(cmd => cmd.toJSON()) }
        );
        console.log('✅ Slash commands enregistrées !');
    } catch (error) {
        console.error('Erreur enregistrement slash commands:', error);
    }

    startStatusInterval();
    startBotStatusRotation();
    startVoiceXPSystem();
    
    // ===== DÉMARRAGE DU PANEL WEB =====
    startWebServer();
    
    console.log('🚀 Tous les systèmes sont démarrés !');
});

// --- GESTION DES SLASH COMMANDS ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.commandName;

    try {
        // ============ COMMANDES PUBLIQUES ============
        if (command === 'help') {
            const embed = new EmbedBuilder()
                .setTitle("📖 Aide - Commandes Disponibles")
                .setDescription("Bienvenue ! Voici les commandes que vous pouvez utiliser.")
                .setColor(0x3498db)
                .addFields(
                    { name: "🎫 Support & Tickets", value: "Cliquez sur le bouton **Ouvrir un ticket** dans le panneau de support.", inline: false },
                    { name: "📊 Niveaux", value: "`/rank` `/leaderboard`", inline: true },
                    { name: "ℹ️ Informations", value: "`/help` `/site` `/ping` `/avatar` `/status` `/botstatus` `/reglement`", inline: true },
                    { name: "🎮 Fun", value: "`/8ball` `/roll` `/flip` `/cat` `/dog` `/joke` `/rps` `/meme` `/hug` `/ship`", inline: true },
                    { name: "💬 Communication", value: "`/say` `/warnings`", inline: true }
                )
                .setFooter({ text: `${interaction.guild.name} - Support` })
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (command === 'rank') {
            const user = interaction.options.getUser('user') || interaction.user;
            const member = interaction.guild.members.cache.get(user.id);
            if (user.bot) return interaction.reply({ content: '❌ Les bots n\'ont pas de niveau.', ephemeral: true });
            
            const userData = LevelDB.getUser(user.id, interaction.guild.id);
            const maxLevel = Database.get('maxLevel') || 5000;
            const xpNeeded = LevelDB.xpForNextLevel(userData.level);
            const xpCurrentLevel = LevelDB.xpForLevel(userData.level);
            const progress = userData.level >= maxLevel ? 100 : Math.floor(((userData.xp - xpCurrentLevel) / (xpNeeded - xpCurrentLevel)) * 100);
            const rank = LevelDB.getRank(user.id, interaction.guild.id);
            
            const progressBarLength = 20;
            const filledLength = Math.floor((progress / 100) * progressBarLength);
            const progressBar = '█'.repeat(filledLength) + '░'.repeat(progressBarLength - filledLength);
            
            const hours = Math.floor(userData.voiceTime / 3600);
            const minutes = Math.floor((userData.voiceTime % 3600) / 60);
            const voiceTimeStr = hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
            
            const embed = new EmbedBuilder()
                .setTitle(`📊 Carte de Niveau - ${user.tag}`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setColor(member?.displayColor || 0x3498db)
                .addFields(
                    { name: "🏆 Niveau", value: `**${userData.level}** / ${maxLevel}`, inline: true },
                    { name: "🥇 Rang", value: `**#${rank}**`, inline: true },
                    { name: "⭐ XP Total", value: `${userData.xp.toLocaleString()}`, inline: true },
                    { name: "📈 Progression", value: userData.level >= maxLevel ? "```\nNIVEAU MAX ATTEINT !\n```" : `\`${progressBar}\` **${progress}%**\n${userData.xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`, inline: false },
                    { name: "💬 Stats Messages", value: `**${userData.totalMessages.toLocaleString()}** messages\n+${userData.messageXP.toLocaleString()} XP`, inline: true },
                    { name: "🎤 Stats Vocal", value: `**${voiceTimeStr}**\n+${userData.voiceXP.toLocaleString()} XP`, inline: true }
                )
                .setFooter({ text: `${interaction.guild.name}` })
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'leaderboard') {
            const page = interaction.options.getInteger('page') || 1;
            const perPage = 10;
            const offset = (page - 1) * perPage;
            const leaderboard = LevelDB.getLeaderboard(interaction.guild.id, 100);
            const totalPages = Math.ceil(leaderboard.length / perPage);
            const pageData = leaderboard.slice(offset, offset + perPage);
            
            if (pageData.length === 0) return interaction.reply({ content: '❌ Aucune donnée de niveau trouvée.', ephemeral: true });
            
            let description = '';
            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const member = interaction.guild.members.cache.get(user.userId);
                const rank = offset + i + 1;
                let medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `**#${rank}**`;
                const displayName = member ? member.displayName : `Utilisateur inconnu`;
                description += `${medal} **${displayName}**\n└ Niveau **${user.level}** • ${user.xp.toLocaleString()} XP • ${user.totalMessages.toLocaleString()} msgs\n\n`;
            }
            
            const embed = new EmbedBuilder().setTitle("🏆 Classement des Niveaux").setDescription(description).setColor(0xf1c40f).setFooter({ text: `Page ${page}/${totalPages} • ${leaderboard.length} membres` }).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'resetrank') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            const user = interaction.options.getUser('user');
            const data = LevelDB.load();
            const key = `${interaction.guild.id}-${user.id}`;
            if (data[key]) {
                delete data[key];
                LevelDB.save(data);
                const embed = new EmbedBuilder().setTitle("🔄 Niveau Réinitialisé").setDescription(`Le niveau de **${user.tag}** a été réinitialisé.`).setColor(0xe74c3c).setTimestamp();
                sendLog(interaction.guild, embed);
                return interaction.reply({ embeds: [embed] });
            } else {
                return interaction.reply({ content: `❌ **${user.tag}** n'a pas de données de niveau.`, ephemeral: true });
            }
        }

        if (command === 'botstatus') {
            const uptime = process.uptime();
            const days = Math.floor(uptime / 86400);
            const hours = Math.floor((uptime % 86400) / 3600);
            const minutes = Math.floor((uptime % 3600) / 60);
            const seconds = Math.floor(uptime % 60);
            const currentStatus = botStatuses[currentStatusIndex];
            const currentText = typeof currentStatus.text === 'function' ? currentStatus.text() : currentStatus.text;
            
            const embed = new EmbedBuilder().setTitle("🤖 Statut du Bot").setDescription(`Informations sur le bot **${client.user.tag}**`).setColor(0x3498db).setThumbnail(client.user.displayAvatarURL()).addFields(
                { name: "📊 Statut actuel", value: `**${currentStatus.type}** ${currentText}`, inline: false },
                { name: "🔄 Prochain changement", value: "Toutes les **15 minutes**", inline: true },
                { name: "📡 Latence", value: `${client.ws.ping}ms`, inline: true },
                { name: "🌐 Site Web", value: "[heberge.orinstone.deepstone.fr](https://heberge.orinstone.deepstone.fr)", inline: true },
                { name: "🖥️ Serveurs", value: `${client.guilds.cache.size}`, inline: true },
                { name: "👥 Membres", value: `${client.users.cache.size}`, inline: true },
                { name: "⏱️ Uptime", value: `${days}j ${hours}h ${minutes}m ${seconds}s`, inline: true },
                { name: "📋 Statuts en rotation", value: botStatuses.map((s, i) => `${i === currentStatusIndex ? '➡️' : '•'} ${s.type} ${typeof s.text === 'function' ? s.text() : s.text}`).join('\n'), inline: false }
            ).setFooter({ text: `ID: ${client.user.id}` }).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'site') {
            const embed = new EmbedBuilder().setTitle("🌐 Notre Site Web").setDescription("Découvrez notre site officiel !").setURL("https://heberge.orinstone.deepstone.fr").setColor(0x9b59b6).addFields({ name: "🔗 Lien", value: "[Cliquez ici pour accéder au site](https://heberge.orinstone.deepstone.fr)", inline: false }).setFooter({ text: `${interaction.guild.name}` }).setTimestamp();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Visiter le site').setURL('https://heberge.orinstone.deepstone.fr').setStyle(ButtonStyle.Link));
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (command === 'ping') {
            const start = Date.now();
            await interaction.deferReply({ ephemeral: true });
            const ping = Date.now() - start;
            const embed = new EmbedBuilder().setTitle("🏓 Pong!").setColor(0x2ecc71).addFields({ name: "📡 Latence API", value: `${ping}ms`, inline: true }, { name: "💓 WebSocket", value: `${client.ws.ping}ms`, inline: true }).setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        if (command === 'status') {
            if (!Database.isFeatureEnabled('statusServices')) return interaction.reply({ content: '❌ Le système de statut est actuellement désactivé.', ephemeral: true });
            await interaction.deferReply();
            const statuses = await getAllStatus();
            const embed = createStatusEmbed(statuses);
            return interaction.editReply({ embeds: [embed], components: [createStatusButtons()] });
        }

        if (command === 'refresh-status') {
            await interaction.deferReply({ ephemeral: true });
            const statusChannelId = Database.get('statusChannel');
            if (!statusChannelId) return interaction.editReply('❌ Aucun salon de statut configuré (`/setstatus`).');
            const channel = interaction.guild.channels.cache.get(statusChannelId);
            if (!channel) return interaction.editReply('❌ Salon de statut introuvable.');
            try { await updateStatusMessage(channel); return interaction.editReply(`✅ Statut mis à jour dans ${channel} !`); }
            catch (error) { console.error('Erreur refresh-status:', error); return interaction.editReply('❌ Erreur lors de la mise à jour.'); }
        }

        if (command === '8ball') {
            const question = interaction.options.getString('question');
            const responses = ["🎱 C'est certain.","🎱 Sans aucun doute.","🎱 Oui, définitivement.","🎱 Tu peux compter dessus.","🎱 Très probable.","🎱 Oui.","🎱 Les signes disent oui.","🎱 Réponse floue, réessaye.","🎱 Redemande plus tard.","🎱 Mieux vaut ne pas te le dire maintenant.","🎱 Impossible de prédire maintenant.","🎱 Concentre-toi et redemande.","🎱 N'y compte pas.","🎱 Ma réponse est non.","🎱 Mes sources disent non.","🎱 Très douteux."];
            const response = responses[Math.floor(Math.random() * responses.length)];
            const embed = new EmbedBuilder().setTitle("🎱 Boule Magique").setColor(0x8e44ad).addFields({ name: "❓ Question", value: question, inline: false }, { name: "🔮 Réponse", value: response, inline: false }).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'roll') {
            const faces = interaction.options.getInteger('faces') || 6;
            const result = Math.floor(Math.random() * faces) + 1;
            const embed = new EmbedBuilder().setTitle("🎲 Lancer de dé").setDescription(`Tu as lancé un dé à **${faces}** faces !`).setColor(0xe67e22).addFields({ name: "🎯 Résultat", value: `**${result}**`, inline: true }).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'flip') {
            const result = Math.random() < 0.5 ? "👑 **Pile** !" : "🦅 **Face** !";
            const embed = new EmbedBuilder().setTitle("🪙 Pile ou Face").setDescription(result).setColor(0xf1c40f).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'say') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            const message = interaction.options.getString('message');
            await interaction.deferReply({ ephemeral: true });
            await interaction.channel.send(message);
            return interaction.editReply('✅ Message envoyé !');
        }

        if (command === 'avatar') {
            const user = interaction.options.getUser('user') || interaction.user;
            const member = interaction.guild.members.cache.get(user.id);
            const embed = new EmbedBuilder().setTitle(`🖼️ Avatar de ${user.tag}`).setImage(user.displayAvatarURL({ size: 1024, dynamic: true })).setColor(member?.displayColor || 0x3498db).setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'cat') {
            await interaction.deferReply();
            try { const res = await fetch('https://api.thecatapi.com/v1/images/search'); const data = await res.json(); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🐱 Voici un chat !").setImage(data[0].url).setColor(0xe67e22).setTimestamp()] }); }
            catch (e) { return interaction.editReply('❌ Impossible de récupérer une image de chat.'); }
        }

        if (command === 'dog') {
            await interaction.deferReply();
            try { const res = await fetch('https://dog.ceo/api/breeds/image/random'); const data = await res.json(); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🐶 Voici un chien !").setImage(data.message).setColor(0x3498db).setTimestamp()] }); }
            catch (e) { return interaction.editReply('❌ Impossible de récupérer une image de chien.'); }
        }

        if (command === 'joke') {
            const jokes = ["Pourquoi les plongeurs plongent-ils toujours en arrière et jamais en avant ?\n*Parce que sinon ils tomberaient dans le bateau.* 🤣","Que fait une fraise sur un cheval ?\n*Tagada tagada !* 🍓🐎","C'est l'histoire d'un pingouin qui respire par les fesses.\nUn jour il s'assoit et il meurt. 🐧💀","Quel est le comble pour un électricien ?\n*De ne pas être au courant !* ⚡","Comment appelle-t-on un chien qui n'a pas de pattes ?\n*On ne l'appelle pas, on va le chercher.* 🐶","Que dit une imprimante dans l'eau ?\n*J'ai papier !* (J'ai pas pied) 🖨️💦","Pourquoi est-ce que les fantômes mentent si mal ?\n*Parce qu'on peut voir à travers eux !* 👻","Un mec rentre dans un café... et plouf ! ☕💦"];
            const joke = jokes[Math.floor(Math.random() * jokes.length)];
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle("😂 Blague du jour").setDescription(joke).setColor(0xf1c40f).setFooter({ text: "Demandé par " + interaction.user.tag }).setTimestamp()] });
        }

        if (command === 'rps') {
            const userChoice = interaction.options.getString('choix');
            const choices = ['pierre', 'feuille', 'ciseaux'];
            const emojis = { pierre: '🪨', feuille: '📄', ciseaux: '✂️' };
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            let result = '';
            let color = 0x3498db;
            if (userChoice === botChoice) { result = "🤝 **Égalité !**"; color = 0xf1c40f; }
            else if ((userChoice === 'pierre' && botChoice === 'ciseaux') || (userChoice === 'feuille' && botChoice === 'pierre') || (userChoice === 'ciseaux' && botChoice === 'feuille')) { result = "🎉 **Tu as gagné !**"; color = 0x2ecc71; }
            else { result = "💀 **Tu as perdu !**"; color = 0xe74c3c; }
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle("✊ Pierre - Feuille - Ciseaux ✋").setDescription(`**Ton choix :** ${emojis[userChoice]} ${userChoice}\n**Choix du bot :** ${emojis[botChoice]} ${botChoice}\n\n**Résultat :** ${result}`).setColor(color).setTimestamp()] });
        }

        if (command === 'meme') {
            await interaction.deferReply();
            try { const res = await fetch('https://meme-api.com/gimme'); const data = await res.json(); if (data.nsfw) return interaction.editReply('❌ Le meme récupéré est NSFW, veuillez réessayer.'); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle(`😂 ${data.title}`).setImage(data.url).setColor(0xe67e22).setFooter({ text: `👍 ${data.ups} | Subreddit: r/${data.subreddit}` }).setTimestamp()] }); }
            catch (e) { return interaction.editReply('❌ Impossible de récupérer un meme pour le moment.'); }
        }

        if (command === 'hug') {
            const target = interaction.options.getUser('user');
            if (target.id === interaction.user.id) return interaction.reply({ content: "🫂 Tu te fais un câlin à toi-même... C'est un peu triste, non ? 😅", ephemeral: true });
            await interaction.deferReply();
            try { const res = await fetch('https://api.waifu.pics/sfw/hug'); const data = await res.json(); return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🫕 Câlin !").setDescription(`**${interaction.user.username}** fait un gros câlin à **${target.username}** ! 💖`).setImage(data.url).setColor(0xff69b4).setTimestamp()], content: `${target}` }); }
            catch (e) { return interaction.editReply('❌ Impossible de récupérer un gif de câlin.'); }
        }
        
        if (command === 'ship') {
            const user1 = interaction.options.getUser('user1');
            const user2 = interaction.options.getUser('user2') || interaction.user;
            if (user1.id === user2.id) return interaction.reply({ content: "😅 Tu ne peux pas te ship avec toi-même !", ephemeral: true });
            const percentage = Math.floor(Math.random() * 101);
            let emoji = '💔'; let text = "Pas fait pour s'entendre...";
            if (percentage >= 80) { emoji = '💖'; text = "Âmes sœurs ! C'est le grand amour !"; }
            else if (percentage >= 60) { emoji = '💕'; text = "Très bonne compatibilité !"; }
            else if (percentage >= 40) { emoji = '💞'; text = "Ça peut coller avec quelques efforts."; }
            else if (percentage >= 20) { emoji = '💔'; text = "C'est pas gagné..."; }
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle("💘 Test de Compatibilité").setDescription(`**${user1.username}** & **${user2.username}**\n\n${emoji} **${percentage}%** d'affinité !\n*${text}*`).setColor(0xff69b4).setTimestamp()] });
        }

        // ============ COMMANDE : PANEL ============
        if (command === 'panel') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Vous devez être administrateur.', ephemeral: true });
            }
            
            const panelURL = `http://node.orinstone.deepstone.fr:${WEB_PORT}`;
            const embed = new EmbedBuilder()
                .setTitle("🎛️ Panel de Gestion")
                .setDescription(`Accédez au panel web pour contrôler les fonctionnalités du bot.\n\n🔗 **[Cliquez ici pour ouvrir le panel](${panelURL})**\n\n*Note: En HTTP pour le moment. Nginx configurera le HTTPS.*`)
                .setColor(0x9b59b6)
                .setFooter({ text: `${interaction.guild.name}` })
                .setTimestamp();
                
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Ouvrir le Panel')
                    .setURL(panelURL)
                    .setStyle(ButtonStyle.Link)
            );
            
            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        // ============ COMMANDES MODÉRATION ============
        if (command === 'ban') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison';
            const days = interaction.options.getInteger('days') || 0;
            const member = interaction.guild.members.cache.get(user.id);
            if (member && !member.bannable) return interaction.reply({ content: '❌ Impossible de bannir ce membre.', ephemeral: true });
            try {
                await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: days * 86400 });
                const embed = new EmbedBuilder().setTitle("🔨 Membre Banni").setColor(0xe74c3c).addFields({ name: "👤 Utilisateur", value: `${user.tag} (${user.id})`, inline: true }, { name: "🛡️ Modérateur", value: `${interaction.user.tag}`, inline: true }, { name: "📝 Raison", value: reason, inline: false }, { name: "📅 Jours supprimés", value: `${days} jour(s)`, inline: true }).setTimestamp();
                sendLog(interaction.guild, embed);
                return interaction.reply({ embeds: [embed] });
            } catch (e) { return interaction.reply({ content: '❌ Erreur lors du bannissement.', ephemeral: true }); }
        }

        if (command === 'kick') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison';
            const member = interaction.guild.members.cache.get(user.id);
            if (!member) return interaction.reply({ content: '❌ Ce membre n\'est pas sur le serveur.', ephemeral: true });
            if (!member.kickable) return interaction.reply({ content: '❌ Impossible d\'expulser ce membre.', ephemeral: true });
            try {
                await member.kick(reason);
                const embed = new EmbedBuilder().setTitle("👢 Membre Expulsé").setColor(0xe67e22).addFields({ name: "👤 Utilisateur", value: `${user.tag} (${user.id})`, inline: true }, { name: "🛡️ Modérateur", value: `${interaction.user.tag}`, inline: true }, { name: "📝 Raison", value: reason, inline: false }).setTimestamp();
                sendLog(interaction.guild, embed);
                return interaction.reply({ embeds: [embed] });
            } catch (e) { return interaction.reply({ content: '❌ Erreur lors de l\'expulsion.', ephemeral: true }); }
        }

        if (command === 'warn') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            if (user.bot) return interaction.reply({ content: '❌ Impossible d\'avertir un bot.', ephemeral: true });
            const count = WarnDB.add(user.id, interaction.guild.id, reason, interaction.user.tag);
            const embed = new EmbedBuilder().setTitle("⚠️ Avertissement Ajouté").setColor(0xf1c40f).addFields({ name: "👤 Utilisateur", value: `${user.tag}`, inline: true }, { name: "🛡️ Modérateur", value: `${interaction.user.tag}`, inline: true }, { name: "📊 Total warnings", value: `${count}`, inline: true }, { name: "📝 Raison", value: reason, inline: false }).setTimestamp();
            try {
                const dmEmbed = new EmbedBuilder().setTitle("⚠️ Vous avez reçu un avertissement").setDescription(`Sur le serveur **${interaction.guild.name}**`).setColor(0xf1c40f).addFields({ name: "📝 Raison", value: reason, inline: false }, { name: "📊 Total", value: `${count} avertissement(s)`, inline: true }).setTimestamp();
                await user.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch (e) {}
            sendLog(interaction.guild, embed);
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'warnings') {
            const user = interaction.options.getUser('user');
            const warns = WarnDB.get(user.id, interaction.guild.id);
            if (warns.length === 0) return interaction.reply({ content: `✅ **${user.tag}** n'a aucun avertissement.`, ephemeral: true });
            const fields = warns.slice(0, 25).map((w, i) => ({ name: `#${i + 1} - ${new Date(w.date).toLocaleDateString('fr-FR')}`, value: `**Raison:** ${w.reason}\n**Par:** ${w.moderator}`, inline: false }));
            return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`📋 Avertissements de ${user.tag}`).setDescription(`Total: **${warns.length}** avertissement(s)`).setColor(0xf1c40f).addFields(fields).setTimestamp()], ephemeral: true });
        }

        if (command === 'clear') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            const amount = interaction.options.getInteger('amount');
            const targetUser = interaction.options.getUser('user');
            await interaction.deferReply({ ephemeral: true });
            try {
                const messages = await interaction.channel.messages.fetch({ limit: amount });
                let toDelete = messages;
                if (targetUser) toDelete = messages.filter(m => m.author.id === targetUser.id);
                const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
                const count = deleted ? deleted.size : 0;
                sendLog(interaction.guild, new EmbedBuilder().setTitle("🗑️ Messages Supprimés").setColor(0x3498db).setDescription(`**${count}** message(s) supprimé(s).`).setTimestamp());
                return interaction.editReply({ embeds: [new EmbedBuilder().setTitle("🗑️ Messages Supprimés").setColor(0x3498db).setDescription(`**${count}** message(s) supprimé(s).`).setTimestamp()] });
            } catch (e) { return interaction.editReply('❌ Erreur lors de la suppression.'); }
        }

        if (command === 'transfert') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            const category = interaction.options.getChannel('categorie');
            const channel = interaction.channel;
            if (channel.type !== ChannelType.GuildText) return interaction.reply({ content: '❌ Cette commande ne peut être utilisée que dans un salon textuel.', ephemeral: true });
            try {
                await channel.setParent(category.id);
                sendLog(interaction.guild, new EmbedBuilder().setTitle("📂 Ticket Transféré").setDescription(`Ce salon a été déplacé vers la catégorie **${category.name}**.`).setColor(0x3498db).setTimestamp());
                return interaction.reply({ embeds: [new EmbedBuilder().setTitle("📂 Ticket Transféré").setDescription(`Ce salon a été déplacé vers la catégorie **${category.name}**.`).setColor(0x3498db).setTimestamp()] });
            } catch (e) { return interaction.reply({ content: '❌ Erreur lors du transfert.', ephemeral: true }); }
        }

        // ============ COMMANDES ADMIN (Setup) ============
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        }

        if (command === 'setchannel') { const c = interaction.options.getChannel('categorie'); if (c.type !== ChannelType.GuildCategory) return interaction.reply({ content: "⚠️ Veuillez sélectionner une **catégorie** valide.", ephemeral: true }); Database.set('ticketCategory', c.id); return interaction.reply(`✅ Catégorie des tickets définie sur : **${c.name}**`); }
        if (command === 'settranscript') { const c = interaction.options.getChannel('salon'); Database.set('transcriptChannel', c.id); return interaction.reply(`✅ Salon des transcripts défini sur : ${c}`); }
        if (command === 'setstaff') { const r = interaction.options.getRole('role'); Database.set('staffRole', r.id); return interaction.reply(`✅ Rôle Staff défini sur : **${r.name}**`); }
        if (command === 'setwelcome') { const c = interaction.options.getChannel('salon'); Database.set('welcomeChannel', c.id); return interaction.reply(`✅ Salon de bienvenue/départ défini sur : ${c}`); }
        if (command === 'setlogs') { const c = interaction.options.getChannel('salon'); Database.set('logsChannel', c.id); return interaction.reply(`✅ Salon des logs défini sur : ${c}`); }
        if (command === 'setstatus') { const c = interaction.options.getChannel('salon'); if (c.type !== ChannelType.GuildText) return interaction.reply({ content: "⚠️ Veuillez sélectionner un salon textuel valide.", ephemeral: true }); Database.set('statusChannel', c.id); Database.set('statusMessageId', null); try { await updateStatusMessage(c); return interaction.reply(`✅ Salon de statut défini sur : ${c}\n📊 Premier statut envoyé !`); } catch (e) { return interaction.reply(`✅ Salon de statut défini sur : ${c}`); } }
        if (command === 'setlevelup') { const c = interaction.options.getChannel('salon'); if (c.type !== ChannelType.GuildText) return interaction.reply({ content: "⚠️ Veuillez sélectionner un salon textuel valide.", ephemeral: true }); Database.set('levelupChannel', c.id); return interaction.reply(`✅ Salon de level up défini sur : ${c}`); }
        if (command === 'setxp') { const m = interaction.options.getInteger('message'); const v = interaction.options.getInteger('voice'); const c = interaction.options.getInteger('cooldown'); let changes = []; if (m) { Database.set('xpMessage', m); changes.push(`XP message: **${m}**`); } if (v) { Database.set('xpVoice', v); changes.push(`XP vocal: **${v}**/min`); } if (c) { Database.set('xpMessageCooldown', c); changes.push(`Cooldown: **${c}s**`); } if (changes.length === 0) return interaction.reply({ content: '⚠️ Aucune valeur spécifiée.', ephemeral: true }); return interaction.reply({ embeds: [new EmbedBuilder().setTitle("⚙️ Configuration XP Modifiée").setDescription(changes.join('\n')).setColor(0x3498db).addFields({ name: "📊 Configuration actuelle", value: `XP message: **${Database.get('xpMessage') || 15}**\nXP vocal: **${Database.get('xpVoice') || 10}**/min\nCooldown: **${Database.get('xpMessageCooldown') || 60}s**\nNiveau max: **${Database.get('maxLevel') || 5000}**`, inline: false }).setTimestamp()] }); }
        if (command === 'addlevelrole') { const l = interaction.options.getInteger('niveau'); const r = interaction.options.getRole('role'); const lr = Database.get('levelRoles') || {}; lr[l] = r.id; Database.set('levelRoles', lr); return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🏆 Rôle de Niveau Ajouté").setDescription(`Le rôle ${r} sera donné au niveau **${l}**.`).setColor(0x2ecc71).setTimestamp()] }); }
        if (command === 'removelevelrole') { const l = interaction.options.getInteger('niveau'); const lr = Database.get('levelRoles') || {}; if (!lr[l]) return interaction.reply({ content: `❌ Aucun rôle configuré pour le niveau ${l}.`, ephemeral: true }); delete lr[l]; Database.set('levelRoles', lr); return interaction.reply(`✅ Rôle de récompense pour le niveau **${l}** supprimé.`); }
        if (command === 'setautorole') { const r = interaction.options.getRole('role'); const bm = interaction.guild.members.me; if (r.position >= bm.roles.highest.position) return interaction.reply({ content: `❌ Je ne peux pas attribuer le rôle **${r.name}** car il est plus haut ou égal à mon rôle le plus haut dans la hiérarchie.`, ephemeral: true }); if (!r.editable) return interaction.reply({ content: `❌ Je n'ai pas la permission de modifier/attribuer le rôle **${r.name}**.`, ephemeral: true }); Database.set('autoRole', r.id); sendLog(interaction.guild, new EmbedBuilder().setTitle("🎭 Auto-Rôle Configuré").setDescription(`Les nouveaux membres recevront automatiquement le rôle **${r}**.`).setColor(0x2ecc71).setTimestamp()); return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🎭 Auto-Rôle Configuré").setDescription(`Les nouveaux membres recevront automatiquement le rôle **${r}** en rejoignant le serveur.`).setColor(0x2ecc71).addFields({ name: "📋 Rôle", value: `${r} (\`${r.id}\`)`, inline: true }, { name: "👥 Position", value: `${r.position}`, inline: true }, { name: "🎨 Couleur", value: `${r.hexColor}`, inline: true }).setTimestamp()] }); }
        if (command === 'setup') { const e = new EmbedBuilder().setTitle("🎫 Support - Ouverture de Ticket").setDescription("**Comment pouvons-nous vous aider ?**\n\n📩 **Support général** : Cliquez sur `Ouvrir un ticket`.\n🐛 **Bug & Report** : Cliquez sur `Signaler un bug`.").setColor(0x3498db).setFooter({ text: `${interaction.guild.name} - Support` }).setTimestamp(); const r = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('create_ticket').setLabel('Ouvrir un ticket').setEmoji('📩').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('create_bug_ticket').setLabel('Signaler un bug').setEmoji('🐛').setStyle(ButtonStyle.Danger)); await interaction.channel.send({ embeds: [e], components: [r] }); return interaction.reply({ content: '✅ Panneau de ticket envoyé !', ephemeral: true }); }
        if (command === 'help-admin') { const tc = Database.get('ticketCategory'); const tc2 = Database.get('transcriptChannel'); const sr = Database.get('staffRole'); const wc = Database.get('welcomeChannel'); const lc = Database.get('logsChannel'); const sc = Database.get('statusChannel'); const luc = Database.get('levelupChannel'); const ar = Database.get('autoRole'); const status = (id) => id ? '✅' : '❌'; let ari = 'Non configuré'; if (ar) { const r = interaction.guild.roles.cache.get(ar); ari = r ? `${r.name}` : 'Rôle introuvable'; } return interaction.reply({ embeds: [new EmbedBuilder().setTitle("🛠️ Aide - Administration").setDescription("Commandes d'administration et modération.").setColor(0x3498db).addFields({ name: "⚙️ Configuration", value: "`/setchannel` `/settranscript` `/setstaff` `/setwelcome` `/setlogs` `/setstatus` `/setlevelup` `/setxp` `/setautorole` `/setup` `/getroles` `/panel`", inline: false }, { name: "🏆 Niveaux", value: "`/addlevelrole` `/removelevelrole` `/resetrank`", inline: false }, { name: "🔨 Modération", value: "`/ban` `/kick` `/warn` `/clear` `/transfert` `/warnings`", inline: false }, { name: "📊 Statut", value: "`/status` `/refresh-status` `/botstatus`", inline: false }, { name: "ℹ️ Infos", value: "`/help` `/site` `/help-admin` `/reglement`", inline: false }, { name: "📊 État", value: `Tickets: ${status(tc)} | Transcripts: ${status(tc2)} | Staff: ${status(sr)}\nWelcome: ${status(wc)} | Logs: ${status(lc)} | Status: ${status(sc)}\nLevelUp: ${status(luc)} | Auto-Rôle: ${status(ar)}`, inline: false }, { name: "🎭 Auto-Rôle actuel", value: ari, inline: false }).setTimestamp()], ephemeral: true }); }

        if (command === 'reglement') {
            if (!reglementData) return interaction.reply({ content: '❌ Le règlement n\'est pas configuré (fichier `reglement.json` manquant).', ephemeral: true });
            const embed = createReglementEmbed();
            if (!embed) return interaction.reply({ content: '❌ Erreur lors de la génération du règlement.', ephemeral: true });
            const reply = await interaction.reply({ embeds: [embed], fetchReply: true });
            try { await reply.react('1535995172419272774'); } catch (error) { console.error('Erreur ajout réaction règlement:', error); }
        }

        // ============ COMMANDE GET ROLES ============
        if (command === 'getroles') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.reply({ content: '❌ Permissions insuffisantes (Gérer les rôles requis).', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle("🎭 Rôles Disponibles")
                .setDescription("Cliquez sur le bouton ci-dessous pour obtenir vos rôles !\n\n**Rôles inclus :**\n- <@&1521937325595037906>\n- <@&1534896300414472312>")
                .setColor(0x9b59b6)
                .setFooter({ text: `${interaction.guild.name}` })
                .setTimestamp();
                
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('claim_roles')
                    .setLabel('Obtenir les rôles')
                    .setEmoji('🎁')
                    .setStyle(ButtonStyle.Primary)
            );
            
            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ Panneau de rôles envoyé !', ephemeral: true });
        }

    } catch (error) {
        console.error(`Erreur commande ${command}:`, error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true }).catch(() => {});
        } else if (interaction.deferred) {
            await interaction.editReply('❌ Une erreur est survenue.').catch(() => {});
        }
    }
});

// --- GESTION DES BOUTONS ---
client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton()) {
        
        // ===== BOUTON OBTENTION DE RÔLES =====
        if (interaction.customId === 'claim_roles') {
            await interaction.deferReply({ ephemeral: true });
            
            const roleIds = ['1521937325595037906', '1534896300414472312'];
            let addedRoles = [];
            let alreadyHave = [];
            
            try {
                for (const roleId of roleIds) {
                    const role = interaction.guild.roles.cache.get(roleId);
                    if (!role) continue;
                    
                    if (!interaction.member.roles.cache.has(roleId)) {
                        await interaction.member.roles.add(role);
                        addedRoles.push(role.name);
                    } else {
                        alreadyHave.push(role.name);
                    }
                }
                
                let message = '';
                if (addedRoles.length > 0) {
                    message += `✅ Vous avez reçu les rôles : **${addedRoles.join(', ')}** !`;
                }
                if (alreadyHave.length > 0 && addedRoles.length === 0) {
                    message += `ℹ️ Vous possédez déjà ces rôles : **${alreadyHave.join(', ')}** !`;
                } else if (alreadyHave.length > 0) {
                    message += `\nℹ️ Vous aviez déjà : **${alreadyHave.join(', ')}**.`;
                }
                
                if (addedRoles.length === 0 && alreadyHave.length === 0) {
                    message = '❌ Les rôles configurés sont introuvables sur le serveur.';
                }
                
                return interaction.editReply(message);
            } catch (error) {
                console.error('Erreur attribution rôles:', error);
                return interaction.editReply('❌ Une erreur est survenue. Vérifiez que mon rôle est au-dessus des rôles à attribuer dans la hiérarchie.');
            }
        }

        // ===== TICKET SUPPORT CLASSIQUE (VÉRIFIE SI ACTIVÉ) =====
        if (interaction.customId === 'create_ticket') {
            if (!Database.isFeatureEnabled('tickets')) {
                return interaction.reply({ content: '❌ Le système de tickets est actuellement désactivé par les administrateurs.', ephemeral: true });
            }
            
            await interaction.deferReply({ ephemeral: true });
            try {
                const ticketCategory = Database.get('ticketCategory');
                if (!ticketCategory) return interaction.editReply("❌ Catégorie non configurée (`/setchannel`).");
                const channelName = `ticket-${interaction.user.username}`;
                const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName.toLowerCase());
                if (existingChannel) return interaction.editReply(`❌ Vous avez déjà un ticket : ${existingChannel}`);
                const staffRole = Database.get('staffRole');
                const permissionOverwrites = [{ id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }];
                if (staffRole) permissionOverwrites.push({ id: staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] });
                const ticketChannel = await interaction.guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: ticketCategory, permissionOverwrites: permissionOverwrites });
                const embed = new EmbedBuilder().setTitle(`Ticket de ${interaction.user.tag}`).setDescription("Expliquez votre problème en détail.").setColor(0x2ecc71);
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
                await ticketChannel.send({ content: `${interaction.user} ${staffRole ? `<@&${staffRole}>` : ''}`, embeds: [embed], components: [row] });
                return interaction.editReply(`✅ Ticket créé : ${ticketChannel}`);
            } catch (error) { console.error('Erreur création ticket:', error); return interaction.editReply('❌ Erreur lors de la création.').catch(() => {}); }
        }

        if (interaction.customId === 'create_bug_ticket') {
            if (!Database.isFeatureEnabled('tickets')) {
                return interaction.reply({ content: '❌ Le système de tickets est actuellement désactivé par les administrateurs.', ephemeral: true });
            }
            
            await interaction.deferReply({ ephemeral: true });
            try {
                const ticketCategory = Database.get('ticketCategory');
                if (!ticketCategory) return interaction.editReply("❌ Catégorie non configurée (`/setchannel`).");
                const channelName = `bug-${interaction.user.username}`;
                const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName.toLowerCase() && c.name.startsWith('bug-'));
                if (existingChannel) return interaction.editReply(`❌ Vous avez déjà un signalement en cours : ${existingChannel}`);
                const staffRole = Database.get('staffRole');
                const permissionOverwrites = [{ id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }];
                if (staffRole) permissionOverwrites.push({ id: staffRole, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] });
                const ticketChannel = await interaction.guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: ticketCategory, permissionOverwrites: permissionOverwrites });
                const embed = new EmbedBuilder().setTitle(`🐛 Signalement de Bug - ${interaction.user.tag}`).setDescription("Merci d'avoir signalé un problème ! 🙏\n\n**Pour nous aider à résoudre le bug, veuillez nous fournir :**\n• 📝 Une description détaillée du bug\n• 🔄 Les étapes pour le reproduire\n• 📸 Des captures d'écran si possible\n• 💻 Votre environnement (OS, navigateur, version du site, etc.)\n• 🕐 L'heure approximative où le bug s'est produit").setColor(0xe74c3c).setTimestamp();
                const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer le ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
                await ticketChannel.send({ content: `${interaction.user} ${staffRole ? `<@&${staffRole}>` : ''} 🐛 **Nouveau signalement de bug !**`, embeds: [embed], components: [row] });
                return interaction.editReply(`✅ Signalement créé : ${ticketChannel}`);
            } catch (error) { console.error('Erreur création bug report:', error); return interaction.editReply('❌ Erreur lors de la création.').catch(() => {}); }
        }

        if (interaction.customId === 'close_ticket') {
            await interaction.deferReply({ ephemeral: true });
            try {
                await interaction.editReply("🔒 Fermeture du ticket...");
                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const transcriptText = messages.reverse().map(m => `[${m.createdAt.toLocaleString('fr-FR')}] ${m.author?.tag || 'Inconnu'}: ${m.cleanContent || '[inaccessible]'}`).join('\n');
                const buffer = Buffer.from(transcriptText, 'utf-8');
                const transcriptChannel = Database.get('transcriptChannel');
                if (transcriptChannel) {
                    const transChan = interaction.guild.channels.cache.get(transcriptChannel);
                    if (transChan) {
                        const transcriptEmbed = new EmbedBuilder().setTitle("📜 Transcript de Ticket").addFields({ name: "Salon", value: interaction.channel.name, inline: true }, { name: "Fermé par", value: interaction.user.tag, inline: true }).setColor(0xe74c3c).setTimestamp();
                        await transChan.send({ embeds: [transcriptEmbed], files: [{ attachment: buffer, name: `transcript-${interaction.channel.name}.txt` }] });
                    }
                }
                await interaction.editReply('✅ Ticket fermé !');
                setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            } catch (error) { console.error('Erreur fermeture ticket:', error); await interaction.editReply('❌ Erreur lors de la fermeture.').catch(() => {}); }
        }

        if (interaction.customId === 'refresh_status') {
            await interaction.deferReply({ ephemeral: true });
            try { const statuses = await getAllStatus(); const embed = createStatusEmbed(statuses); await interaction.message.edit({ embeds: [embed], components: [createStatusButtons()] }); return interaction.editReply('✅ Statut rafraîchi !'); }
            catch (error) { console.error('Erreur refresh bouton:', error); return interaction.editReply('❌ Erreur lors du rafraîchissement.'); }
        }
    }
});

async function updateStatusMessage(channel) {
    const statuses = await getAllStatus();
    const embed = createStatusEmbed(statuses);
    const buttons = createStatusButtons();
    const savedMessageId = Database.get('statusMessageId');
    if (savedMessageId) {
        try { const message = await channel.messages.fetch(savedMessageId); if (message && message.author.id === client.user.id) { await message.edit({ embeds: [embed], components: [buttons] }); return; } }
        catch (e) { Database.set('statusMessageId', null); }
    }
    const newMessage = await channel.send({ embeds: [embed], components: [buttons] });
    Database.set('statusMessageId', newMessage.id);
}

function startStatusInterval() {
    setInterval(async () => {
        if (!client.isReady()) return;
        if (!Database.isFeatureEnabled('statusServices')) return;
        const statusChannelId = Database.get('statusChannel');
        if (!statusChannelId) return;
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) return;
        const channel = guild.channels.cache.get(statusChannelId);
        if (!channel) return;
        try { await updateStatusMessage(channel); }
        catch (error) { console.error('Erreur mise à jour statut:', error); }
    }, 5 * 60 * 1000);
}

// --- JOIN avec auto-rôle (VÉRIFIE SI ACTIVÉ) ---
client.on('guildMemberAdd', async (member) => {
    const autoRoleId = Database.get('autoRole');
    if (autoRoleId && Database.isFeatureEnabled('welcomeMessages')) {
        try {
            const role = member.guild.roles.cache.get(autoRoleId);
            if (role) {
                await member.roles.add(role).catch(err => { console.error(`[AUTO-ROLE] Erreur attribution rôle à ${member.user.tag}:`, err.message); });
                console.log(`[AUTO-ROLE] ✅ Rôle "${role.name}" attribué à ${member.user.tag}`);
                sendLog(member.guild, new EmbedBuilder().setTitle("🎭 Auto-Rôle Attribué").setDescription(`Le rôle ${role} a été attribué automatiquement à ${member}.`).setColor(0x2ecc71).setTimestamp());
            }
        } catch (e) { console.error('[AUTO-ROLE] Erreur générale:', e); }
    }

    if (!Database.isFeatureEnabled('welcomeMessages')) return;
    
    const welcomeChannel = Database.get('welcomeChannel');
    if (!welcomeChannel) return;
    const channel = member.guild.channels.cache.get(welcomeChannel);
    if (!channel) return;
    const embed = new EmbedBuilder().setTitle("📥 Nouveau membre !").setDescription(`Bienvenue à ${member} sur **${member.guild.name}** ! 🎉\nNous sommes **${member.guild.memberCount}** membres.`).setThumbnail(member.user.displayAvatarURL()).setColor(0x2ecc71).setTimestamp();
    channel.send({ embeds: [embed] });
});

client.on('guildMemberRemove', (member) => {
    if (!Database.isFeatureEnabled('leaveMessages')) return;
    const welcomeChannel = Database.get('welcomeChannel');
    if (!welcomeChannel) return;
    const channel = member.guild.channels.cache.get(welcomeChannel);
    if (!channel) return;
    const embed = new EmbedBuilder().setTitle("📤 Départ d'un membre").setDescription(`**${member.user?.tag || 'Inconnu'}** a quitté le serveur. 😢\nNous sommes **${member.guild.memberCount}** membres.`).setThumbnail(member.user.displayAvatarURL()).setColor(0xe74c3c).setTimestamp();
    channel.send({ embeds: [embed] });
});

// --- LOGS (VÉRIFIE SI ACTIVÉ) ---
function sendLog(guild, embed) {
    if (!Database.isFeatureEnabled('logs')) return;
    const logsChannel = Database.get('logsChannel');
    if (!logsChannel) return;
    const logChan = guild.channels.cache.get(logsChannel);
    if (logChan) logChan.send({ embeds: [embed] }).catch(() => {});
}

client.on('messageCreate', (message) => {
    if (!Database.isFeatureEnabled('logs')) return;
    if (!message.author || message.author.bot || !message.content || !message.content.startsWith(config.prefix)) return;
    const embed = new EmbedBuilder().setTitle("📝 Commande Exécutée").addFields({ name: "Auteur", value: `${message.author.tag} (${message.author.id})` }, { name: "Commande", value: `\`${message.content}\`` }, { name: "Salon", value: `${message.channel}` }).setColor(0x34495e).setTimestamp();
    sendLog(message.guild, embed);
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (!Database.isFeatureEnabled('logs')) return;
    if (!oldMember.premiumSince && newMember.premiumSince) {
        sendLog(newMember.guild, new EmbedBuilder().setTitle("🚀 Boost Serveur").setDescription(`**${newMember.user?.tag || 'Inconnu'}** vient de booster le serveur ! 💎`).setColor(0xf1c40f).setTimestamp());
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    if (!Database.isFeatureEnabled('logs')) return;
    const member = newState.member || oldState.member;
    if (!member || !member.user) return;
    const embed = new EmbedBuilder().setTimestamp();
    if (!oldState.channelId && newState.channelId) { embed.setTitle("🔊 Connexion Vocal").setDescription(`**${member.user.tag}** a rejoint ${newState.channel}`).setColor(0x2ecc71); sendLog(member.guild, embed); }
    else if (oldState.channelId && !newState.channelId) { embed.setTitle("🔇 Déconnexion Vocal").setDescription(`**${member.user.tag}** a quitté ${oldState.channel}`).setColor(0xe74c3c); sendLog(member.guild, embed); }
    else if (oldState.channelId !== newState.channelId) { embed.setTitle("🔄 Changement Vocal").setDescription(`**${member.user.tag}** : ${oldState.channel} → ${newState.channel}`).setColor(0x3498db); sendLog(member.guild, embed); }
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!Database.isFeatureEnabled('logs')) return;
    if (!oldMessage.author || !newMessage.author || oldMessage.author.bot || oldMessage.content === newMessage.content) return;
    sendLog(oldMessage.guild, new EmbedBuilder().setTitle("✏️ Message Modifié").addFields({ name: "Auteur", value: `${oldMessage.author.tag}` }, { name: "Salon", value: `${oldMessage.channel}` }, { name: "Avant", value: oldMessage.content || "*vide*" }, { name: "Après", value: newMessage.content || "*vide*" }).setColor(0xe67e22).setTimestamp());
});

client.on('messageDelete', (message) => {
    if (!Database.isFeatureEnabled('logs')) return;
    if (!message.author || message.author.bot) return;
    sendLog(message.guild, new EmbedBuilder().setTitle("🗑️ Message Supprimé").addFields({ name: "Auteur", value: `${message.author.tag}` }, { name: "Salon", value: `${message.channel}` }, { name: "Contenu", value: message.content || "*vide ou non en cache*" }).setColor(0xe74c3c).setTimestamp());
});

client.on('channelCreate', (channel) => {
    if (!Database.isFeatureEnabled('logs')) return;
    if (!channel.guild) return;
    sendLog(channel.guild, new EmbedBuilder().setTitle("➕ Salon Créé").setDescription(`**${channel.name}**`).setColor(0x2ecc71).setTimestamp());
});

client.on('channelUpdate', (oldChannel, newChannel) => {
    if (!Database.isFeatureEnabled('logs')) return;
    if (oldChannel.name === newChannel.name) return;
    sendLog(newChannel.guild, new EmbedBuilder().setTitle("✏️ Salon Modifié").setDescription(`${oldChannel.name} → **${newChannel.name}**`).setColor(0xe67e22).setTimestamp());
});

client.on('roleCreate', (role) => {
    if (!Database.isFeatureEnabled('logs')) return;
    sendLog(role.guild, new EmbedBuilder().setTitle("➕ Rôle Créé").setDescription(`**${role.name}**`).setColor(0x2ecc71).setTimestamp());
});

client.on('roleUpdate', (oldRole, newRole) => {
    if (!Database.isFeatureEnabled('logs')) return;
    if (oldRole.name === newRole.name) return;
    sendLog(newRole.guild, new EmbedBuilder().setTitle("✏️ Rôle Modifié").setDescription(`${oldRole.name} → **${newRole.name}**`).setColor(0xe67e22).setTimestamp());
});

// --- GESTION DES RÉACTIONS (VÉRIFIE SI ACTIVÉ) ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (!Database.isFeatureEnabled('reactionReglement')) return;
    
    if (reaction.partial) {
        try { await reaction.fetch(); }
        catch (error) { console.error('Erreur fetch réaction:', error); return; }
    }

    if (reaction.emoji.id === '1535995172419272774' && reaction.message.author.id === client.user.id) {
        console.log(`${user.tag} a réagi au règlement !`);
        sendLog(reaction.message.guild, new EmbedBuilder().setTitle("📜 Règlement Accepté").setDescription(`${user} a accepté le règlement.`).setColor(0x2ecc71).setTimestamp());
    }
});

// ============================================================
// ===== SERVEUR WEB EXPRESS (PANEL DE GESTION) ============
// ============================================================
function startWebServer() {
    const app = express();

    // Middlewares
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: true }));

    const ADMIN_PASSWORD = config.panelPassword || "admin123";

    // ===== MIDDLEWARE D'AUTHENTIFICATION UNIFIÉ =====
    // Accepte : query string, header X-Panel-Token, OU cookie-like via localStorage injecté en JS
    function requireAuth(req, res, next) {
        const token = req.query.token || req.headers['x-panel-token'];
        if (token === ADMIN_PASSWORD) return next();
        // Pour les requêtes HTML sans token, on sert une page qui vérifie côté client
        if (req.accepts('html')) {
            return res.redirect('/login');
        }
        return res.status(401).json({ success: false, error: 'Non authentifié' });
    }

    // Middleware API uniquement
    function authApi(req, res, next) {
        const token = req.headers['x-panel-token'] || req.query.token;
        if (token === ADMIN_PASSWORD) return next();
        return res.status(401).json({ success: false, error: 'Non authentifié' });
    }

    // ===== TEMPLATE HTML =====
    const htmlTemplate = (title, content, isLoggedIn = false) => `
<!DOCTYPE html>
<html lang="fr" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Orinstone Panel</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body { font-family: 'Inter', sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%); min-height: 100vh; }
        .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1); }
        .toggle-checkbox:checked + .toggle-label { background-color: #10b981 !important; }
        .toggle-checkbox:checked + .toggle-label .toggle-dot { transform: translateX(100%); background-color: white; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        .card-hover { transition: all 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease-out; }
    </style>
</head>
<body class="text-white">
    ${isLoggedIn ? `
    <nav class="glass sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
        <div class="flex items-center gap-3">
            <i class="fa-solid fa-cube text-purple-400 text-2xl"></i>
            <span class="font-bold text-xl">Orinstone Panel</span>
        </div>
        <div class="flex gap-4 items-center">
            <a href="/" class="nav-link text-gray-300 hover:text-white transition"><i class="fa-solid fa-house"></i> Accueil</a>
            <a href="/features" class="nav-link text-gray-300 hover:text-white transition"><i class="fa-solid fa-sliders"></i> Fonctionnalités</a>
            <a href="/status" class="nav-link text-gray-300 hover:text-white transition"><i class="fa-solid fa-signal"></i> Statuts</a>
            <a href="/about" class="nav-link text-gray-300 hover:text-white transition"><i class="fa-solid fa-circle-info"></i> À propos</a>
            <button onclick="logout()" class="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg transition">
                <i class="fa-solid fa-right-from-bracket"></i> Déconnexion
            </button>
        </div>
    </nav>
    ` : ''}
    <div class="container mx-auto px-6 py-8 fade-in">${content}</div>
    <footer class="glass mt-12 py-6 text-center text-gray-400">
        <p>&copy; 2026 Orinstone Network - Panel de gestion du bot Discord</p>
    </footer>
    ${isLoggedIn ? `
    <script>
        // ✅ INJECTION AUTOMATIQUE DU TOKEN DANS TOUS LES LIENS NAV
        (function() {
            const token = localStorage.getItem('panelToken');
            if (!token) { window.location.href = '/login'; return; }
            document.querySelectorAll('.nav-link').forEach(link => {
                const url = new URL(link.href, window.location.origin);
                url.searchParams.set('token', token);
                link.href = url.toString();
            });
        })();
        function logout() {
            localStorage.removeItem('panelToken');
            window.location.href = '/login';
        }
    </script>` : ''}
</body>
</html>`;

    // ===== PAGE DE CONNEXION =====
    app.get('/login', (req, res) => {
        const content = `
            <div class="max-w-md mx-auto mt-20">
                <div class="glass rounded-2xl p-8 card-hover">
                    <div class="text-center mb-6">
                        <i class="fa-solid fa-lock text-purple-400 text-5xl mb-4"></i>
                        <h1 class="text-3xl font-bold">Connexion</h1>
                        <p class="text-gray-400 mt-2">Accédez au panel de gestion</p>
                    </div>
                    <form id="loginForm" class="space-y-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-300 mb-2">Mot de passe administrateur</label>
                            <input type="password" id="password" required
                                class="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none">
                        </div>
                        <button type="submit" class="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 py-3 rounded-lg font-semibold transition">
                            <i class="fa-solid fa-right-to-bracket"></i> Se connecter
                        </button>
                        <div id="error" class="hidden bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded-lg text-sm"></div>
                    </form>
                </div>
            </div>
            <script>
                document.getElementById('loginForm').addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const password = document.getElementById('password').value;
                    try {
                        const res = await fetch('/api/login', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ password })
                        });
                        const data = await res.json();
                        if (data.success) {
                            localStorage.setItem('panelToken', data.token);
                            // ✅ Redirection AVEC le token dans l'URL
                            window.location.href = '/?token=' + encodeURIComponent(data.token);
                        } else {
                            const err = document.getElementById('error');
                            err.textContent = data.error;
                            err.classList.remove('hidden');
                        }
                    } catch (err) {
                        console.error(err);
                    }
                });
            </script>`;
        res.send(htmlTemplate('Connexion', content));
    });

    // ===== API LOGIN =====
    app.post('/api/login', (req, res) => {
        const { password } = req.body;
        if (password === ADMIN_PASSWORD) {
            return res.json({ success: true, token: ADMIN_PASSWORD });
        }
        return res.status(401).json({ success: false, error: 'Mot de passe incorrect' });
    });

    // ===== DASHBOARD =====
    app.get('/', requireAuth, (req, res) => {
        const token = req.query.token;
        const dbData = Database.load();
        const features = dbData.features || {};
        const enabledCount = Object.values(features).filter(v => v).length;
        const totalCount = Object.keys(features).length;

        const content = `
            <div class="mb-8">
                <h1 class="text-4xl font-bold mb-2"><i class="fa-solid fa-gauge-high text-purple-400"></i> Dashboard</h1>
                <p class="text-gray-400">Vue d'ensemble de votre bot Discord Orinstone</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="glass rounded-xl p-6 card-hover">
                    <div class="flex items-center gap-4">
                        <div class="bg-green-500/20 p-4 rounded-xl"><i class="fa-solid fa-circle-check text-green-400 text-2xl"></i></div>
                        <div><p class="text-gray-400 text-sm">Fonctionnalités actives</p><p class="text-3xl font-bold">${enabledCount} / ${totalCount}</p></div>
                    </div>
                </div>
                <div class="glass rounded-xl p-6 card-hover">
                    <div class="flex items-center gap-4">
                        <div class="bg-blue-500/20 p-4 rounded-xl"><i class="fa-solid fa-server text-blue-400 text-2xl"></i></div>
                        <div><p class="text-gray-400 text-sm">Statut du bot</p><p class="text-3xl font-bold text-green-400">En ligne</p></div>
                    </div>
                </div>
                <div class="glass rounded-xl p-6 card-hover">
                    <div class="flex items-center gap-4">
                        <div class="bg-purple-500/20 p-4 rounded-xl"><i class="fa-solid fa-clock text-purple-400 text-2xl"></i></div>
                        <div><p class="text-gray-400 text-sm">Port du panel</p><p class="text-3xl font-bold">${WEB_PORT}</p></div>
                    </div>
                </div>
            </div>
            <div class="glass rounded-xl p-8">
                <h2 class="text-2xl font-bold mb-4"><i class="fa-solid fa-bolt text-yellow-400"></i> Accès rapides</h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <a href="/features?token=${token}" class="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 p-6 rounded-xl transition card-hover">
                        <i class="fa-solid fa-sliders text-3xl mb-2"></i><h3 class="text-xl font-bold">Gérer les fonctionnalités</h3>
                    </a>
                    <a href="/status?token=${token}" class="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 p-6 rounded-xl transition card-hover">
                        <i class="fa-solid fa-signal text-3xl mb-2"></i><h3 class="text-xl font-bold">Statuts des services</h3>
                    </a>
                    <a href="/config?token=${token}" class="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 p-6 rounded-xl transition card-hover">
                        <i class="fa-solid fa-gear text-3xl mb-2"></i><h3 class="text-xl font-bold">Configuration</h3>
                    </a>
                    <a href="/about?token=${token}" class="bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 p-6 rounded-xl transition card-hover">
                        <i class="fa-solid fa-circle-info text-3xl mb-2"></i><h3 class="text-xl font-bold">À propos</h3>
                    </a>
                </div>
            </div>`;
        res.send(htmlTemplate('Dashboard', content, true));
    });

    // ===== FONCTIONNALITÉS =====
    app.get('/features', requireAuth, (req, res) => {
        const features = Database.get('features') || {};
        const featuresList = [
            { key: 'xpMessages', name: 'XP Messages', icon: 'fa-message', desc: 'Attribution d\'XP lors de l\'envoi de messages', color: 'blue' },
            { key: 'xpVoice', name: 'XP Vocal', icon: 'fa-microphone', desc: 'Attribution d\'XP toutes les minutes en vocal', color: 'green' },
            { key: 'welcomeMessages', name: 'Messages de bienvenue', icon: 'fa-hand-wave', desc: 'Envoi d\'un message à l\'arrivée des nouveaux membres', color: 'emerald' },
            { key: 'leaveMessages', name: 'Messages de départ', icon: 'fa-door-open', desc: 'Envoi d\'un message quand un membre quitte', color: 'orange' },
            { key: 'logs', name: 'Logs du serveur', icon: 'fa-file-lines', desc: 'Enregistrement des événements', color: 'purple' },
            { key: 'tickets', name: 'Système de tickets', icon: 'fa-ticket', desc: 'Création de tickets de support', color: 'indigo' },
            { key: 'statusServices', name: 'Statut des services', icon: 'fa-signal', desc: 'Affichage du statut des services hébergés', color: 'cyan' },
            { key: 'botStatusRotation', name: 'Rotation du statut', icon: 'fa-rotate', desc: 'Changement automatique du statut du bot', color: 'pink' },
            { key: 'levelUpNotifications', name: 'Notifications Level Up', icon: 'fa-arrow-up', desc: 'Annonce quand un membre monte de niveau', color: 'yellow' },
            { key: 'reactionReglement', name: 'Réaction Règlement', icon: 'fa-scroll', desc: 'Logs des réactions sur le règlement', color: 'amber' }
        ];

        let cardsHTML = '';
        featuresList.forEach(f => {
            const isEnabled = features[f.key] !== false;
            cardsHTML += `
                <div class="glass rounded-xl p-6 card-hover">
                    <div class="flex items-start justify-between">
                        <div class="flex items-start gap-4 flex-1">
                            <div class="bg-${f.color}-500/20 p-3 rounded-lg"><i class="fa-solid ${f.icon} text-${f.color}-400 text-xl"></i></div>
                            <div class="flex-1">
                                <h3 class="font-bold text-lg">${f.name}</h3>
                                <p class="text-gray-400 text-sm mt-1">${f.desc}</p>
                                <span class="inline-block mt-2 px-2 py-1 text-xs rounded-full ${isEnabled ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}" id="status-${f.key}">
                                    ${isEnabled ? '✓ Activé' : '✗ Désactivé'}
                                </span>
                            </div>
                        </div>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" class="sr-only peer toggle-checkbox" data-feature="${f.key}" ${isEnabled ? 'checked' : ''}>
                            <div class="toggle-label relative w-14 h-7 bg-gray-600 rounded-full peer-checked:bg-green-500 transition">
                                <div class="toggle-dot absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition"></div>
                            </div>
                        </label>
                    </div>
                </div>`;
        });

        const content = `
            <div class="mb-8">
                <h1 class="text-4xl font-bold mb-2"><i class="fa-solid fa-sliders text-purple-400"></i> Fonctionnalités</h1>
                <p class="text-gray-400">Activez ou désactivez les différentes fonctionnalités du bot</p>
            </div>
            <div id="notification" class="hidden fixed top-20 right-6 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg"></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${cardsHTML}</div>
            <script>
                document.querySelectorAll('.toggle-checkbox').forEach(toggle => {
                    toggle.addEventListener('change', async (e) => {
                        const feature = e.target.dataset.feature;
                        const enabled = e.target.checked;
                        const status = document.getElementById('status-' + feature);
                        try {
                            const res = await fetch('/api/feature', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'X-Panel-Token': localStorage.getItem('panelToken') },
                                body: JSON.stringify({ feature, enabled })
                            });
                            const data = await res.json();
                            if (data.success) {
                                const notif = document.getElementById('notification');
                                notif.textContent = enabled ? '✅ Fonctionnalité activée !' : '❌ Fonctionnalité désactivée';
                                notif.className = 'fixed top-20 right-6 z-50 text-white px-6 py-3 rounded-lg shadow-lg ' + (enabled ? 'bg-green-500' : 'bg-red-500');
                                status.textContent = enabled ? '✓ Activé' : '✗ Désactivé';
                                status.className = 'inline-block mt-2 px-2 py-1 text-xs rounded-full ' + (enabled ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300');
                                setTimeout(() => notif.classList.add('hidden'), 2000);
                            }
                        } catch (err) { e.target.checked = !enabled; }
                    });
                });
            </script>`;
        res.send(htmlTemplate('Fonctionnalités', content, true));
    });

    // ===== API FEATURE TOGGLE =====
    app.post('/api/feature', authApi, (req, res) => {
        const { feature, enabled } = req.body;
        if (!feature) return res.status(400).json({ success: false, error: 'Feature manquante' });
        Database.set(`features.${feature}`, !!enabled);
        console.log(`[PANEL] Feature ${feature} → ${enabled ? 'ON' : 'OFF'}`);
        res.json({ success: true, feature, enabled: !!enabled });
    });

    // ===== STATUT DES SERVICES =====
    app.get('/status', requireAuth, async (req, res) => {
        let servicesHTML = '';
        try {
            const statuses = await getAllStatus();
            statuses.forEach(s => {
                const color = s.online ? 'green' : 'red';
                const icon = s.online ? 'fa-circle-check' : 'fa-circle-xmark';
                servicesHTML += `
                    <div class="glass rounded-xl p-6 card-hover">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="font-bold text-lg">${s.name}</h3>
                            <i class="fa-solid ${icon} text-${color}-400 text-2xl"></i>
                        </div>
                        <div class="space-y-1 text-sm">
                            <p><span class="text-gray-400">Statut :</span> <span class="text-${color}-400 font-semibold">${s.online ? 'En ligne' : 'Hors ligne'}</span></p>
                            ${s.responseTime ? `<p><span class="text-gray-400">Latence :</span> ${s.responseTime}ms</p>` : ''}
                            ${s.url ? `<p><span class="text-gray-400">URL :</span> <a href="${s.url}" target="_blank" class="text-purple-400 hover:underline">${s.url}</a></p>` : ''}
                        </div>
                    </div>`;
            });
        } catch (e) { servicesHTML = '<p class="text-red-400">Erreur lors du chargement des statuts.</p>'; }

        const content = `
            <div class="mb-8"><h1 class="text-4xl font-bold mb-2"><i class="fa-solid fa-signal text-green-400"></i> Statut des Services</h1>
            <p class="text-gray-400">État en temps réel de vos services hébergés</p></div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">${servicesHTML}</div>`;
        res.send(htmlTemplate('Statuts', content, true));
    });

    // ===== CONFIGURATION =====
    app.get('/config', requireAuth, (req, res) => {
        const db = Database.load();
        const content = `
            <div class="mb-8"><h1 class="text-4xl font-bold mb-2"><i class="fa-solid fa-gear text-blue-400"></i> Configuration</h1>
            <p class="text-gray-400">Vue d'ensemble des paramètres du bot</p></div>
            <div class="glass rounded-xl p-8 mb-6">
                <h2 class="text-2xl font-bold mb-4">⚙️ XP & Niveaux</h2>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div class="bg-slate-800 rounded-lg p-4"><p class="text-gray-400 text-sm">XP Message</p><p class="text-2xl font-bold">${db.xpMessage || 15}</p></div>
                    <div class="bg-slate-800 rounded-lg p-4"><p class="text-gray-400 text-sm">XP Vocal</p><p class="text-2xl font-bold">${db.xpVoice || 15}/min</p></div>
                    <div class="bg-slate-800 rounded-lg p-4"><p class="text-gray-400 text-sm">Cooldown</p><p class="text-2xl font-bold">${db.xpMessageCooldown || 60}s</p></div>
                    <div class="bg-slate-800 rounded-lg p-4"><p class="text-gray-400 text-sm">Niveau max</p><p class="text-2xl font-bold">${db.maxLevel || 5000}</p></div>
                </div>
            </div>`;
        res.send(htmlTemplate('Configuration', content, true));
    });

    // ===== À PROPOS =====
    app.get('/about', requireAuth, (req, res) => {
        const content = `
            <div class="max-w-4xl mx-auto">
                <div class="mb-8 text-center">
                    <i class="fa-solid fa-cube text-purple-400 text-6xl mb-4"></i>
                    <h1 class="text-4xl font-bold mb-2">Orinstone Panel</h1>
                </div>
                <div class="glass rounded-xl p-8">
                    <h2 class="text-2xl font-bold mb-4"><i class="fa-solid fa-info-circle text-blue-400"></i> Informations</h2>
                    <div class="space-y-2">
                        <p><span class="text-gray-400">Version :</span> <span class="font-mono">1.0.0</span></p>
                        <p><span class="text-gray-400">Node.js :</span> <span class="font-mono">${process.version}</span></p>
                        <p><span class="text-gray-400">Port Panel :</span> <span class="font-mono">${WEB_PORT}</span></p>
                    </div>
                </div>
            </div>`;
        res.send(htmlTemplate('À propos', content, true));
    });

    // ===== API STATUS =====
    app.get('/api/status', (req, res) => {
        res.json({
            success: true,
            features: Database.get('features') || {},
            config: { xpMessage: Database.get('xpMessage'), xpVoice: Database.get('xpVoice') }
        });
    });

    // ✅ UNE SEULE ROUTE RACINE (plus de doublon)
    // Le '/' est déjà géré ci-dessus avec requireAuth

    // ===== DÉMARRAGE =====
    app.listen(WEB_PORT, '0.0.0.0', () => {
        console.log(`🌐 Panel web démarré sur http://0.0.0.0:${WEB_PORT}`);
    });
}

// --- LANCEMENT ---
client.login(config.token);