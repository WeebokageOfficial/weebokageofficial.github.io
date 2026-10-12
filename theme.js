(() => {
    'use strict';
    const assetBase = new URL('.', document.currentScript.src);
    const dialoguePools = {
        miku: [
            "Yay! I knew you'd come back to me! Let's do our best together! 🩵",
            "You changed your mind! I'm so happy to be your partner again! 🩵",
            "Hehe, missed me? Miku System 01 is re-engaged and ready! 🩵",
            "Aww, thank you for switching back! Let's make today magical! 🩵"
        ],
        teto: [
            "Took you long enough to realize who's boss! Welcome to the winning team! 🥖",
            "Ha! Crawling back already? I knew you couldn't resist my power! 🥖",
            "Finally, some good taste! Don't you dare switch away again, operator! 🥖",
            "Hmph! Took you a while, but at least you came to your senses! Let's go! 🥖"
        ]
    };
    // Warm the sprite cache in the document that owns the fullscreen overlay.
    const sprites = {};
    if (window.parent === window) {
        for (const theme of ['miku', 'teto']) {
            const sprite = new Image();
            sprite.src = new URL(`assets/${theme}_victory.png`, assetBase).href;
            sprites[theme] = sprite;
        }
    }
    const lastLine = {};
    let activeOverlay;
    let fadeTimer;
    let cleanupTimer;
    let loadTimer;
    function clearVictory() {
        window.clearTimeout(fadeTimer);
        window.clearTimeout(cleanupTimer);
        window.clearTimeout(loadTimer);
        activeOverlay?.remove();
        activeOverlay = null;
    }
    function triggerThemeSwitchVictory(newTheme) {
        if (!dialoguePools[newTheme]) return;
        // The outer shell owns the overlay, even when the switch comes from an iframe.
        if (window.parent !== window && window.parent.triggerThemeSwitchVictory) {
            window.parent.triggerThemeSwitchVictory(newTheme);
            return;
        }
        const splash = document.getElementById('theme-splash-overlay');
        if (splash && !splash.hidden) return;
        clearVictory();
        const pool = dialoguePools[newTheme].filter(line => line !== lastLine[newTheme]);
        const line = pool[Math.floor(Math.random() * pool.length)];
        lastLine[newTheme] = line;
        const overlay = document.createElement('div');
        overlay.id = 'theme-switch-overlay';
        overlay.dataset.victoryTheme = newTheme;
        overlay.setAttribute('role', 'status');
        overlay.setAttribute('aria-live', 'polite');
        overlay.innerHTML = '<section class="splash-victory-stage"><div class="victory-content"><img class="victory-sprite" alt=""><div class="victory-dialog"><span class="victory-speaker"></span><p class="victory-line"></p></div></div></section>';
        overlay.querySelector('img').src = new URL(`assets/${newTheme}_victory.png`, assetBase).href;
        overlay.querySelector('.victory-speaker').textContent = newTheme === 'miku' ? 'HATSUNE MIKU // 01' : 'KASANE TETO // 02';
        overlay.querySelector('.victory-line').textContent = line;
        activeOverlay = overlay;
        let started = false;
        const start = () => {
            if (activeOverlay !== overlay || started) return;
            started = true;
            window.clearTimeout(loadTimer);
            document.body.appendChild(overlay);
            fadeTimer = window.setTimeout(() => {
                overlay.classList.add('is-closing');
                cleanupTimer = window.setTimeout(clearVictory, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 600);
            }, 2400);
        };
        // Decode before starting the short animation; a failed image never blocks it.
        const sprite = sprites[newTheme] || overlay.querySelector('img');
        loadTimer = window.setTimeout(start, 1200);
        if (sprite.decode) sprite.decode().then(start, start);
        else start();
    }
    window.triggerThemeSwitchVictory = triggerThemeSwitchVictory;
    function syncTheme() {
        const theme = document.documentElement.dataset.theme === 'teto' ? 'teto' : 'miku';
        document.body.classList.remove('theme-miku', 'theme-teto');
        document.body.classList.add(`theme-${theme}`);
        try { localStorage.setItem('weebokage_current_theme', theme); } catch (_) { /* In-memory theme remains active. */ }
    }
    new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    syncTheme();
    window.addEventListener('pagehide', clearVictory);
})();
