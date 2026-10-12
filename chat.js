(function () {
    "use strict";

    let currentUser = null;
    let pending = false;

    function addMessage(text, ownMessage = false) {
        const box = document.getElementById("miku-msgs");
        if (!box) return null;
        const message = document.createElement("div");
        message.className = ownMessage ? "chat-message own" : "chat-message";
        renderMessage(message, text, ownMessage);
        box.appendChild(message);
        box.scrollTop = box.scrollHeight;
        return message;
    }

    function renderMessage(element, text, plain = false) {
        element.classList.remove("is-pending");
        if (!plain && window.marked && window.DOMPurify) {
            element.innerHTML = DOMPurify.sanitize(marked.parse(String(text)), {
                ALLOWED_TAGS: ["p","br","strong","em","del","h1","h2","h3","h4","ul","ol","li","blockquote","pre","code","a","hr","table","thead","tbody","tr","th","td"],
                ALLOWED_ATTR: ["href","title","class"], ALLOW_DATA_ATTR: false
            });
            element.querySelectorAll("a").forEach(link => {
                const url = Weebokage.safeUrl(link.getAttribute("href"));
                if (!url) link.removeAttribute("href");
                else { link.href = url; link.target = "_blank"; link.rel = "noopener noreferrer"; }
            });
            element.querySelectorAll("pre code").forEach(code => window.hljs?.highlightElement(code));
        } else element.textContent = String(text);
        const box = document.getElementById("miku-msgs");
        if (box) box.scrollTop = box.scrollHeight;
    }

    function updateGreeting() {
        const box = document.getElementById("miku-msgs");
        if (!box) return;
        if (box.querySelector(".own")) return;
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
        if (!value || pending) return;
        pending = true;

        addMessage(value, true);
        input.value = "";
        input.disabled = true;
        const loading = addMessage("Establishing neural uplink…");
        loading.classList.add("is-pending");
        const send = document.getElementById("neural-send");
        if (send) send.disabled = true;
        const status = document.getElementById("chat-request-status");
        if (status) status.textContent = "NEURAL UPLINK // WAITING FOR RESPONSE";
        try {
            const response = await Weebokage.apiFetch("/chat", {
                method: "POST",
                body: JSON.stringify({
                    message: value,
                    theme: localStorage.getItem("theme") || "miku",
                    session_id: Weebokage.sessionId()
                }),
                timeout: 65000
            });
            const data = await response.json();
            renderMessage(loading, data.reply || "Neural sync failed.");
        } catch (error) {
            renderMessage(loading, error.name === "AbortError" ? "Request timed out." : error.message, true);
            loading.classList.add("is-error");
        } finally {
            pending = false;
            if (send) send.disabled = false;
            if (status) status.textContent = "ENTER TO SEND / SHIFT + ENTER FOR A NEW LINE";
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

        button?.setAttribute("aria-expanded", String(open));
        if (open) document.getElementById("miku-input")?.focus();
    }

    function initialize() {
        const input = document.getElementById("miku-input");
        input?.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
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
