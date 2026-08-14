/**
 * Orinstone Panel - Script Principal v2.1
 * Authentification via cookies + localStorage fallback
 */

const Panel = {
    token: null,
    _notifyTimeout: null,

    // =============================================
    // INITIALISATION
    // =============================================
    init() {
        // Essayer de récupérer le token depuis localStorage
        this.token = localStorage.getItem('panelToken');
        
        // Si pas de token localStorage, vérifier si on est authentifié via cookie
        // en faisant un appel API test
        if (!this.token) {
            this.verifyCookieAuth();
        } else {
            this.injectTokenInNavLinks();
            this.highlightActiveNav();
            this.setupKeyboardShortcuts();
        }
    },

    /**
     * Vérifie si le cookie d'authentification est valide
     */
    async verifyCookieAuth() {
        try {
            const res = await fetch('/api/config', {
                credentials: 'include'
            });
            
            if (res.ok) {
                // Cookie valide, on peut continuer
                this.injectTokenInNavLinks();
                this.highlightActiveNav();
                this.setupKeyboardShortcuts();
                
                // Déclencher un événement pour que les pages sachent qu'on est auth
                document.dispatchEvent(new CustomEvent('panel:authenticated'));
            } else {
                // Cookie invalide ou expiré
                this.logout();
            }
        } catch (e) {
            console.error('[Panel] Erreur vérification auth:', e);
            this.logout();
        }
    },

    // =============================================
    // AUTHENTIFICATION
    // =============================================
    isAuthenticated() {
        return !!localStorage.getItem('panelToken') || this.hasValidCookie();
    },

    /**
     * Vérifie synchronement si un cookie panelToken existe
     */
    hasValidCookie() {
        return document.cookie.split(';').some(c => c.trim().startsWith('panelToken='));
    },

    logout() {
        localStorage.removeItem('panelToken');
        this.token = null;
        
        // Supprimer le cookie côté serveur
        fetch('/api/logout', { credentials: 'include' })
            .finally(() => {
                window.location.href = '/login/';
            });
    },

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
    injectTokenInNavLinks() {
        // Avec les cookies, plus besoin d'injecter le token dans les URLs
        // Mais on garde pour compatibilité avec l'ancien système
        const token = this.token || localStorage.getItem('panelToken');
        if (!token) return;

        document.querySelectorAll('.nav-link, [data-auth-link]').forEach(link => {
            try {
                const href = link.getAttribute('href');
                if (!href || href.startsWith('http') || href.startsWith('#')) return;

                const url = new URL(href, window.location.origin);
                if (!url.searchParams.has('token')) {
                    url.searchParams.set('token', token);
                    link.href = url.toString();
                }
            } catch (e) {}
        });
    },

    highlightActiveNav() {
        const currentPath = window.location.pathname.replace(/\/$/, '') || '/';

        document.querySelectorAll('.nav-link').forEach(link => {
            try {
                const href = link.getAttribute('href');
                if (!href) return;

                const linkPath = new URL(href, window.location.origin).pathname.replace(/\/$/, '') || '/';
                link.classList.toggle('active', linkPath === currentPath);
            } catch (e) {}
        });
    },

    // =============================================
    // NOTIFICATIONS
    // =============================================
    notify(message, type = 'success', duration = 3000) {
        const notif = document.getElementById('notification');
        if (!notif) return;

        if (this._notifyTimeout) {
            clearTimeout(this._notifyTimeout);
            this._notifyTimeout = null;
        }

        const config = {
            success: { bg: 'bg-green-500', icon: 'fa-circle-check' },
            error:   { bg: 'bg-red-500', icon: 'fa-circle-xmark' },
            info:    { bg: 'bg-blue-500', icon: 'fa-circle-info' },
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
    async api(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        // Ajouter le token header si disponible
        const token = this.token || localStorage.getItem('panelToken');
        if (token) {
            headers['X-Panel-Token'] = token;
        }

        try {
            const res = await fetch(url, {
                ...options,
                headers,
                credentials: 'include' // ✅ Envoie automatiquement les cookies
            });

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

    formatNumber(num) {
        return Number(num).toLocaleString('fr-FR');
    },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
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

    setupAutoRefresh() {}
};

// =============================================
// VÉRIFICATION D'AUTHENTIFICATION GLOBALE
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    const publicPages = ['/login/', '/login'];
    const currentPath = window.location.pathname;

    const isPublicPage = publicPages.some(p =>
        currentPath === p || currentPath === p.replace(/\/$/, '')
    );

    if (!isPublicPage) {
        // Vérifier localStorage OU cookie
        const hasLocalStorage = !!localStorage.getItem('panelToken');
        const hasCookie = document.cookie.split(';').some(c => c.trim().startsWith('panelToken='));
        
        if (!hasLocalStorage && !hasCookie) {
            window.location.href = '/login/';
            return;
        }
    }

    Panel.init();
});

// =============================================
// EXPOSITION GLOBALE
// =============================================
window.Panel = Panel;
window.logout = () => Panel.logout();