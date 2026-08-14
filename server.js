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

// --- CHARGEMENT DE LA CONFIGURATION ---
const config = require('./config.json');
const DB_PATH = path.join(__dirname, 'database.json');
const WARNS_PATH = path.join(__dirname, 'warns.json');
const LEVELS_PATH = path.join(__dirname, 'levels.json');

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
            autoRole: null
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
        return this.load()[key];
    },
    set(key, value) {
        const data = this.load();
        data[key] = value;
        return this.save(data);
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

// --- SYSTÈME DE NIVEAUX - GESTION DES MESSAGES ---
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    
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
    
    if (result.leveledUp) {
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
    // Configuration
    new SlashCommandBuilder()
        .setName('setchannel')
        .setDescription('Définit la catégorie des tickets')
        .addChannelOption(opt => opt.setName('categorie').setDescription('La catégorie des tickets').setRequired(true)),
    new SlashCommandBuilder()
        .setName('settranscript')
        .setDescription('Définit le salon des transcripts')
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour les transcripts').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setstaff')
        .setDescription('Définit le rôle Staff')
        .addRoleOption(opt => opt.setName('role').setDescription('Rôle autorisé à voir les tickets').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setwelcome')
        .setDescription('Définit le salon de bienvenue/départ')
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour Join/Quit').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setlogs')
        .setDescription('Définit le salon des logs')
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour les logs').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setstatus')
        .setDescription('Définit le salon pour le statut des services')
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour le statut').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setlevelup')
        .setDescription('Définit le salon pour les notifications de level up')
        .addChannelOption(opt => opt.setName('salon').setDescription('Salon textuel pour les level up').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setxp')
        .setDescription('Configure les gains d\'XP')
        .addIntegerOption(opt => opt.setName('message').setDescription('XP par message').setRequired(false).setMinValue(1).setMaxValue(100))
        .addIntegerOption(opt => opt.setName('voice').setDescription('XP par minute en vocal').setRequired(false).setMinValue(1).setMaxValue(100))
        .addIntegerOption(opt => opt.setName('cooldown').setDescription('Cooldown en secondes entre chaque message').setRequired(false).setMinValue(10).setMaxValue(300)),
    new SlashCommandBuilder()
        .setName('addlevelrole')
        .setDescription('Ajoute un rôle de récompense pour un niveau')
        .addIntegerOption(opt => opt.setName('niveau').setDescription('Niveau requis').setRequired(true).setMinValue(1).setMaxValue(5000))
        .addRoleOption(opt => opt.setName('role').setDescription('Rôle à donner').setRequired(true)),
    new SlashCommandBuilder()
        .setName('removelevelrole')
        .setDescription('Retire un rôle de récompense')
        .addIntegerOption(opt => opt.setName('niveau').setDescription('Niveau à retirer').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setautorole')
        .setDescription('Définit le rôle automatique à donner aux nouveaux membres')
        .addRoleOption(opt => opt.setName('role').setDescription('Le rôle à attribuer automatiquement').setRequired(true)),
    new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Envoie le panneau de création de ticket'),
    new SlashCommandBuilder()
        .setName('help-admin')
        .setDescription('Affiche l\'aide des commandes d\'administration du bot'),

    // Modération
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un membre')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('user').setDescription('Le membre à bannir').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Raison du ban').setRequired(false))
        .addIntegerOption(opt => opt.setName('days').setDescription('Jours de messages à supprimer (0-7)').setRequired(false).setMinValue(0).setMaxValue(7)),
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un membre')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('user').setDescription('Le membre à expulser').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Raison du kick').setRequired(false)),
    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un membre')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('Le membre à avertir').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Raison de l\'avertissement').setRequired(true)),
    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Supprimer des messages')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(opt => opt.setName('amount').setDescription('Nombre de messages à supprimer (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .addUserOption(opt => opt.setName('user').setDescription('Supprimer uniquement les messages de ce membre').setRequired(false)),
    new SlashCommandBuilder()
        .setName('transfert')
        .setDescription('Transférer un ticket vers une autre catégorie')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addChannelOption(opt => opt.setName('categorie').setDescription('Catégorie de destination').setRequired(true).addChannelTypes(ChannelType.GuildCategory)),
    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Voir les avertissements d\'un membre')
        .addUserOption(opt => opt.setName('user').setDescription('Le membre à vérifier').setRequired(true)),

    // Niveaux
    new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Affiche votre niveau ou celui d\'un membre')
        .addUserOption(opt => opt.setName('user').setDescription('Le membre à vérifier').setRequired(false)),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Affiche le classement des niveaux')
        .addIntegerOption(opt => opt.setName('page').setDescription('Numéro de page').setRequired(false).setMinValue(1)),
    new SlashCommandBuilder()
        .setName('resetrank')
        .setDescription('Réinitialise le niveau d\'un membre (Admin)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt => opt.setName('user').setDescription('Le membre à réinitialiser').setRequired(true)),

    // Statut
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('Affiche le statut des services'),
    new SlashCommandBuilder()
        .setName('refresh-status')
        .setDescription('Force la mise à jour du statut dans le salon dédié')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
    new SlashCommandBuilder()
        .setName('botstatus')
        .setDescription('Affiche le statut actuel du bot et les informations'),

    // Fun & Public
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Affiche l\'aide générale du bot'),
    new SlashCommandBuilder()
        .setName('reglement')
        .setDescription('Affiche le règlement officiel du serveur'),
    new SlashCommandBuilder()
        .setName('site')
        .setDescription('Affiche le lien vers notre site web'),
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Affiche la latence du bot'),
    new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Pose une question à la boule magique')
        .addStringOption(opt => opt.setName('question').setDescription('Votre question').setRequired(true)),
    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Lance un dé')
        .addIntegerOption(opt => opt.setName('faces').setDescription('Nombre de faces du dé').setRequired(false).setMinValue(2).setMaxValue(100)),
    new SlashCommandBuilder()
        .setName('flip')
        .setDescription('Pile ou face'),
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Le bot répète votre message')
        .addStringOption(opt => opt.setName('message').setDescription('Message à répéter').setRequired(true)),
    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Affiche l\'avatar d\'un membre')
        .addUserOption(opt => opt.setName('user').setDescription('Le membre').setRequired(false)),
    new SlashCommandBuilder()
        .setName('cat')
        .setDescription('Affiche une image de chat aléatoire'),
    new SlashCommandBuilder()
        .setName('dog')
        .setDescription('Affiche une image de chien aléatoire'),

    // NOUVELLES COMMANDES FUN
    new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Raconte une blague aléatoire'),
    new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Joue à Pierre-Feuille-Ciseaux contre le bot')
        .addStringOption(opt => opt.setName('choix').setDescription('Ton choix').setRequired(true).addChoices(
            { name: '🪨 Pierre', value: 'pierre' },
            { name: '📄 Feuille', value: 'feuille' },
            { name: '✂️ Ciseaux', value: 'ciseaux' }
        )),
    new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Affiche un meme aléatoire'),
    new SlashCommandBuilder()
        .setName('hug')
        .setDescription('Fais un câlin à un membre')
        .addUserOption(opt => opt.setName('user').setDescription('Le membre à câliner').setRequired(true)),
    new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Calcule l\'affinité amoureuse entre deux membres')
        .addUserOption(opt => opt.setName('user1').setDescription('Premier membre').setRequired(true))
        .addUserOption(opt => opt.setName('user2').setDescription('Deuxième membre').setRequired(false)),

    // SYSTÈME D'ATTRIBUTION DE RÔLE (Self-Role)
    new SlashCommandBuilder()
        .setName('getroles')
        .setDescription('Envoie un panneau pour obtenir des rôles spécifiques')
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
                    { 
                        name: "🎫 Support & Tickets",
                        value: "Cliquez sur le bouton **Ouvrir un ticket** dans le panneau de support.",
                        inline: false
                    },
                    { 
                        name: "📊 Niveaux",
                        value: "`/rank` `/leaderboard`",
                        inline: true
                    },
                    { 
                        name: "ℹ️ Informations",
                        value: "`/help` `/site` `/ping` `/avatar` `/status` `/botstatus` `/reglement`",
                        inline: true
                    },
                    { 
                        name: "🎮 Fun",
                        value: "`/8ball` `/roll` `/flip` `/cat` `/dog` `/joke` `/rps` `/meme` `/hug` `/ship`",
                        inline: true
                    },
                    { 
                        name: "💬 Communication",
                        value: "`/say` `/warnings`",
                        inline: true
                    }
                )
                .setFooter({ text: `${interaction.guild.name} - Support` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ============ COMMANDES NIVEAUX ============
        if (command === 'rank') {
            const user = interaction.options.getUser('user') || interaction.user;
            const member = interaction.guild.members.cache.get(user.id);
            
            if (user.bot) {
                return interaction.reply({ content: '❌ Les bots n\'ont pas de niveau.', ephemeral: true });
            }
            
            const userData = LevelDB.getUser(user.id, interaction.guild.id);
            const maxLevel = Database.get('maxLevel') || 5000;
            const xpNeeded = LevelDB.xpForNextLevel(userData.level);
            const xpCurrentLevel = LevelDB.xpForLevel(userData.level);
            const progress = userData.level >= maxLevel 
                ? 100 
                : Math.floor(((userData.xp - xpCurrentLevel) / (xpNeeded - xpCurrentLevel)) * 100);
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
                    { 
                        name: "📈 Progression", 
                        value: userData.level >= maxLevel
                            ? "```\nNIVEAU MAX ATTEINT !\n```"
                            : `\`${progressBar}\` **${progress}%**\n${userData.xp.toLocaleString()} / ${xpNeeded.toLocaleString()} XP`, 
                        inline: false 
                    },
                    { 
                        name: "💬 Stats Messages",
                        value: `**${userData.totalMessages.toLocaleString()}** messages\n+${userData.messageXP.toLocaleString()} XP`,
                        inline: true
                    },
                    { 
                        name: "🎤 Stats Vocal",
                        value: `**${voiceTimeStr}**\n+${userData.voiceXP.toLocaleString()} XP`,
                        inline: true
                    }
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
            
            if (pageData.length === 0) {
                return interaction.reply({ content: '❌ Aucune donnée de niveau trouvée.', ephemeral: true });
            }
            
            let description = '';
            
            for (let i = 0; i < pageData.length; i++) {
                const user = pageData[i];
                const member = interaction.guild.members.cache.get(user.userId);
                const rank = offset + i + 1;
                
                let medal = '';
                if (rank === 1) medal = '🥇';
                else if (rank === 2) medal = '🥈';
                else if (rank === 3) medal = '🥉';
                else medal = `**#${rank}**`;
                
                const displayName = member ? member.displayName : `Utilisateur inconnu`;
                
                description += `${medal} **${displayName}**\n`;
                description += `└ Niveau **${user.level}** • ${user.xp.toLocaleString()} XP • ${user.totalMessages.toLocaleString()} msgs\n\n`;
            }
            
            const embed = new EmbedBuilder()
                .setTitle("🏆 Classement des Niveaux")
                .setDescription(description)
                .setColor(0xf1c40f)
                .setFooter({ text: `Page ${page}/${totalPages} • ${leaderboard.length} membres` })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'resetrank') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            }
            
            const user = interaction.options.getUser('user');
            const data = LevelDB.load();
            const key = `${interaction.guild.id}-${user.id}`;
            
            if (data[key]) {
                delete data[key];
                LevelDB.save(data);
                
                const embed = new EmbedBuilder()
                    .setTitle("🔄 Niveau Réinitialisé")
                    .setDescription(`Le niveau de **${user.tag}** a été réinitialisé.`)
                    .setColor(0xe74c3c)
                    .setTimestamp();
                
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
            
            const embed = new EmbedBuilder()
                .setTitle("🤖 Statut du Bot")
                .setDescription(`Informations sur le bot **${client.user.tag}**`)
                .setColor(0x3498db)
                .setThumbnail(client.user.displayAvatarURL())
                .addFields(
                    { 
                        name: "📊 Statut actuel",
                        value: `**${currentStatus.type}** ${currentText}`,
                        inline: false
                    },
                    {
                        name: "🔄 Prochain changement",
                        value: "Toutes les **15 minutes**",
                        inline: true
                    },
                    {
                        name: "📡 Latence",
                        value: `${client.ws.ping}ms`,
                        inline: true
                    },
                    {
                        name: "🌐 Site Web",
                        value: "[heberge.orinstone.deepstone.fr](https://heberge.orinstone.deepstone.fr)",
                        inline: true
                    },
                    {
                        name: "🖥️ Serveurs",
                        value: `${client.guilds.cache.size}`,
                        inline: true
                    },
                    {
                        name: "👥 Membres",
                        value: `${client.users.cache.size}`,
                        inline: true
                    },
                    {
                        name: "⏱️ Uptime",
                        value: `${days}j ${hours}h ${minutes}m ${seconds}s`,
                        inline: true
                    },
                    {
                        name: "📋 Statuts en rotation",
                        value: botStatuses.map((s, i) => 
                            `${i === currentStatusIndex ? '➡️' : '•'} ${s.type} ${typeof s.text === 'function' ? s.text() : s.text}`
                        ).join('\n'),
                        inline: false
                    }
                )
                .setFooter({ text: `ID: ${client.user.id}` })
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'site') {
            const embed = new EmbedBuilder()
                .setTitle("🌐 Notre Site Web")
                .setDescription("Découvrez notre site officiel !")
                .setURL("https://heberge.orinstone.deepstone.fr")
                .setColor(0x9b59b6)
                .addFields({ 
                    name: "🔗 Lien",
                    value: "[Cliquez ici pour accéder au site](https://heberge.orinstone.deepstone.fr)",
                    inline: false
                })
                .setFooter({ text: `${interaction.guild.name}` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Visiter le site')
                    .setURL('https://heberge.orinstone.deepstone.fr')
                    .setStyle(ButtonStyle.Link)
            );

            return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (command === 'ping') {
            const start = Date.now();
            await interaction.deferReply({ ephemeral: true });
            const ping = Date.now() - start;
            const embed = new EmbedBuilder()
                .setTitle("🏓 Pong!")
                .setColor(0x2ecc71)
                .addFields(
                    { name: "📡 Latence API", value: `${ping}ms`, inline: true },
                    { name: "💓 WebSocket", value: `${client.ws.ping}ms`, inline: true }
                )
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        }

        if (command === 'status') {
            await interaction.deferReply();
            const statuses = await getAllStatus();
            const embed = createStatusEmbed(statuses);
            return interaction.editReply({ embeds: [embed], components: [createStatusButtons()] });
        }

        if (command === 'refresh-status') {
            await interaction.deferReply({ ephemeral: true });
            
            const statusChannelId = Database.get('statusChannel');
            if (!statusChannelId) {
                return interaction.editReply('❌ Aucun salon de statut configuré (`/setstatus`).');
            }

            const channel = interaction.guild.channels.cache.get(statusChannelId);
            if (!channel) {
                return interaction.editReply('❌ Salon de statut introuvable.');
            }

            try {
                await updateStatusMessage(channel);
                return interaction.editReply(`✅ Statut mis à jour dans ${channel} !`);
            } catch (error) {
                console.error('Erreur refresh-status:', error);
                return interaction.editReply('❌ Erreur lors de la mise à jour.');
            }
        }

        if (command === '8ball') {
            const question = interaction.options.getString('question');
            const responses = [
                "🎱 C'est certain.", "🎱 Sans aucun doute.", "🎱 Oui, définitivement.",
                "🎱 Tu peux compter dessus.", "🎱 Très probable.", "🎱 Oui.",
                "🎱 Les signes disent oui.", "🎱 Réponse floue, réessaye.",
                "🎱 Redemande plus tard.", "🎱 Mieux vaut ne pas te le dire maintenant.",
                "🎱 Impossible de prédire maintenant.", "🎱 Concentre-toi et redemande.",
                "🎱 N'y compte pas.", "🎱 Ma réponse est non.", "🎱 Mes sources disent non.",
                "🎱 Très douteux."
            ];
            const response = responses[Math.floor(Math.random() * responses.length)];
            const embed = new EmbedBuilder()
                .setTitle("🎱 Boule Magique")
                .setColor(0x8e44ad)
                .addFields(
                    { name: "❓ Question", value: question, inline: false },
                    { name: "🔮 Réponse", value: response, inline: false }
                )
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'roll') {
            const faces = interaction.options.getInteger('faces') || 6;
            const result = Math.floor(Math.random() * faces) + 1;
            const embed = new EmbedBuilder()
                .setTitle("🎲 Lancer de dé")
                .setDescription(`Tu as lancé un dé à **${faces}** faces !`)
                .setColor(0xe67e22)
                .addFields({ name: "🎯 Résultat", value: `**${result}**`, inline: true })
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'flip') {
            const result = Math.random() < 0.5 ? "👑 **Pile** !" : "🦅 **Face** !";
            const embed = new EmbedBuilder()
                .setTitle("🪙 Pile ou Face")
                .setDescription(result)
                .setColor(0xf1c40f)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'say') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            }
            const message = interaction.options.getString('message');
            await interaction.deferReply({ ephemeral: true });
            await interaction.channel.send(message);
            return interaction.editReply('✅ Message envoyé !');
        }

        if (command === 'avatar') {
            const user = interaction.options.getUser('user') || interaction.user;
            const member = interaction.guild.members.cache.get(user.id);
            const embed = new EmbedBuilder()
                .setTitle(`🖼️ Avatar de ${user.tag}`)
                .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
                .setColor(member?.displayColor || 0x3498db)
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'cat') {
            await interaction.deferReply();
            try {
                const res = await fetch('https://api.thecatapi.com/v1/images/search');
                const data = await res.json();
                const embed = new EmbedBuilder()
                    .setTitle("🐱 Voici un chat !")
                    .setImage(data[0].url)
                    .setColor(0xe67e22)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            } catch (e) {
                return interaction.editReply('❌ Impossible de récupérer une image de chat.');
            }
        }

        if (command === 'dog') {
            await interaction.deferReply();
            try {
                const res = await fetch('https://dog.ceo/api/breeds/image/random');
                const data = await res.json();
                const embed = new EmbedBuilder()
                    .setTitle("🐶 Voici un chien !")
                    .setImage(data.message)
                    .setColor(0x3498db)
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            } catch (e) {
                return interaction.editReply('❌ Impossible de récupérer une image de chien.');
            }
        }

        // ============ NOUVELLES COMMANDES FUN ============
        if (command === 'joke') {
            const jokes = [
                "Pourquoi les plongeurs plongent-ils toujours en arrière et jamais en avant ?\n*Parce que sinon ils tomberaient dans le bateau.* 🤣",
                "Que fait une fraise sur un cheval ?\n*Tagada tagada !* 🍓🐎",
                "C'est l'histoire d'un pingouin qui respire par les fesses.\nUn jour il s'assoit et il meurt. 🐧💀",
                "Quel est le comble pour un électricien ?\n*De ne pas être au courant !* ⚡",
                "Comment appelle-t-on un chien qui n'a pas de pattes ?\n*On ne l'appelle pas, on va le chercher.* 🐶",
                "Que dit une imprimante dans l'eau ?\n*J'ai papier !* (J'ai pas pied) 🖨️💦",
                "Pourquoi est-ce que les fantômes mentent si mal ?\n*Parce qu'on peut voir à travers eux !* 👻",
                "Un mec rentre dans un café... et plouf ! ☕💦"
            ];
            const joke = jokes[Math.floor(Math.random() * jokes.length)];
            const embed = new EmbedBuilder()
                .setTitle("😂 Blague du jour")
                .setDescription(joke)
                .setColor(0xf1c40f)
                .setFooter({ text: "Demandé par " + interaction.user.tag })
                .setTimestamp();
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'rps') {
            const userChoice = interaction.options.getString('choix');
            const choices = ['pierre', 'feuille', 'ciseaux'];
            const emojis = { pierre: '🪨', feuille: '📄', ciseaux: '✂️' };
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            
            let result = '';
            let color = 0x3498db;
            
            if (userChoice === botChoice) {
                result = "🤝 **Égalité !**";
                color = 0xf1c40f;
            } else if (
                (userChoice === 'pierre' && botChoice === 'ciseaux') ||
                (userChoice === 'feuille' && botChoice === 'pierre') ||
                (userChoice === 'ciseaux' && botChoice === 'feuille')
            ) {
                result = "🎉 **Tu as gagné !**";
                color = 0x2ecc71;
            } else {
                result = "💀 **Tu as perdu !**";
                color = 0xe74c3c;
            }
            
            const embed = new EmbedBuilder()
                .setTitle("✊ Pierre - Feuille - Ciseaux ✋")
                .setDescription(`**Ton choix :** ${emojis[userChoice]} ${userChoice}\n**Choix du bot :** ${emojis[botChoice]} ${botChoice}\n\n**Résultat :** ${result}`)
                .setColor(color)
                .setTimestamp();
                
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'meme') {
            await interaction.deferReply();
            try {
                const res = await fetch('https://meme-api.com/gimme');
                const data = await res.json();
                if (data.nsfw) {
                    return interaction.editReply('❌ Le meme récupéré est NSFW, veuillez réessayer.');
                }
                const embed = new EmbedBuilder()
                    .setTitle(`😂 ${data.title}`)
                    .setImage(data.url)
                    .setColor(0xe67e22)
                    .setFooter({ text: `👍 ${data.ups} | Subreddit: r/${data.subreddit}` })
                    .setTimestamp();
                return interaction.editReply({ embeds: [embed] });
            } catch (e) {
                return interaction.editReply('❌ Impossible de récupérer un meme pour le moment.');
            }
        }

        if (command === 'hug') {
            const target = interaction.options.getUser('user');
            if (target.id === interaction.user.id) {
                return interaction.reply({ content: "🫂 Tu te fais un câlin à toi-même... C'est un peu triste, non ? 😅", ephemeral: true });
            }
            
            await interaction.deferReply();
            try {
                const res = await fetch('https://api.waifu.pics/sfw/hug');
                const data = await res.json();
                
                const embed = new EmbedBuilder()
                    .setTitle("🫕 Câlin !")
                    .setDescription(`**${interaction.user.username}** fait un gros câlin à **${target.username}** ! 💖`)
                    .setImage(data.url)
                    .setColor(0xff69b4)
                    .setTimestamp();
                    
                return interaction.editReply({ embeds: [embed], content: `${target}` });
            } catch (e) {
                return interaction.editReply('❌ Impossible de récupérer un gif de câlin.');
            }
        }
        
        if (command === 'ship') {
            const user1 = interaction.options.getUser('user1');
            const user2 = interaction.options.getUser('user2') || interaction.user;
            
            if (user1.id === user2.id) {
                return interaction.reply({ content: "😅 Tu ne peux pas te ship avec toi-même !", ephemeral: true });
            }
            
            const percentage = Math.floor(Math.random() * 101);
            let emoji = '💔';
            let text = "Pas fait pour s'entendre...";
            
            if (percentage >= 80) { emoji = '💖'; text = "Âmes sœurs ! C'est le grand amour !"; }
            else if (percentage >= 60) { emoji = '💕'; text = "Très bonne compatibilité !"; }
            else if (percentage >= 40) { emoji = '💞'; text = "Ça peut coller avec quelques efforts."; }
            else if (percentage >= 20) { emoji = '💔'; text = "C'est pas gagné..."; }
            
            const embed = new EmbedBuilder()
                .setTitle("💘 Test de Compatibilité")
                .setDescription(`**${user1.username}** & **${user2.username}**\n\n${emoji} **${percentage}%** d'affinité !\n*${text}*`)
                .setColor(0xff69b4)
                .setTimestamp();
                
            return interaction.reply({ embeds: [embed] });
        }

        // ============ COMMANDES MODÉRATION ============
        if (command === 'ban') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.BanMembers)) {
                return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            }
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison';
            const days = interaction.options.getInteger('days') || 0;
            const member = interaction.guild.members.cache.get(user.id);

            if (member && !member.bannable) {
                return interaction.reply({ content: '❌ Impossible de bannir ce membre.', ephemeral: true });
            }

            try {
                await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: days * 86400 });
                const embed = new EmbedBuilder()
                    .setTitle("🔨 Membre Banni")
                    .setColor(0xe74c3c)
                    .addFields(
                        { name: "👤 Utilisateur", value: `${user.tag} (${user.id})`, inline: true },
                        { name: "🛡️ Modérateur", value: `${interaction.user.tag}`, inline: true },
                        { name: "📝 Raison", value: reason, inline: false },
                        { name: "📅 Jours supprimés", value: `${days} jour(s)`, inline: true }
                    )
                    .setTimestamp();
                sendLog(interaction.guild, embed);
                return interaction.reply({ embeds: [embed] });
            } catch (e) {
                return interaction.reply({ content: '❌ Erreur lors du bannissement.', ephemeral: true });
            }
        }

        if (command === 'kick') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            }
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason') || 'Aucune raison';
            const member = interaction.guild.members.cache.get(user.id);

            if (!member) return interaction.reply({ content: '❌ Ce membre n\'est pas sur le serveur.', ephemeral: true });
            if (!member.kickable) return interaction.reply({ content: '❌ Impossible d\'expulser ce membre.', ephemeral: true });

            try {
                await member.kick(reason);
                const embed = new EmbedBuilder()
                    .setTitle("👢 Membre Expulsé")
                    .setColor(0xe67e22)
                    .addFields(
                        { name: "👤 Utilisateur", value: `${user.tag} (${user.id})`, inline: true },
                        { name: "🛡️ Modérateur", value: `${interaction.user.tag}`, inline: true },
                        { name: "📝 Raison", value: reason, inline: false }
                    )
                    .setTimestamp();
                sendLog(interaction.guild, embed);
                return interaction.reply({ embeds: [embed] });
            } catch (e) {
                return interaction.reply({ content: '❌ Erreur lors de l\'expulsion.', ephemeral: true });
            }
        }

        if (command === 'warn') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            }
            const user = interaction.options.getUser('user');
            const reason = interaction.options.getString('reason');
            const member = interaction.guild.members.cache.get(user.id);

            if (user.bot) return interaction.reply({ content: '❌ Impossible d\'avertir un bot.', ephemeral: true });

            const count = WarnDB.add(user.id, interaction.guild.id, reason, interaction.user.tag);

            const embed = new EmbedBuilder()
                .setTitle("⚠️ Avertissement Ajouté")
                .setColor(0xf1c40f)
                .addFields(
                    { name: "👤 Utilisateur", value: `${user.tag}`, inline: true },
                    { name: "🛡️ Modérateur", value: `${interaction.user.tag}`, inline: true },
                    { name: "📊 Total warnings", value: `${count}`, inline: true },
                    { name: "📝 Raison", value: reason, inline: false }
                )
                .setTimestamp();

            try {
                const dmEmbed = new EmbedBuilder()
                    .setTitle("⚠️ Vous avez reçu un avertissement")
                    .setDescription(`Sur le serveur **${interaction.guild.name}**`)
                    .setColor(0xf1c40f)
                    .addFields(
                        { name: "📝 Raison", value: reason, inline: false },
                        { name: "📊 Total", value: `${count} avertissement(s)`, inline: true }
                    )
                    .setTimestamp();
                await user.send({ embeds: [dmEmbed] }).catch(() => {});
            } catch (e) {}

            sendLog(interaction.guild, embed);
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'warnings') {
            const user = interaction.options.getUser('user');
            const warns = WarnDB.get(user.id, interaction.guild.id);

            if (warns.length === 0) {
                return interaction.reply({ content: `✅ **${user.tag}** n'a aucun avertissement.`, ephemeral: true });
            }

            const fields = warns.slice(0, 25).map((w, i) => ({
                name: `#${i + 1} - ${new Date(w.date).toLocaleDateString('fr-FR')}`,
                value: `**Raison:** ${w.reason}\n**Par:** ${w.moderator}`,
                inline: false
            }));

            const embed = new EmbedBuilder()
                .setTitle(`📋 Avertissements de ${user.tag}`)
                .setDescription(`Total: **${warns.length}** avertissement(s)`)
                .setColor(0xf1c40f)
                .addFields(fields)
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        if (command === 'clear') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            }
            const amount = interaction.options.getInteger('amount');
            const targetUser = interaction.options.getUser('user');

            await interaction.deferReply({ ephemeral: true });

            try {
                const messages = await interaction.channel.messages.fetch({ limit: amount });
                let toDelete = messages;

                if (targetUser) {
                    toDelete = messages.filter(m => m.author.id === targetUser.id);
                }

                const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
                const count = deleted ? deleted.size : 0;

                const embed = new EmbedBuilder()
                    .setTitle("🗑️ Messages Supprimés")
                    .setColor(0x3498db)
                    .setDescription(`**${count}** message(s) supprimé(s).`)
                    .setTimestamp();

                sendLog(interaction.guild, embed);
                return interaction.editReply({ embeds: [embed] });
            } catch (e) {
                return interaction.editReply('❌ Erreur lors de la suppression.');
            }
        }

        if (command === 'transfert') {
            if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
            }
            const category = interaction.options.getChannel('categorie');
            const channel = interaction.channel;

            if (channel.type !== ChannelType.GuildText) {
                return interaction.reply({ content: '❌ Cette commande ne peut être utilisée que dans un salon textuel.', ephemeral: true });
            }

            try {
                await channel.setParent(category.id);
                const embed = new EmbedBuilder()
                    .setTitle("📂 Ticket Transféré")
                    .setDescription(`Ce salon a été déplacé vers la catégorie **${category.name}**.`)
                    .setColor(0x3498db)
                    .setTimestamp();
                sendLog(interaction.guild, embed);
                return interaction.reply({ embeds: [embed] });
            } catch (e) {
                return interaction.reply({ content: '❌ Erreur lors du transfert.', ephemeral: true });
            }
        }

        // ============ COMMANDES ADMIN (Setup) ============
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Permissions insuffisantes.', ephemeral: true });
        }

        if (command === 'setchannel') {
            const category = interaction.options.getChannel('categorie');
            if (category.type !== ChannelType.GuildCategory) {
                return interaction.reply({ content: "⚠️ Veuillez sélectionner une **catégorie** valide.", ephemeral: true });
            }
            Database.set('ticketCategory', category.id);
            return interaction.reply(`✅ Catégorie des tickets définie sur : **${category.name}**`);
        }

        if (command === 'settranscript') {
            const channel = interaction.options.getChannel('salon');
            Database.set('transcriptChannel', channel.id);
            return interaction.reply(`✅ Salon des transcripts défini sur : ${channel}`);
        }

        if (command === 'setstaff') {
            const role = interaction.options.getRole('role');
            Database.set('staffRole', role.id);
            return interaction.reply(`✅ Rôle Staff défini sur : **${role.name}**`);
        }

        if (command === 'setwelcome') {
            const channel = interaction.options.getChannel('salon');
            Database.set('welcomeChannel', channel.id);
            return interaction.reply(`✅ Salon de bienvenue/départ défini sur : ${channel}`);
        }

        if (command === 'setlogs') {
            const channel = interaction.options.getChannel('salon');
            Database.set('logsChannel', channel.id);
            return interaction.reply(`✅ Salon des logs défini sur : ${channel}`);
        }

        if (command === 'setstatus') {
            const channel = interaction.options.getChannel('salon');
            if (channel.type !== ChannelType.GuildText) {
                return interaction.reply({ content: "⚠️ Veuillez sélectionner un salon textuel valide.", ephemeral: true });
            }
            Database.set('statusChannel', channel.id);
            Database.set('statusMessageId', null);
            
            try {
                await updateStatusMessage(channel);
                return interaction.reply(`✅ Salon de statut défini sur : ${channel}\n📊 Premier statut envoyé !`);
            } catch (e) {
                return interaction.reply(`✅ Salon de statut défini sur : ${channel}`);
            }
        }

        if (command === 'setlevelup') {
            const channel = interaction.options.getChannel('salon');
            if (channel.type !== ChannelType.GuildText) {
                return interaction.reply({ content: "⚠️ Veuillez sélectionner un salon textuel valide.", ephemeral: true });
            }
            Database.set('levelupChannel', channel.id);
            return interaction.reply(`✅ Salon de level up défini sur : ${channel}`);
        }

        if (command === 'setxp') {
            const messageXP = interaction.options.getInteger('message');
            const voiceXP = interaction.options.getInteger('voice');
            const cooldown = interaction.options.getInteger('cooldown');
            
            let changes = [];
            
            if (messageXP) {
                Database.set('xpMessage', messageXP);
                changes.push(`XP message: **${messageXP}**`);
            }
            if (voiceXP) {
                Database.set('xpVoice', voiceXP);
                changes.push(`XP vocal: **${voiceXP}**/min`);
            }
            if (cooldown) {
                Database.set('xpMessageCooldown', cooldown);
                changes.push(`Cooldown: **${cooldown}s**`);
            }
            
            if (changes.length === 0) {
                return interaction.reply({ content: '⚠️ Aucune valeur spécifiée.', ephemeral: true });
            }
            
            const embed = new EmbedBuilder()
                .setTitle("⚙️ Configuration XP Modifiée")
                .setDescription(changes.join('\n'))
                .setColor(0x3498db)
                .addFields(
                    { name: "📊 Configuration actuelle", value: 
                        `XP message: **${Database.get('xpMessage') || 15}**\n` +
                        `XP vocal: **${Database.get('xpVoice') || 10}**/min\n` +
                        `Cooldown: **${Database.get('xpMessageCooldown') || 60}s**\n` +
                        `Niveau max: **${Database.get('maxLevel') || 5000}**`,
                        inline: false 
                    }
                )
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'addlevelrole') {
            const level = interaction.options.getInteger('niveau');
            const role = interaction.options.getRole('role');
            
            const levelRoles = Database.get('levelRoles') || {};
            levelRoles[level] = role.id;
            Database.set('levelRoles', levelRoles);
            
            const embed = new EmbedBuilder()
                .setTitle("🏆 Rôle de Niveau Ajouté")
                .setDescription(`Le rôle ${role} sera donné au niveau **${level}**.`)
                .setColor(0x2ecc71)
                .setTimestamp();
            
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'removelevelrole') {
            const level = interaction.options.getInteger('niveau');
            
            const levelRoles = Database.get('levelRoles') || {};
            
            if (!levelRoles[level]) {
                return interaction.reply({ content: `❌ Aucun rôle configuré pour le niveau ${level}.`, ephemeral: true });
            }
            
            delete levelRoles[level];
            Database.set('levelRoles', levelRoles);
            
            return interaction.reply(`✅ Rôle de récompense pour le niveau **${level}** supprimé.`);
        }

        if (command === 'setautorole') {
            const role = interaction.options.getRole('role');
            
            const botMember = interaction.guild.members.me;
            if (role.position >= botMember.roles.highest.position) {
                return interaction.reply({ 
                    content: `❌ Je ne peux pas attribuer le rôle **${role.name}** car il est plus haut ou égal à mon rôle le plus haut dans la hiérarchie.`, 
                    ephemeral: true 
                });
            }
            
            if (!role.editable) {
                return interaction.reply({ 
                    content: `❌ Je n'ai pas la permission de modifier/attribuer le rôle **${role.name}**.`, 
                    ephemeral: true 
                });
            }
            
            Database.set('autoRole', role.id);
            
            const embed = new EmbedBuilder()
                .setTitle("🎭 Auto-Rôle Configuré")
                .setDescription(`Les nouveaux membres recevront automatiquement le rôle **${role}** en rejoignant le serveur.`)
                .setColor(0x2ecc71)
                .addFields(
                    { name: "📋 Rôle", value: `${role} (\`${role.id}\`)`, inline: true },
                    { name: "👥 Position", value: `${role.position}`, inline: true },
                    { name: "🎨 Couleur", value: `${role.hexColor}`, inline: true }
                )
                .setTimestamp();
            
            sendLog(interaction.guild, embed);
            return interaction.reply({ embeds: [embed] });
        }

        if (command === 'setup') {
            const embed = new EmbedBuilder()
                .setTitle("🎫 Support - Ouverture de Ticket")
                .setDescription(
                    "**Comment pouvons-nous vous aider ?**\n\n" +
                    "📩 **Support général** : Cliquez sur `Ouvrir un ticket` pour toute demande d'aide.\n" +
                    "🐛 **Bug & Report** : Cliquez sur `Signaler un bug` pour signaler un problème technique."
                )
                .setColor(0x3498db)
                .setFooter({ text: `${interaction.guild.name} - Support` })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('create_ticket')
                    .setLabel('Ouvrir un ticket')
                    .setEmoji('📩')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('create_bug_ticket')
                    .setLabel('Signaler un bug')
                    .setEmoji('🐛')
                    .setStyle(ButtonStyle.Danger)
            );

            await interaction.channel.send({ embeds: [embed], components: [row] });
            return interaction.reply({ content: '✅ Panneau de ticket envoyé !', ephemeral: true });
        }

        if (command === 'help-admin') {
            const ticketCategory = Database.get('ticketCategory');
            const transcriptChannel = Database.get('transcriptChannel');
            const staffRole = Database.get('staffRole');
            const welcomeChannel = Database.get('welcomeChannel');
            const logsChannel = Database.get('logsChannel');
            const statusChannel = Database.get('statusChannel');
            const levelupChannel = Database.get('levelupChannel');
            const autoRole = Database.get('autoRole');

            const status = (id) => id ? '✅' : '❌';
            
            let autoRoleInfo = 'Non configuré';
            if (autoRole) {
                const role = interaction.guild.roles.cache.get(autoRole);
                autoRoleInfo = role ? `${role.name}` : 'Rôle introuvable';
            }

            const embed = new EmbedBuilder()
                .setTitle("🛠️ Aide - Administration")
                .setDescription("Commandes d'administration et modération.")
                .setColor(0x3498db)
                .addFields(
                    { name: "⚙️ Configuration", value: "`/setchannel` `/settranscript` `/setstaff` `/setwelcome` `/setlogs` `/setstatus` `/setlevelup` `/setxp` `/setautorole` `/setup` `/getroles`", inline: false },
                    { name: "🏆 Niveaux", value: "`/addlevelrole` `/removelevelrole` `/resetrank`", inline: false },
                    { name: "🔨 Modération", value: "`/ban` `/kick` `/warn` `/clear` `/transfert` `/warnings`", inline: false },
                    { name: "📊 Statut", value: "`/status` `/refresh-status` `/botstatus`", inline: false },
                    { name: "ℹ️ Infos", value: "`/help` `/site` `/help-admin` `/reglement`", inline: false },
                    { 
                        name: "📊 État", 
                        value: 
                            `Tickets: ${status(ticketCategory)} | Transcripts: ${status(transcriptChannel)} | Staff: ${status(staffRole)}\n` +
                            `Welcome: ${status(welcomeChannel)} | Logs: ${status(logsChannel)} | Status: ${status(statusChannel)}\n` +
                            `LevelUp: ${status(levelupChannel)} | Auto-Rôle: ${status(autoRole)}`, 
                        inline: false 
                    },
                    { 
                        name: "🎭 Auto-Rôle actuel", 
                        value: autoRoleInfo, 
                        inline: false 
                    }
                )
                .setTimestamp();

            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // ============ COMMANDE RÈGLEMENT ============
        if (command === 'reglement') {
            if (!reglementData) {
                return interaction.reply({ 
                    content: '❌ Le règlement n\'est pas configuré (fichier `reglement.json` manquant).', 
                    ephemeral: true 
                });
            }

            const embed = createReglementEmbed();
            if (!embed) {
                return interaction.reply({ 
                    content: '❌ Erreur lors de la génération du règlement.', 
                    ephemeral: true 
                });
            }

            const reply = await interaction.reply({ 
                embeds: [embed], 
                fetchReply: true 
            });

            try {
                await reply.react('1535995172419272774');
            } catch (error) {
                console.error('Erreur ajout réaction règlement:', error);
            }
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

        // ===== TICKET SUPPORT CLASSIQUE =====
        if (interaction.customId === 'create_ticket') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const ticketCategory = Database.get('ticketCategory');
                if (!ticketCategory) {
                    return interaction.editReply("❌ Catégorie non configurée (`/setchannel`).");
                }

                const channelName = `ticket-${interaction.user.username}`;
                const existingChannel = interaction.guild.channels.cache.find(c => c.name === channelName.toLowerCase());
                if (existingChannel) {
                    return interaction.editReply(`❌ Vous avez déjà un ticket : ${existingChannel}`);
                }

                const staffRole = Database.get('staffRole');
                const permissionOverwrites = [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
                ];

                if (staffRole) {
                    permissionOverwrites.push({
                        id: staffRole,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
                    });
                }

                const ticketChannel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: ticketCategory,
                    permissionOverwrites: permissionOverwrites
                });

                const embed = new EmbedBuilder()
                    .setTitle(`Ticket de ${interaction.user.tag}`)
                    .setDescription("Expliquez votre problème en détail.")
                    .setColor(0x2ecc71);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Fermer le ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                await ticketChannel.send({
                    content: `${interaction.user} ${staffRole ? `<@&${staffRole}>` : ''}`,
                    embeds: [embed],
                    components: [row]
                });

                return interaction.editReply(`✅ Ticket créé : ${ticketChannel}`);
            } catch (error) {
                console.error('Erreur création ticket:', error);
                return interaction.editReply('❌ Erreur lors de la création.').catch(() => {});
            }
        }

        // ===== TICKET BUG & REPORT =====
        if (interaction.customId === 'create_bug_ticket') {
            await interaction.deferReply({ ephemeral: true });

            try {
                const ticketCategory = Database.get('ticketCategory');
                if (!ticketCategory) {
                    return interaction.editReply("❌ Catégorie non configurée (`/setchannel`).");
                }

                const channelName = `bug-${interaction.user.username}`;
                const existingChannel = interaction.guild.channels.cache.find(
                    c => c.name === channelName.toLowerCase() && c.name.startsWith('bug-')
                );
                if (existingChannel) {
                    return interaction.editReply(`❌ Vous avez déjà un signalement en cours : ${existingChannel}`);
                }

                const staffRole = Database.get('staffRole');
                const permissionOverwrites = [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles] }
                ];

                if (staffRole) {
                    permissionOverwrites.push({
                        id: staffRole,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
                    });
                }

                const ticketChannel = await interaction.guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: ticketCategory,
                    permissionOverwrites: permissionOverwrites
                });

                const embed = new EmbedBuilder()
                    .setTitle(`🐛 Signalement de Bug - ${interaction.user.tag}`)
                    .setDescription(
                        "Merci d'avoir signalé un problème ! 🙏\n\n" +
                        "**Pour nous aider à résoudre le bug, veuillez nous fournir :**\n" +
                        "• 📝 Une description détaillée du bug\n" +
                        "• 🔄 Les étapes pour le reproduire\n" +
                        "• 📸 Des captures d'écran si possible\n" +
                        "• 💻 Votre environnement (OS, navigateur, version du site, etc.)\n" +
                        "• 🕐 L'heure approximative où le bug s'est produit"
                    )
                    .setColor(0xe74c3c)
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('close_ticket')
                        .setLabel('Fermer le ticket')
                        .setEmoji('🔒')
                        .setStyle(ButtonStyle.Danger)
                );

                await ticketChannel.send({
                    content: `${interaction.user} ${staffRole ? `<@&${staffRole}>` : ''} 🐛 **Nouveau signalement de bug !**`,
                    embeds: [embed],
                    components: [row]
                });

                return interaction.editReply(`✅ Signalement créé : ${ticketChannel}`);
            } catch (error) {
                console.error('Erreur création bug report:', error);
                return interaction.editReply('❌ Erreur lors de la création.').catch(() => {});
            }
        }

        // ===== FERMETURE DE TICKET (support + bug) =====
        if (interaction.customId === 'close_ticket') {
            await interaction.deferReply({ ephemeral: true });

            try {
                await interaction.editReply("🔒 Fermeture du ticket...");

                const messages = await interaction.channel.messages.fetch({ limit: 100 });
                const transcriptText = messages
                    .reverse()
                    .map(m => `[${m.createdAt.toLocaleString('fr-FR')}] ${m.author?.tag || 'Inconnu'}: ${m.cleanContent || '[inaccessible]'}`)
                    .join('\n');

                const buffer = Buffer.from(transcriptText, 'utf-8');

                const transcriptChannel = Database.get('transcriptChannel');
                if (transcriptChannel) {
                    const transChan = interaction.guild.channels.cache.get(transcriptChannel);
                    if (transChan) {
                        const transcriptEmbed = new EmbedBuilder()
                            .setTitle("📜 Transcript de Ticket")
                            .addFields(
                                { name: "Salon", value: interaction.channel.name, inline: true },
                                { name: "Fermé par", value: interaction.user.tag, inline: true }
                            )
                            .setColor(0xe74c3c)
                            .setTimestamp();

                        await transChan.send({
                            embeds: [transcriptEmbed],
                            files: [{ attachment: buffer, name: `transcript-${interaction.channel.name}.txt` }]
                        });
                    }
                }

                await interaction.editReply('✅ Ticket fermé !');
                setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
            } catch (error) {
                console.error('Erreur fermeture ticket:', error);
                await interaction.editReply('❌ Erreur lors de la fermeture.').catch(() => {});
            }
        }

        if (interaction.customId === 'refresh_status') {
            await interaction.deferReply({ ephemeral: true });
            
            try {
                const statuses = await getAllStatus();
                const embed = createStatusEmbed(statuses);
                await interaction.message.edit({ embeds: [embed], components: [createStatusButtons()] });
                return interaction.editReply('✅ Statut rafraîchi !');
            } catch (error) {
                console.error('Erreur refresh bouton:', error);
                return interaction.editReply('❌ Erreur lors du rafraîchissement.');
            }
        }
    }
});

