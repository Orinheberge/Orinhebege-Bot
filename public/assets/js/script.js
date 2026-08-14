const Panel = {
    token: null,
    _notifyTimeout: null,

    init() {
        this.token = localStorage.getItem('panelToken');
        this.highlightActiveNav();
        this.setupKeyboardShortcuts();
        this.loadUserInfo();
    },

    async loadUserInfo() {
        try {
            const res = await fetch('/api/auth/me', { credentials: 'include' });
            if (!res.ok) return;
            const data = await res.json();
            if (!data.success) return;
            const nav = document.getElementById('userNav');
            const avatar = document.getElementById('userAvatar');
            const name = document.getElementById('userName');
            if (nav && data.user) {
                nav.classList.remove('hidden');
                nav.classList.add('flex');
                if (avatar) avatar.src = data.avatar;
                if (name) name.textContent = data.user.globalName || data.user.username;
            }
        } catch (e) {}
    },

    highlightActiveNav() {
        const current = window.location.pathname.replace(/\/$/, '') || '/';
        document.querySelectorAll('.nav-link').forEach(link => {
            try {
                const href = link.getAttribute('href');
                if (!href) return;
                const linkPath = new URL(href, window.location.origin).pathname.replace(/\/$/, '') || '/';
                link.classList.toggle('active', linkPath === current);
            } catch (e) {}
        });
    },

    logout() {
        localStorage.removeItem('panelToken');
        this.token = null;
        window.location.href = '/api/auth/logout';
    },

    notify(message, type = 'success', duration = 3000) {
        const notif = document.getElementById('notification');
        if (!notif) return;
        if (this._notifyTimeout) { clearTimeout(this._notifyTimeout); this._notifyTimeout = null; }
        const cfg = { success: { bg: 'bg-green-500', icon: 'fa-circle-check' }, error: { bg: 'bg-red-500', icon: 'fa-circle-xmark' }, info: { bg: 'bg-blue-500', icon: 'fa-circle-info' }, warning: { bg: 'bg-yellow-500', icon: 'fa-triangle-exclamation' } };
        const { bg, icon } = cfg[type] || cfg.info;
        notif.innerHTML = `<i class="fa-solid ${icon} mr-2"></i>${message}`;
        notif.className = `fixed top-20 right-6 z-50 text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-1 transition-all duration-300 ${bg}`;
        notif.style.opacity = '1'; notif.style.transform = 'translateY(0)'; notif.classList.remove('hidden');
        if (duration > 0) { this._notifyTimeout = setTimeout(() => { notif.style.opacity = '0'; notif.style.transform = 'translateY(-10px)'; setTimeout(() => notif.classList.add('hidden'), 300); }, duration); }
    },

    async api(url, options = {}) {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const token = this.token || localStorage.getItem('panelToken');
        if (token) headers['X-Panel-Token'] = token;
        try {
            const res = await fetch(url, { ...options, headers, credentials: 'include' });
            if (res.status === 401) { this.notify('Session expirée...', 'warning', 1500); setTimeout(() => this.logout(), 1500); throw new Error('Session expirée'); }
            if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
            return await res.json();
        } catch (e) { if (e.message === 'Session expirée') throw e; console.error('[API]', e.message); throw e; }
    },

    formatUptime(s) { const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return `${d > 0 ? d + 'j ' : ''}${h}h ${m}m`; },
    formatNumber(n) { return Number(n).toLocaleString('fr-FR'); },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { const n = document.getElementById('notification'); if (n && !n.classList.contains('hidden')) { n.style.opacity = '0'; setTimeout(() => n.classList.add('hidden'), 300); } }
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const pub = ['/login/', '/login'];
    const cur = window.location.pathname;
    if (!pub.some(p => cur === p || cur === p.replace(/\/$/, ''))) {
        const hasLS = !!localStorage.getItem('panelToken');
        const hasCookie = document.cookie.split(';').some(c => c.trim().startsWith('panelToken=') || c.trim().startsWith('panelSession='));
        if (!hasLS && !hasCookie) { window.location.href = '/login/'; return; }
    }
    Panel.init();
});

window.Panel = Panel;
window.logout = () => Panel.logout();