(() => {
    'use strict';
    let closing = false;
    const victoryTimers = new Set();
    function scheduleVictory(callback, delay) {
        const timer = window.setTimeout(() => { victoryTimers.delete(timer); callback(); }, delay);
        victoryTimers.add(timer);
    }
    let previousFocus;
    let overlay;
    let splashDocument = document;
    function restoreBackground() {
        splashDocument.body.classList.remove('theme-splash-open');
        backgroundElements.forEach((inert, element) => { element.inert = inert; });
        backgroundElements.clear();
    }
    const backgroundElements = new Map();
    const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
    const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* Selection still works without storage. */ } };
    function today() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }
    function syncBody(theme) {
        document.body.classList.remove('theme-miku', 'theme-teto');
        document.body.classList.add(`theme-${theme}`);
        write('weebokage_current_theme', theme);
    }
    function applyTheme(themeName) {
        const theme = themeName === 'teto' ? 'teto' : 'miku';
        syncBody(theme);
        // The shell follows LifeOS preferences, so update them before themechange.
        const core = window.LifeOSCore || window.parent.LifeOSCore;
        core?.update(state => { state.preferences.theme = theme; }, { activity: false });
        if (window.Weebokage) window.Weebokage.setTheme(theme);
        else {
            document.documentElement.dataset.theme = theme;
            write('theme', theme);
            document.dispatchEvent(new CustomEvent('themechange', { detail: theme }));
        }
    }
    function applySavedTheme() {
        applyTheme(read('weebokage_current_theme') || read('theme') || 'miku');
    }
    function selectTheme(themeName) {
        if (!overlay || overlay.hidden || closing || !['miku', 'teto'].includes(themeName)) return;
        closing = true;
        write('weebokage_splash_date', today());
        applyTheme(themeName);
        const stage = overlay.querySelector('#splash-victory-stage');
        const isMiku = themeName === 'miku';
        overlay.dataset.victoryTheme = themeName;
        stage.querySelectorAll('[data-victory-theme]').forEach(sprite => {
            sprite.hidden = sprite.dataset.victoryTheme !== themeName;
        });
        stage.querySelector('.victory-speaker').textContent = isMiku ? 'HATSUNE MIKU // 01' : 'KASANE TETO // 02';
        stage.querySelector('.victory-line').textContent = isMiku
            ? "Thank you so much for choosing me! Miku System 01 is fully initialized. Let's make today incredible together! 🩵"
            : "Hah! As if Miku ever stood a chance. Of course you'd pick me! Now let's get moving, operator! 🥖";
        overlay.querySelectorAll('[data-splash-theme]').forEach(choice => { choice.inert = true; });
        overlay.focus();
        stage.hidden = false;
        overlay.classList.add('is-victory');
        const finish = () => {
            overlay.hidden = true;
            restoreBackground();
            (previousFocus?.isConnected && previousFocus !== document.body ? previousFocus : document.querySelector('.cyber-theme'))?.focus();
        };
        scheduleVictory(() => {
            overlay.classList.add('is-closing');
            scheduleVictory(finish, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600);
        }, 2500);
    }
    function initThemeSplashScreen() {
        applySavedTheme();
        overlay = document.getElementById('theme-splash-overlay');
        if (!overlay || read('weebokage_splash_date') === today()) return;
        // A fixed element inside the content iframe cannot cover the shell UI.
        // Mount the splash in the outer document to cover the entire viewport.
        if (window.parent !== window && window.parent.LifeOSShell) {
            splashDocument = window.parent.document;
            overlay.querySelectorAll('img').forEach(image => { image.src = new URL(image.getAttribute('src'), document.baseURI).href; });
            splashDocument.body.appendChild(overlay);
        }
        previousFocus = splashDocument.activeElement;
        overlay.hidden = false;
        splashDocument.body.classList.add('theme-splash-open');
        for (const element of splashDocument.body.children) {
            if (element === overlay || ['SCRIPT', 'STYLE', 'LINK'].includes(element.tagName)) continue;
            backgroundElements.set(element, element.inert);
            element.inert = true;
        }
        const choices = [...overlay.querySelectorAll('[data-splash-theme]')];
        choices.forEach(choice => choice.addEventListener('click', () => selectTheme(choice.dataset.splashTheme)));
        overlay.addEventListener('keydown', event => {
            if (event.key !== 'Tab') return;
            if (closing) { event.preventDefault(); return; }
            event.preventDefault();
            const index = choices.indexOf(splashDocument.activeElement);
            const next = index < 0 ? (event.shiftKey ? choices.length - 1 : 0) : (index + (event.shiftKey ? choices.length - 1 : 1)) % choices.length;
            choices[next].focus();
        });
        overlay.tabIndex = -1;
        overlay.focus();
    }
    window.addEventListener('pagehide', () => {
        victoryTimers.forEach(timer => window.clearTimeout(timer));
        victoryTimers.clear();
        restoreBackground();
        if (overlay?.ownerDocument !== document) overlay?.remove();
    });
    document.addEventListener('themechange', event => syncBody(event.detail === 'teto' ? 'teto' : 'miku'));
    Object.assign(window, { initThemeSplashScreen, selectTheme, applyTheme, applySavedTheme });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initThemeSplashScreen, { once: true });
    else initThemeSplashScreen();
})();