// --- SYSTÈME DE MISE À JOUR DU STATUT ---
async function updateStatusMessage(channel) {
    const statuses = await getAllStatus();
    const embed = createStatusEmbed(statuses);
    const buttons = createStatusButtons();

    const savedMessageId = Database.get('statusMessageId');
    
    if (savedMessageId) {
        try {
            const message = await channel.messages.fetch(savedMessageId);
            if (message && message.author.id === client.user.id) {
                await message.edit({ embeds: [embed], components: [buttons] });
                return;
            }
        } catch (e) {
            Database.set('statusMessageId', null);
        }
    }

    const newMessage = await channel.send({ embeds: [embed], components: [buttons] });
    Database.set('statusMessageId', newMessage.id);
}

function startStatusInterval() {
    setInterval(async () => {
        if (!client.isReady()) return;
        
        const statusChannelId = Database.get('statusChannel');
        if (!statusChannelId) return;

        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(statusChannelId);
        if (!channel) return;

        try {
            await updateStatusMessage(channel);
        } catch (error) {
            console.error('Erreur mise à jour statut:', error);
        }
    }, 5 * 60 * 1000);
}

// --- JOIN avec auto-rôle ---
client.on('guildMemberAdd', async (member) => {
    // --- SYSTÈME AUTO-RÔLE ---
    const autoRoleId = Database.get('autoRole');
    if (autoRoleId) {
        try {
            const role = member.guild.roles.cache.get(autoRoleId);
            if (role) {
                await member.roles.add(role).catch(err => {
                    console.error(`[AUTO-ROLE] Erreur attribution rôle à ${member.user.tag}:`, err.message);
                });
                console.log(`[AUTO-ROLE] ✅ Rôle "${role.name}" attribué à ${member.user.tag}`);
                
                const logEmbed = new EmbedBuilder()
                    .setTitle("🎭 Auto-Rôle Attribué")
                    .setDescription(`Le rôle ${role} a été attribué automatiquement à ${member}.`)
                    .setColor(0x2ecc71)
                    .setTimestamp();
                sendLog(member.guild, logEmbed);
            }
        } catch (e) {
            console.error('[AUTO-ROLE] Erreur générale:', e);
        }
    }

    // --- MESSAGE DE BIENVENUE ---
    const welcomeChannel = Database.get('welcomeChannel');
    if (!welcomeChannel) return;
    const channel = member.guild.channels.cache.get(welcomeChannel);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle("📥 Nouveau membre !")
        .setDescription(`Bienvenue à ${member} sur **${member.guild.name}** ! 🎉\nNous sommes **${member.guild.memberCount}** membres.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setColor(0x2ecc71)
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

client.on('guildMemberRemove', (member) => {
    const welcomeChannel = Database.get('welcomeChannel');
    if (!welcomeChannel) return;
    const channel = member.guild.channels.cache.get(welcomeChannel);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle("📤 Départ d'un membre")
        .setDescription(`**${member.user?.tag || 'Inconnu'}** a quitté le serveur. 😢\nNous sommes **${member.guild.memberCount}** membres.`)
        .setThumbnail(member.user.displayAvatarURL())
        .setColor(0xe74c3c)
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

// --- LOGS ---
function sendLog(guild, embed) {
    const logsChannel = Database.get('logsChannel');
    if (!logsChannel) return;
    const logChan = guild.channels.cache.get(logsChannel);
    if (logChan) logChan.send({ embeds: [embed] }).catch(() => {});
}

client.on('messageCreate', (message) => {
    if (!message.author || message.author.bot || !message.content || !message.content.startsWith(config.prefix)) return;
    const embed = new EmbedBuilder()
        .setTitle("📝 Commande Exécutée")
        .addFields(
            { name: "Auteur", value: `${message.author.tag} (${message.author.id})` },
            { name: "Commande", value: `\`${message.content}\`` },
            { name: "Salon", value: `${message.channel}` }
        )
        .setColor(0x34495e)
        .setTimestamp();
    sendLog(message.guild, embed);
});

