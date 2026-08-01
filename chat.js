(function () {
    "use strict";

    let currentUser = null;

    function addMessage(text, ownMessage = false) {
        const box = document.getElementById("miku-msgs");
        if (!box) return null;
        const message = document.createElement("div");
        message.textContent = text;
        message.style.cssText = ownMessage
            ? "background:var(--primary);color:#000;padding:12px;border-radius:12px;align-self:flex-end;max-width:85%;font-weight:bold;overflow-wrap:anywhere"
            : "background:rgba(57,197,187,.1);padding:12px;border-radius:12px;border:1px solid var(--primary);align-self:flex-start;max-width:85%;overflow-wrap:anywhere";
        box.appendChild(message);
        box.scrollTop = box.scrollHeight;
        return message;
    }

    function updateGreeting() {
        const box = document.getElementById("miku-msgs");
        if (!box) return;
        box.replaceChildren();
        const teto = (localStorage.getItem("theme") || "miku") === "teto";
        const greeting = teto
            ? (currentUser ? "Master! Teto 04 active. 🥖" : "User! Teto 04 active. 🥖")
            : (currentUser ? "Welcome back, Master! Miku 01 at your service! 🩵" : "Hello! Miku 01 is online, User! 🩵");
        addMessage(greeting);
    }

    async function askMiku() {
        const input = document.getElementById("miku-input");
        if (!input) return;
        const value = input.value.trim().slice(0, 1000);
        if (!value) return;

        addMessage(value, true);
        input.value = "";
        input.disabled = true;
        const loading = addMessage("…");
        try {
            const response = await Weebokage.apiFetch("/chat", {
                method: "POST",
                body: JSON.stringify({
                    message: value,
                    theme: localStorage.getItem("theme") || "miku",
                    session_id: Weebokage.sessionId()
                }),
                timeout: 30000
            });
            const data = await response.json();
            loading.textContent = data.reply || "Neural sync failed.";
        } catch (error) {
            loading.textContent = error.name === "AbortError" ? "Request timed out." : "Connection lost.";
        } finally {
            input.disabled = false;
            input.focus();
        }
    }

    function toggleMiku() {
        const windowElement = document.getElementById("miku-window");
        const button = document.getElementById("miku-btn");
        if (!windowElement) return;
        const open = windowElement.hidden;
        windowElement.hidden = !open;
        windowElement.style.display = open ? "flex" : "none";
        button?.setAttribute("aria-expanded", String(open));
        if (open) document.getElementById("miku-input")?.focus();
    }

    function initialize() {
        const input = document.getElementById("miku-input");
        input?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                askMiku();
            }
        });
        document.addEventListener("themechange", updateGreeting);
        updateGreeting();
    }

    window.WeebokageChat = {
        ask: askMiku,
        initialize,
        setUser(user) {
            currentUser = user;
            updateGreeting();
        },
        toggle: toggleMiku
    };
    window.askMiku = askMiku;
    window.toggleMiku = toggleMiku;
})();
