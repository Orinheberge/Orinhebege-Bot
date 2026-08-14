/**
 * Orinstone Panel - Script Principal v2.0
 * Gère l'authentification, la navigation, les notifications et utilitaires partagés
 */

const Panel = {
    token: null,
    _notifyTimeout: null,

    // =============================================
    // INITIALISATION
    // =============================================

    init() {
        this.token = localStorage.getItem('panelToken');
        this.injectTokenInNavLinks();
        this.highlightActiveNav();
        this.setupKeyboardShortcuts();
        console.log('[Panel] Initialisé');
    },

    // =============================================
    // AUTHENTIFICATION
    // =============================================

    /**
     * Vérifie si l'utilisateur est authentifié
     */
    isAuthenticated() {
        return !!localStorage.getItem('panelToken');
    },

    /**
     * Déconnexion complète
     */
    logout() {
        localStorage.removeItem('panelToken');
        this.token = null;
        window.location.href = '/login/';
    },

    /**
     * Redirige vers login si non authentifié
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = '/login/';
            return false;
        }
        return true;
    },

    // =============================================
    // NAVIGATION
    // =============================================

    /**
     * Injecte le token dans tous les liens de navigation et data-auth-link
     * Supporte les URLs relatives et absolues
     */
    injectTokenInNavLinks() {
        if (!this.token) return;

        document.querySelectorAll('.nav-link, [data-auth-link]').forEach(link => {
            try {
                const href = link.getAttribute('href');
                if (!href || href.startsWith('http') || href.startsWith('#')) return;

                const url = new URL(href, window.location.origin);
                // Ne pas écraser un token déjà présent
                if (!url.searchParams.has('token')) {
                    url.searchParams.set('token', this.token);
                    link.href = url.toString();
                }
            } catch (e) {
                // URL invalide, ignorer silencieusement
            }
        });
    },

    /**
     * Met en surbrillance le lien de navigation actif
     * Gère les chemins avec et sans slash final
     */
    highlightActiveNav() {
        const currentPath = window.location.pathname.replace(/\/$/, '') || '/';

        document.querySelectorAll('.nav-link').forEach(link => {
            try {
                const href = link.getAttribute('href');
                if (!href) return;

                const linkPath = new URL(href, window.location.origin).pathname.replace(/\/$/, '') || '/';

                if (linkPath === currentPath) {
                    link.classList.add('active');
                } else {
                    link.classList.remove('active');
                }
            } catch (e) {}
        });
    },

    // =============================================
    // NOTIFICATIONS
    // =============================================

    /**
     * Affiche une notification toast
     * @param {string} message
     * @param {'success'|'error'|'info'|'warning'} type
     * @param {number} duration - ms (0 = permanent)
     */
    notify(message, type = 'success', duration = 3000) {
        const notif = document.getElementById('notification');
        if (!notif) {
            console.warn('[Panel] #notification introuvable dans le DOM');
            return;
        }

        // Annuler toute notification précédente
        if (this._notifyTimeout) {
            clearTimeout(this._notifyTimeout);
            this._notifyTimeout = null;
        }

        const config = {
            success: { bg: 'bg-green-500',  icon: 'fa-circle-check' },
            error:   { bg: 'bg-red-500',    icon: 'fa-circle-xmark' },
            info:    { bg: 'bg-blue-500',   icon: 'fa-circle-info' },
            warning: { bg: 'bg-yellow-500', icon: 'fa-triangle-exclamation' }
        };

        const { bg, icon } = config[type] || config.info;

        notif.innerHTML = `<i class="fa-solid ${icon} mr-2"></i>${message}`;
        notif.className = `fixed top-20 right-6 z-50 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-1 transition-all duration-300 ${bg}`;
        notif.style.opacity = '1';
        notif.style.transform = 'translateY(0)';
        notif.classList.remove('hidden');

        if (duration > 0) {
            this._notifyTimeout = setTimeout(() => {
                notif.style.opacity = '0';
                notif.style.transform = 'translateY(-10px)';
                setTimeout(() => notif.classList.add('hidden'), 300);
            }, duration);
        }
    },

    // =============================================
    // API
    // =============================================

    /**
     * Requête API authentifiée
     * Gère automatiquement le token, les erreurs 401 et le JSON
     * @param {string} url
     * @param {Object} options - fetch options
     * @returns {Promise<Object>}
     */
    async api(url, options = {}) {
        if (!this.token) {
            this.logout();
            throw new Error('Non authentifié');
        }

        const headers = {
            'Content-Type': 'application/json',
            'X-Panel-Token': this.token,
            ...(options.headers || {})
        };

        // Ajouter le token en query string aussi (pour compatibilité middleware)
        const separator = url.includes('?') ? '&' : '?';
        const fullUrl = `${url}${separator}token=${encodeURIComponent(this.token)}`;

        try {
            const res = await fetch(fullUrl, { ...options, headers });

            if (res.status === 401) {
                this.notify('Session expirée, redirection...', 'warning', 1500);
                setTimeout(() => this.logout(), 1500);
                throw new Error('Session expirée');
            }

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || `Erreur HTTP ${res.status}`);
            }

            return await res.json();

        } catch (error) {
            if (error.message === 'Session expirée') throw error;
            console.error('[Panel API]', error.message);
            throw error;
        }
    },

    // =============================================
    // UTILITAIRES
    // =============================================

    /**
     * Formate un uptime en secondes vers une chaîne lisible
     * @param {number} seconds
     * @returns {string}
     */
    formatUptime(seconds) {
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);

        const parts = [];
        if (d > 0) parts.push(`${d}j`);
        if (h > 0) parts.push(`${h}h`);
        if (m > 0) parts.push(`${m}m`);
        if (s > 0 || parts.length === 0) parts.push(`${s}s`);

        return parts.join(' ');
    },

    /**
     * Formate un nombre avec séparateurs de milliers
     * @param {number} num
     * @returns {string}
     */
    formatNumber(num) {
        return Number(num).toLocaleString('fr-FR');
    },

    /**
     * Raccourci clavier : Ctrl+K → focus recherche (extensible)
     * Escape → fermer notification
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Escape : fermer la notification active
            if (e.key === 'Escape') {
                const notif = document.getElementById('notification');
                if (notif && !notif.classList.contains('hidden')) {
                    notif.style.opacity = '0';
                    notif.style.transform = 'translateY(-10px)';
                    setTimeout(() => notif.classList.add('hidden'), 300);
                    if (this._notifyTimeout) {
                        clearTimeout(this._notifyTimeout);
                        this._notifyTimeout = null;
                    }
                }
            }
        });
    },

    /**
     * Auto-refresh placeholder — à étendre par page
     */
    setupAutoRefresh() {
        // Les pages individuelles appellent setInterval elles-mêmes
        // Cette méthode existe pour une éventuelle centralisation future
    }
};

// =============================================
// VÉRIFICATION D'AUTHENTIFICATION GLOBALE
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    // Pages publiques qui ne nécessitent pas d'authentification
    const publicPages = ['/login/', '/login'];
    const currentPath = window.location.pathname;

    const isPublicPage = publicPages.some(p =>
        currentPath === p || currentPath === p.replace(/\/$/, '')
    );

    if (!isPublicPage) {
        const token = localStorage.getItem('panelToken');
        if (!token) {
            window.location.href = '/login/';
            return;
        }
    }

    Panel.init();
});

// =============================================
// EXPOSITION GLOBALE
// =============================================
window.Panel  = Panel;
window.logout = () => Panel.logout();