client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (!oldMember.premiumSince && newMember.premiumSince) {
        const embed = new EmbedBuilder()
            .setTitle("🚀 Boost Serveur")
            .setDescription(`**${newMember.user?.tag || 'Inconnu'}** vient de booster le serveur ! 💎`)
            .setColor(0xf1c40f)
            .setTimestamp();
        sendLog(newMember.guild, embed);
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || !member.user) return;
    
    const embed = new EmbedBuilder().setTimestamp();

    if (!oldState.channelId && newState.channelId) {
        embed.setTitle("🔊 Connexion Vocal")
             .setDescription(`**${member.user.tag}** a rejoint ${newState.channel}`)
             .setColor(0x2ecc71);
        sendLog(member.guild, embed);
    } else if (oldState.channelId && !newState.channelId) {
        embed.setTitle("🔇 Déconnexion Vocal")
             .setDescription(`**${member.user.tag}** a quitté ${oldState.channel}`)
             .setColor(0xe74c3c);
        sendLog(member.guild, embed);
    } else if (oldState.channelId !== newState.channelId) {
        embed.setTitle("🔄 Changement Vocal")
             .setDescription(`**${member.user.tag}** : ${oldState.channel} → ${newState.channel}`)
             .setColor(0x3498db);
        sendLog(member.guild, embed);
    }
});

