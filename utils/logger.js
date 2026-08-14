const { EmbedBuilder } = require('discord.js');
const Database = require('../managers/Database');

/**
 * Codes couleur par niveau de log
 */
const LOG_COLORS = {
    info: 0x3498db,      // Bleu
    success: 0x2ecc71,   // Vert
    warn: 0xf39c12,      // Orange
    error: 0xe74c3c,     // Rouge
    moderation: 0x9b59b6 // Violet
};

/**
 * Emojis par niveau de log
 */
const LOG_EMOJIS = {
    info: 'ℹ️',
    success: '✅',
    warn: '⚠️',
    error: '❌',
    moderation: '🔨'
};

class Logger {
    /**
     * Log console avec horodatage et couleur
     * @param {string} level - info|success|warn|error|moderation
     * @param {string} message
     * @param {string} [context] - Module ou commande source
     */
    static console(level, message, context = '') {
        const timestamp = new Date().toLocaleString('fr-FR');
        const prefix = context ? `[${context}]` : '';
        const tag = `[${timestamp}] [${level.toUpperCase()}] ${prefix}`;

        switch (level) {
            case 'error': console.error(`${tag} ${message}`); break;
            case 'warn': console.warn(`${tag} ${message}`); break;
            default: console.log(`${tag} ${message}`); break;
        }
    }

    /**
     * Envoie un embed de log dans le salon configuré
     * @param {Guild} guild - Le serveur Discord
     * @param {Object} options
     * @param {string} options.title - Titre de l'embed
     * @param {string} [options.description] - Description
     * @param {Array} [options.fields] - Champs de l'embed
     * @param {string} [options.level='info'] - Niveau de log
     * @param {string} [options.footer] - Texte du footer
     */
    static async send(guild, { title, description, fields = [], level = 'info', footer }) {
        // Toujours logger en console aussi
        this.console(level, `${title}${description ? ' - ' + description : ''}`, 'DISCORD');

        // Vérifier si les logs sont activés
        if (!Database.isFeatureEnabled('logs')) return;

        const logsChannelId = Database.get('logsChannel');
        if (!logsChannelId) return;

        const channel = guild?.channels?.cache?.get(logsChannelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`${LOG_EMOJIS[level] || ''} ${title}`)
            .setColor(LOG_COLORS[level] || LOG_COLORS.info)
            .setTimestamp();

        if (description) embed.setDescription(description);
        if (fields.length > 0) embed.addFields(fields);
        if (footer) embed.setFooter({ text: footer });

        try {
            await channel.send({ embeds: [embed] });
        } catch (err) {
            // Éviter la boucle infinie si le log échoue
            this.console('error', `Impossible d'envoyer le log Discord: ${err.message}`, 'LOGGER');
        }
    }

    // --- Méthodes raccourcies ---

    static async info(guild, title, description, fields = []) {
        await this.send(guild, { title, description, fields, level: 'info' });
    }

    static async success(guild, title, description, fields = []) {
        await this.send(guild, { title, description, fields, level: 'success' });
    }

    static async warn(guild, title, description, fields = []) {
        await this.send(guild, { title, description, fields, level: 'warn' });
    }

    static async error(guild, title, description, fields = []) {
        await this.send(guild, { title, description, fields, level: 'error' });
    }

    static async moderation(guild, title, description, fields = []) {
        await this.send(guild, { title, description, fields, level: 'moderation' });
    }
}

module.exports = Logger;