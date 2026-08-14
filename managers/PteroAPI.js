const https = require('https');
const http = require('http');

const PTeroPanelURL = process.env.PTERO_PANEL_URL || 'https://panel.orinstone.deepstone.fr';
const PTeroAPIKey = process.env.PTERO_API_KEY;
const PTeroServerID = process.env.PTERO_SERVER_ID;

class PteroAPI {

    /**
     * Requête vers l'API Pterodactyl
     */
    static request(method, endpoint, body = null) {
        return new Promise((resolve, reject) => {
            if (!PTeroAPIKey || !PTeroServerID) {
                return reject(new Error('PTERO_API_KEY ou PTERO_SERVER_ID non configuré'));
            }

            const url = new URL(`/api/client/servers/${PTeroServerID}${endpoint}`, PTeroPanelURL);
            const isHttps = url.protocol === 'https:';
            const client = isHttps ? https : http;

            const options = {
                hostname: url.hostname,
                port: url.port || (isHttps ? 443 : 80),
                path: url.pathname + url.search,
                method,
                headers: {
                    'Authorization': `Bearer ${PTeroAPIKey}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                rejectUnauthorized: false // Pour les certificats auto-signés
            };

            const req = client.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({ success: true, status: res.statusCode, data: data ? JSON.parse(data) : null });
                    } else {
                        reject(new Error(`API Pterodactyl HTTP ${res.statusCode}: ${data}`));
                    }
                });
            });

            req.on('error', (e) => reject(new Error(`Erreur réseau Pterodactyl: ${e.message}`)));

            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    }

    /**
     * Redémarrer le serveur
     */
    static async restart() {
        return this.request('POST', '/power', { signal: 'restart' });
    }

    /**
     * Arrêter proprement le serveur
     */
    static async stop() {
        return this.request('POST', '/power', { signal: 'stop' });
    }

    /**
     * Tuer le serveur (force kill)
     */
    static async kill() {
        return this.request('POST', '/power', { signal: 'kill' });
    }

    /**
     * Envoyer une commande au terminal du serveur
     */
    static async sendCommand(command) {
        return this.request('POST', '/command', { command });
    }

    /**
     * Récupérer les détails du serveur
     */
    static async getServerDetails() {
        return this.request('GET', '');
    }

    /**
     * Récupérer l'utilisation des ressources
     */
    static async getResources() {
        return this.request('GET', '/resources');
    }

    /**
     * Vérifier si l'API est configurée
     */
    static isConfigured() {
        return !!(PTeroAPIKey && PTeroServerID);
    }
}

module.exports = PteroAPI;