client.on('messageUpdate', (oldMessage, newMessage) => {
    if (!oldMessage.author || !newMessage.author) return;
    if (oldMessage.author.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const embed = new EmbedBuilder()
        .setTitle("✏️ Message Modifié")
        .addFields(
            { name: "Auteur", value: `${oldMessage.author.tag}` },
            { name: "Salon", value: `${oldMessage.channel}` },
            { name: "Avant", value: oldMessage.content || "*vide*" },
            { name: "Après", value: newMessage.content || "*vide*" }
        )
        .setColor(0xe67e22)
        .setTimestamp();
    sendLog(oldMessage.guild, embed);
});

client.on('messageDelete', (message) => {
    if (!message.author || message.author.bot) return;
    const embed = new EmbedBuilder()
        .setTitle("🗑️ Message Supprimé")
        .addFields(
            { name: "Auteur", value: `${message.author.tag}` },
            { name: "Salon", value: `${message.channel}` },
            { name: "Contenu", value: message.content || "*vide ou non en cache*" }
        )
        .setColor(0xe74c3c)
        .setTimestamp();
    sendLog(message.guild, embed);
});

client.on('channelCreate', (channel) => {
    if (!channel.guild) return;
    const embed = new EmbedBuilder()
        .setTitle("➕ Salon Créé")
        .setDescription(`**${channel.name}**`)
        .setColor(0x2ecc71)
        .setTimestamp();
    sendLog(channel.guild, embed);
});

client.on('channelUpdate', (oldChannel, newChannel) => {
    if (oldChannel.name === newChannel.name) return;
    const embed = new EmbedBuilder()
        .setTitle("✏️ Salon Modifié")
        .setDescription(`${oldChannel.name} → **${newChannel.name}**`)
        .setColor(0xe67e22)
        .setTimestamp();
    sendLog(newChannel.guild, embed);
});

client.on('roleCreate', (role) => {
    const embed = new EmbedBuilder()
        .setTitle("➕ Rôle Créé")
        .setDescription(`**${role.name}**`)
        .setColor(0x2ecc71)
        .setTimestamp();
    sendLog(role.guild, embed);
});

client.on('roleUpdate', (oldRole, newRole) => {
    if (oldRole.name === newRole.name) return;
    const embed = new EmbedBuilder()
        .setTitle("✏️ Rôle Modifié")
        .setDescription(`${oldRole.name} → **${newRole.name}**`)
        .setColor(0xe67e22)
        .setTimestamp();
    sendLog(newRole.guild, embed);
});

// --- GESTION DES RÉACTIONS ---
client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Erreur fetch réaction:', error);
            return;
        }
    }

    if (reaction.emoji.id === '1535995172419272774' && reaction.message.author.id === client.user.id) {
        console.log(`${user.tag} a réagi au règlement !`);
        
        const logEmbed = new EmbedBuilder()
            .setTitle("📜 Règlement Accepté")
            .setDescription(`${user} a accepté le règlement.`)
            .setColor(0x2ecc71)
            .setTimestamp();
        sendLog(reaction.message.guild, logEmbed);
    }
});

// --- LANCEMENT ---
client.login(config.token);