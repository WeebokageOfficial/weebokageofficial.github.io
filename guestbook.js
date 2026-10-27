'use strict';
Weebokage.initFirebase();
Weebokage.bindAuthNavigation();
const db=firebase.firestore();
document.getElementById('guestbook-form').addEventListener('submit',postComment);
        async function postComment(event) {
            event.preventDefault();
            const name = document.getElementById("guestName").value.trim();
            const message = document.getElementById("guestMsg").value.trim();
            const status = document.getElementById("comment-status");
            const button = document.getElementById("commentBtn");
            if (!name || !message) {
                status.textContent = "Please enter an alias and a message.";
                return;
            }
            button.disabled = true;
            status.textContent = "Sending…";
            try {
                await db.collection("comments").add({
                    name: name.slice(0, 40),
                    msg: message.slice(0, 500),
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });
                document.getElementById("guestName").value = "";
                document.getElementById("guestMsg").value = "";
                status.textContent = "Message sent.";
            } catch (_) {
                status.textContent = "Message could not be sent.";
            } finally {
                button.disabled = false;
            }
        }

        function renderComment(data) {
            const card = document.createElement("article");
            card.className = "card";
            card.classList.add("guestbook-entry");
            const name = document.createElement("strong");
            name.textContent = String(data.name || "Anonymous").slice(0, 40);
            const message = document.createElement("p");
            message.textContent = String(data.msg || "").slice(0, 500);
            message.className = "guestbook-message";
            card.append(name, message);
            return card;
        }

        db.collection("comments").orderBy("timestamp", "desc").limit(10).onSnapshot((snapshot) => {
            document.getElementById("comments-feed").replaceChildren(
                ...snapshot.docs.map((documentSnapshot) => renderComment(documentSnapshot.data()))
            );
            if (!snapshot.size) document.getElementById("comments-feed").textContent="No signals yet. Leave the first message.";
        }, () => {
            document.getElementById("comments-feed").innerHTML = '<p class="status-message">Guestbook messages are currently unavailable.</p>';
        });
