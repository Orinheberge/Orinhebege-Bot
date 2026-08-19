const https = require('https');
const http = require('http');
const net = require('net');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('./Database');

const SERVICES = [
    { name: 'Hébergement Web', url: 'https://heberge.orinstone.deepstone.fr', type: 'url' },
    { name: 'Panel de Gestion', url: 'https://panel.orinstone.deepstone.fr', type: 'url' },
    { name: 'Node Orinstone', host: 'node.orinstone.deepstone.fr', port: 8080, type: 'ping' },
    { name: 'PHPMYADMIN', url: 'https://php.orinstone.deepstone.fr', type: 'url' }
];

class StatusChecker {
    static checkURL(url) {
        return new Promise((resolve) => {
            const start = Date.now();
            const clientHttp = url.startsWith('https') ? https : http;
            const req = clientHttp.get(url, { timeout: 5000 }, (res) => {
                res.on('data', () => {});
                res.on('end', () => resolve({ online: res.statusCode >= 200 && res.statusCode < 400, responseTime: Date.now() - start, statusCode: res.statusCode }));
            });
            req.on('error', () => resolve({ online: false, responseTime: null, statusCode: null }));
            req.on('timeout', () => { req.destroy(); resolve({ online: false, responseTime: null, statusCode: null }); });
        });
    }

    static pingServer(host, port = 80) {
        return new Promise((resolve) => {
            const start = Date.now();
            const socket = new net.Socket();
            socket.setTimeout(5000);
            socket.connect(port, host, () => { socket.destroy(); resolve({ online: true, responseTime: Date.now() - start }); });
            socket.on('error', () => { socket.destroy(); resolve({ online: false, responseTime: null }); });
            socket.on('timeout', () => { socket.destroy(); resolve({ online: false, responseTime: null }); });
        });
    }

    static async getAllStatus() {
        const results = [];
        for (const service of SERVICES) {
            try {
                const result = service.type === 'url' 
                    ? await this.checkURL(service.url) 
                    : await this.pingServer(service.host, service.port);
                results.push({ ...service, ...result });
            } catch (e) {
                results.push({ ...service, online: false, responseTime: null, statusCode: null });
            }
        }
        return results;
    }

    static createStatusEmbed(statuses) {
        const allOnline = statuses.every(s => s.online);
        const someOnline = statuses.some(s => s.online);
        const color = allOnline ? 0x2ecc71 : (someOnline ? 0xf39c12 : 0xe74c3c);
        const emoji = allOnline ? '✅' : (someOnline ? '⚠️' : '❌');

        const embed = new EmbedBuilder()
            .setTitle(`${emoji} Statut des Services`)
            .setDescription(`**État global :** ${allOnline ? 'Tous opérationnels' : (someOnline ? 'Dégradé' : 'Hors ligne')}`)
            .setColor(color).setTimestamp().setFooter({ text: 'Dernière vérification' });

        for (const s of statuses) {
            let value = `**Statut :** ${s.online ? '🟢 En ligne' : '🔴 Hors ligne'}`;
            if (s.responseTime) value += `\n**Latence :** ${s.responseTime}ms`;
            if (s.url) value += `\n**URL :** [${s.url.replace(/^https?:\/\//, '')}](${s.url})`;
            embed.addFields({ name: s.name, value, inline: false });
        }
        return embed;
    }

    static createStatusButtons() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('refresh_status').setLabel('Rafraîchir').setEmoji('🔄').setStyle(ButtonStyle.Secondary)
        );
    }
      static async updateStatusMessage(channel) {
        const statuses = await this.getAllStatus();
        const embed = this.createStatusEmbed(statuses);
        const buttons = this.createStatusButtons();
        const savedId = Database.get('statusMessageId');

        if (savedId) {
            try {
                // On essaie de récupérer le message existant
                const msg = await channel.messages.fetch(savedId);
                
                // Vérification de sécurité : on s'assure que c'est bien notre bot qui a envoyé le message
                if (msg && msg.author.id === channel.client.user.id) {
                    // MODIFICATION ICI : On édite le message existant
                    await msg.edit({ embeds: [embed], components: [buttons] });
                    return; // On s'arrête ici, pas besoin d'en créer un nouveau
                }
            } catch (e) {
                // Si le message n'existe plus (erreur 404 ou autre), on continue pour en créer un nouveau
                console.log("Ancien message de statut introuvable, création d'un nouveau...");
                Database.set('statusMessageId', null); // On reset l'ID car il est invalide
            }
        }

        // Si aucun ID sauvegardé ou si l'ancien message était invalide, on envoie un NOUVEAU message
        const newMsg = await channel.send({ embeds: [embed], components: [buttons] });
        Database.set('statusMessageId', newMsg.id);
    }
}

module.exports = StatusChecker;