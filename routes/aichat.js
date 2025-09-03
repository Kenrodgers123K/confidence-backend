document.addEventListener("DOMContentLoaded", function () {
    const chatButton = document.getElementById("ai-chat-button");
    const chatModal = document.getElementById("ai-chat-modal");
    const chatMessages = document.getElementById("ai-chat-messages");
    const chatInput = document.getElementById("ai-chat-input");
    const chatSend = document.getElementById("ai-chat-send");

    // Toggle Chat Window
    chatButton.addEventListener("click", () => {
        chatModal.style.display = chatModal.style.display === "none" ? "block" : "none";
    });

    // Send message to AI
    async function sendMessage() {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        // Display user message
        chatMessages.innerHTML += `<div style="margin-bottom:8px;"><strong>You:</strong> ${userMessage}</div>`;
        chatInput.value = "";
        chatMessages.scrollTop = chatMessages.scrollHeight;

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: userMessage })
            });

            const data = await response.json();
            const botReply = data.reply || "Sorry, I couldn't get that.";

            // Display AI reply
            chatMessages.innerHTML += `<div style="margin-bottom:8px; color: #28a745;"><strong>AI:</strong> ${botReply}</div>`;
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } catch (error) {
            console.error(error);
            chatMessages.innerHTML += `<div style="color:red;"><strong>Error:</strong> Could not connect to AI.</div>`;
        }
    }

    chatSend.addEventListener("click", sendMessage);
    chatInput.addEventListener("keypress", function (e) {
        if (e.key === "Enter") sendMessage();
    });
});
