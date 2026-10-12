(function () {
    "use strict";

    const REMOTE_API = "https://weebokageofficial-github-io.onrender.com";
    const LOCAL_API = "http://127.0.0.1:10000";
    const params = new URLSearchParams(window.location.search);
    const requestedBackend = params.get("backend");

    if (requestedBackend === "local" || requestedBackend === "remote") {
        localStorage.setItem("backend", requestedBackend);
    }

    const backendMode = localStorage.getItem("backend") || "remote";
    const apiBase = backendMode === "local" ? LOCAL_API : REMOTE_API;
    const firebaseConfig = {
        apiKey: "AIzaSyAj4pBH0zjbCIbUHp0ldmW8eU8pJTZnquo",
        authDomain: "weebokage-296c0.firebaseapp.com",
        projectId: "weebokage-296c0",
        storageBucket: "weebokage-296c0.firebasestorage.app",
        messagingSenderId: "192569800499",
        appId: "1:192569800499:web:4c5ef67242b7fdd0b2b046"
    };

    function initFirebase() {
        if (!window.firebase) throw new Error("Firebase SDK is not loaded.");
        if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
        return firebase.app();
    }

    function escapeHTML(value) {
        return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "'": "&#39;",
            '"': "&quot;"
        })[character]);
    }

    function safeUrl(value, fallback = "") {
        try {
            const url = new URL(String(value), window.location.href);
            if (["https:", "http:"].includes(url.protocol)) return url.href;
        } catch (_) {
            // Invalid URLs use the supplied fallback.
        }
        return fallback;
    }

    function sessionId() {
        let id = sessionStorage.getItem("chat_session_id");
        if (!id) {
            id = window.crypto?.randomUUID?.() || Date.now() + "-" + Math.random().toString(16).slice(2);
            sessionStorage.setItem("chat_session_id", id);
        }
        return id;
    }

    async function authHeaders(includeJson = false) {
        const headers = {};
        if (includeJson) headers["Content-Type"] = "application/json";
        const user = window.firebase?.auth?.().currentUser;
        if (user) headers.Authorization = "Bearer " + await user.getIdToken();
        return headers;
    }

    async function apiFetch(path, options = {}) {
        const { timeout = 65000, headers: suppliedHeaders, ...requestOptions } = options;
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeout);
        try {
            // Public catalogue requests do not need a Firebase token or preflight.
            const needsAuth = path.startsWith("/admin/") || path.startsWith("/hadith/") || path === "/chat" || path === "/lifeos/quote" || path.startsWith("/lifeos/lore-import");
            const headers = new Headers(needsAuth ? await authHeaders(Boolean(options.body)) : {});
            headers.set("Accept", "application/json");
            if (options.body) headers.set("Content-Type", "application/json");
            new Headers(suppliedHeaders).forEach((value, key) => headers.set(key, value));
            const response = await fetch(apiBase + path, {
                ...requestOptions,
                headers,
                signal: controller.signal
            });
            if (!response.ok) {
                let detail = "";
                if (response.headers.get("Content-Type")?.includes("application/json")) {
                    const data = await response.json().catch(() => ({}));
                    if (typeof data.detail === "string") detail = data.detail;
                }
                const fallback = {
                    401: "Please sign in again.",
                    403: "Access denied. Check the account permissions.",
                    429: "Too many requests. Please wait before trying again.",
                    502: "The upstream service is unavailable.",
                    503: "The backend is unavailable or not configured."
                };
                const error = new Error(detail || fallback[response.status] || "Request failed.");
                error.status = response.status;
                throw error;
            }
            return response;
        } catch (error) {
            if (error instanceof TypeError) {
                throw new Error("Cannot reach the API. Check the network, backend availability and CORS settings.");
            }
            throw error;
        } finally {
            window.clearTimeout(timer);
        }
    }

    function setTheme(theme, options = {}) {
        const selected = theme === "teto" ? "teto" : "miku";
        const changed = document.documentElement.dataset.theme !== selected;
        document.documentElement.setAttribute("data-theme", selected);
        document.body?.classList.remove('theme-miku', 'theme-teto');
        document.body?.classList.add(`theme-${selected}`);
        localStorage.setItem('weebokage_current_theme', selected);
        if (options.manual) {
            const core = window.LifeOSCore || window.parent.LifeOSCore;
            core?.update(state => { state.preferences.theme = selected; }, { activity: false });
        }
        localStorage.setItem("theme", selected);
        const toggle = document.getElementById("theme-toggle");
        if (toggle) toggle.checked = selected === "teto";
        const title = document.getElementById("ai-title");
        if (title) title.textContent = selected === "teto" ? "TETO SYSTEM 04" : "MIKU SYSTEM 01";
        document.dispatchEvent(new CustomEvent("themechange", { detail: selected }));
        if (changed && !options.silent) window.triggerThemeSwitchVictory?.(selected);
    }

    function themeToggle() {
        setTheme(document.getElementById("theme-toggle")?.checked ? "teto" : "miku", { manual: true });
    }

    function bindAuthNavigation(options = {}) {
        initFirebase();
        return firebase.auth().onAuthStateChanged((user) => {
            document.querySelectorAll("#nav-transit, #nav-islam").forEach((link) => {
                link.style.setProperty("display", user ? "inline-block" : "none", "important");
            });
            const adminButton = document.getElementById("admin-btn");
            if (adminButton) {
                adminButton.textContent = user ? "Logoff" : "Admin";
                adminButton.href = user ? "#logout" : "login.html";
                adminButton.onclick = user ? (event) => {
                    event.preventDefault();
                    firebase.auth().signOut().then(() => window.location.assign("index.html"));
                } : null;
            }
            options.onChange?.(user);
        });
    }

    document.documentElement.setAttribute("data-theme", localStorage.getItem("theme") || "miku");

    window.Weebokage = {
        apiBase,
        backendMode,
        apiFetch,
        authHeaders,
        bindAuthNavigation,
        escapeHTML,
        firebaseConfig,
        initFirebase,
        safeUrl,
        sessionId,
        setTheme,
        themeToggle
    };
    window.setTheme = setTheme;
    window.themeToggle = themeToggle;
})();
