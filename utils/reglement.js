const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const REGLEMENT_PATH = path.join(__dirname, '..', 'reglement.json');

class Reglement {
    constructor() {
        this.data = null;
        this.load();
    }

    /**
     * Charge ou recharge le fichier reglement.json
     */
    load() {
        try {
            if (fs.existsSync(REGLEMENT_PATH)) {
                this.data = JSON.parse(fs.readFileSync(REGLEMENT_PATH, 'utf-8'));
                console.log('✅ Règlement chargé avec succès');
            } else {
                console.warn('⚠️ Fichier reglement.json introuvable');
                this.data = null;
            }
        } catch (e) {
            console.error('❌ Erreur de chargement du règlement:', e);
            this.data = null;
        }
    }

    /**
     * Vérifie si le règlement est disponible
     */
    isLoaded() {
        return this.data !== null;
    }

    /**
     * Génère un EmbedBuilder prêt à être envoyé
     * @returns {EmbedBuilder|null}
     */
    createEmbed() {
        if (!this.data) return null;

        const embed = new EmbedBuilder()
            .setTitle(this.data.title || "📜 Règlement")
            .setDescription(this.data.description || "");

        if (this.data.color) embed.setColor(this.data.color);
        if (this.data.thumbnail) embed.setThumbnail(this.data.thumbnail);
        if (this.data.image) embed.setImage(this.data.image);
        if (this.data.url) embed.setURL(this.data.url);

        // Champs dynamiques
        if (Array.isArray(this.data.fields)) {
            for (const field of this.data.fields) {
                embed.addFields({
                    name: field.name || "Champ sans titre",
                    value: field.value || "—",
                    inline: field.inline === true
                });
            }
        }

        // Footer
        if (this.data.footer && this.data.footer.text) {
            const footerObj = { text: this.data.footer.text };
            if (this.data.footer.icon_url) footerObj.iconURL = this.data.footer.icon_url;
            embed.setFooter(footerObj);
        }

        // Timestamp
        if (this.data.timestamp === true || this.data.timestamp === "true") {
            embed.setTimestamp();
        }

        // Auteur
        if (this.data.author) {
            embed.setAuthor({
                name: this.data.author.name || "",
                iconURL: this.data.author.icon_url || null,
                url: this.data.author.url || null
            });
        }

        return embed;
    }

    /**
     * Recharge le règlement à chaud (utile via le panel web ou une commande admin)
     */
    reload() {
        this.load();
        return this.isLoaded();
    }
}

// Export d'une instance unique (singleton)
module.exports = new Reglement();