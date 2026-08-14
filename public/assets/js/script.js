/**
 * Orinstone Panel - Script Principal
 * Gère l'authentification, la navigation et les utilitaires partagés
 */

const Panel = {
    token: null,

    /**
     * Initialisation au chargement de la page
     */
    init() {
        this.token = localStorage.getItem('panelToken');
        this.injectTokenInNavLinks();
        this.highlightActiveNav();
        this.setupAutoRefresh();
    },

    /**
     * Injecte le token dans tous les liens de navigation
     */
    injectTokenInNavLinks() {
        if (!this.token) return;
        document.querySelectorAll('.nav-link, [data-auth-link]').forEach(link => {
            try {
                const url = new URL(link.href, window.location.origin);
                url.searchParams.set('token', this.token);
                link.href = url.toString();
            } catch (e) { /* URL invalide, ignorer */ }
        });
    },

    /**
     * Met en surbrillance le lien de navigation actif
     */
    highlightActiveNav() {
        const currentPath = window.location.pathname;
        document.querySelectorAll('.nav-link').forEach(link => {
            const linkPath = new URL(link.href, window.location.origin).pathname;
            if (linkPath === currentPath || (currentPath === '/' && linkPath === '/')) {
                link.classList.add('active');
            }
        });
    },

    /**
     * Déconnexion
     */
    logout() {
        localStorage.removeItem('panelToken');
        window.location.href = '/login.html';
    },

    /**
     * Affiche une notification toast
     * @param {string} message
     * @param {'success'|'error'|'info'} type
     * @param {number} duration - ms
     */
    notify(message, type = 'success', duration = 2500) {
        const notif = document.getElementById('notification');
        if (!notif) return;

        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500'
        };

        notif.textContent = message;
        notif.className = `fixed top-20 right-6 z-50 text-white px-6 py-3 rounded-lg shadow-lg fade-in ${colors[type] || colors.info}`;
        notif.classList.remove('hidden');

        setTimeout(() => {
            notif.classList.add('hidden');
        }, duration);
    },

    /**
     * Requête API authentifiée
     * @param {string} url
     * @param {Object} options - fetch options
     * @returns {Promise<Object>}
     */
    async api(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Panel-Token': this.token,
            ...(options.headers || {})
        };

        const separator = url.includes('?') ? '&' : '?';
        const fullUrl = `${url}${separator}token=${encodeURIComponent(this.token)}`;

        const res = await fetch(fullUrl, { ...options, headers });

        if (res.status === 401) {
            this.logout();
            throw new Error('Session expirée');
        }

        return res.json();
    },

    /**
     * Auto-refresh optionnel pour certaines pages
     */
    setupAutoRefresh() {
        // Peut être étendu par les pages individuelles
    }
};

// Vérification d'authentification globale
document.addEventListener('DOMContentLoaded', () => {
    const publicPages = ['/login/'];
    const currentPath = window.location.pathname;

    if (!publicPages.includes(currentPath)) {
        const token = localStorage.getItem('panelToken');
        if (!token) {
            window.location.href = '/login/';
            return;
        }
    }

    Panel.init();
});

// Exposer globalement pour les onclick HTML
window.Panel = Panel;
window.logout = () => Panel.logout();