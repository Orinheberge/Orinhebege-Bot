const fetch = require('node-fetch');

const CLIENT_ID     = process.env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI  = `${process.env.PANEL_BASE_URL || 'http://localhost:26162'}/api/auth/callback`;
const ALLOWED_ROLES = (process.env.PANEL_ALLOWED_ROLES || '').split(',').map(r => r.trim()).filter(Boolean);
const GUILD_ID      = process.env.DISCORD_GUILD_ID;

// Stockage temporaire des states OAuth2 (anti-CSRF)
const pendingStates = new Map();

// Sessions actives (token -> { user, guildMember, expiresAt })
const sessions = new Map();

const SESSION_DURATION = 24 * 60 * 60 * 1000; // 24 heures

class DiscordAuth {

    // =============================================
    // URL D'AUTHORISATION
    // =============================================

    /**
     * Génère l'URL Discord OAuth2 avec state anti-CSRF
     */
    getAuthorizationUrl(sessionId) {
        const state = this.generateState(sessionId);
        pendingStates.set(state, { createdAt: Date.now(), sessionId });

        // Nettoyer les states expirés (> 10 min)
        setTimeout(() => pendingStates.delete(state), 10 * 60 * 1000);

        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            response_type: 'code',
            scope: 'identify guilds',
            state
        });

        return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    }

    // =============================================
    // CALLBACK OAuth2
    // =============================================

    /**
     * Échange le code contre un token et récupère les infos utilisateur
     */
    async handleCallback(code, state) {
        // Vérifier le state anti-CSRF
        const pending = pendingStates.get(state);
        if (!pending) {
            throw new Error('State invalide ou expiré. Recommencez la connexion.');
        }
        pendingStates.delete(state);

        // Échanger le code contre un token
        const tokenData = await this.exchangeCode(code);
        if (!tokenData.access_token) {
            throw new Error('Échec de l\'échange du code OAuth2');
        }

        // Récupérer les infos utilisateur
        const user = await this.fetchUser(tokenData.access_token);

        // Vérifier que l'utilisateur est sur le serveur
        const guildMember = await this.fetchGuildMember(tokenData.access_token, user.id);
        if (!guildMember) {
            throw new Error('Vous devez être membre du serveur Orinstone pour accéder au panel.');
        }

        // Vérifier les rôles autorisés
        if (!this.hasAllowedRole(guildMember)) {
            const roleNames = ALLOWED_ROLES.length > 0
                ? `Rôles requis : ${ALLOWED_ROLES.join(', ')}`
                : 'Aucun rôle configuré. Contactez un administrateur.';
            throw new Error(`Accès refusé. ${roleNames}`);
        }

        // Créer la session
        const sessionToken = this.generateSessionToken();
        sessions.set(sessionToken, {
            user: {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar,
                globalName: user.global_name
            },
            guildMember: {
                roles: guildMember.roles,
                nick: guildMember.nick,
                joinedAt: guildMember.joined_at
            },
            expiresAt: Date.now() + SESSION_DURATION,
            createdAt: new Date().toISOString()
        });

        console.log(`[AUTH] ✅ ${user.username} (${user.id}) connecté au panel`);

        return { sessionToken, user };
    }

    // =============================================
    // VÉRIFICATION DE SESSION
    // =============================================

    /**
     * Vérifie si un token de session est valide
     */
    verifySession(token) {
        if (!token) return null;
        const session = sessions.get(token);
        if (!session) return null;
        if (Date.now() > session.expiresAt) {
            sessions.delete(token);
            return null;
        }
        return session;
    }

    /**
     * Détruit une session
     */
    destroySession(token) {
        const session = sessions.get(token);
        if (session) {
            console.log(`[AUTH] 🔌 ${session.user.username} déconnecté du panel`);
        }
        sessions.delete(token);
    }

    /**
     * Nettoie les sessions expirées (à appeler périodiquement)
     */
    cleanupSessions() {
        const now = Date.now();
        for (const [token, session] of sessions) {
            if (now > session.expiresAt) {
                sessions.delete(token);
            }
        }
    }

    // =============================================
    // API DISCORD
    // =============================================

    async exchangeCode(code) {
        const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: REDIRECT_URI
            }).toString()
        });
        return res.json();
    }

    async fetchUser(accessToken) {
        const res = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) throw new Error('Impossible de récupérer les infos utilisateur');
        return res.json();
    }

    async fetchGuildMember(accessToken, userId) {
        try {
            // Méthode 1 : Via l'API OAuth2 (nécessite le scope guilds.members.read)
            const res = await fetch(`https://discord.com/api/users/@me/guilds/${GUILD_ID}/member`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (res.ok) return res.json();
        } catch (e) {}

        try {
            // Méthode 2 : Via le bot token (fallback)
            const botToken = process.env.DISCORD_TOKEN;
            if (!botToken) return null;

            const res = await fetch(`https://discord.com/api/guilds/${GUILD_ID}/members/${userId}`, {
                headers: { Authorization: `Bot ${botToken}` }
            });
            if (res.ok) return res.json();
        } catch (e) {}

        return null;
    }

    hasAllowedRole(guildMember) {
        if (!ALLOWED_ROLES.length) return true; // Si aucun rôle configuré, tout le monde du serveur peut accéder
        return guildMember.roles.some(roleId => ALLOWED_ROLES.includes(roleId));
    }

    // =============================================
    // UTILITAIRES
    // =============================================

    generateState(sessionId) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 32; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    generateSessionToken() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 64; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    /**
     * Retourne l'URL de l'avatar Discord
     */
    static getAvatarURL(user) {
        if (!user.avatar) {
            const defaultIndex = parseInt(user.discriminator || '0') % 5;
            return `https://cdn.discordapp.com/embed/avatars/${defaultIndex}.png`;
        }
        const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=128`;
    }
}

module.exports = new DiscordAuth();