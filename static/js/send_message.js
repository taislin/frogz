// static/js/send_message.js

document.addEventListener('DOMContentLoaded', () => {
    const sendMessageForm = document.getElementById('sendMessageForm');
    const messageContentInput = document.getElementById('messageContent');
    const charCountSpan = document.getElementById('charCount');
    const sendButton = document.getElementById('sendButton');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const successMessageDiv = document.getElementById('success-message');
    const errorMessagesDiv = document.getElementById('error-messages');
    const errorList = document.getElementById('error-list');

    const textEncoder = new TextEncoder(); // Only encoder needed here

    // Helper to convert Base64 string to ArrayBuffer
    function base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    if (errorMessagesDiv) errorMessagesDiv.style.display = 'none';
    if (successMessageDiv) successMessageDiv.style.display = 'none';

    let recipientPublicKey = null; // Will store the imported public key
    const mailboxId = window.location.pathname.split('/')[2]; // Extract mailboxId from URL

    // === Client-side Public Key Fetching and Importing ===
    // This function now fetches the key from a dedicated API endpoint
    async function initializePublicKey() {
        console.log("Initializing public key fetch for mailbox:", mailboxId); // Debug
        sendButton.disabled = true; // Disable button until key is loaded
        sendButton.textContent = 'Loading Key...';
        loadingSpinner.style.display = 'inline-block';

        try {
            const response = await fetch(`/inbox/${mailboxId}/public-key`); // NEW API CALL
            const result = await response.json();

            if (!result.success) {
                console.error("Server error fetching public key:", result.error);
                displayErrors([result.error || "Mailbox not found or public key data is missing. Cannot send message."]);
                return;
            }
            
            // Result.publicKeyJwk should be the raw JSON string
            recipientPublicKey = await window.crypto.subtle.importKey(
                "jwk",
                JSON.parse(result.publicKeyJwk), // Parse the JSON string received from API
                { name: "RSA-OAEP", hash: "SHA-256" },
                false,
                ["encrypt"]
            );
            console.log("Recipient public key successfully loaded.");
            sendButton.disabled = false; // Enable button once key is loaded
            sendButton.textContent = 'Send Message';
        } catch (error) {
            console.error("Error fetching or importing recipient public key:", error);
            displayErrors(["Critical Error: Failed to load encryption key. Message cannot be sent. (Technical: " + error.message + ")"]);
            sendButton.disabled = true;
        } finally {
            loadingSpinner.style.display = 'none';
        }
    }
    initializePublicKey(); // Call this function on DOM load

    // === Character Count Update ===
    messageContentInput.addEventListener('input', () => {
        charCountSpan.textContent = `${messageContentInput.value.length} / ${messageContentInput.maxLength} characters`;
    });
    charCountSpan.textContent = `${messageContentInput.value.length} / ${messageContentInput.maxLength} characters`;


    // === Form Submission Handler ===
    sendMessageForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        clearFeedback();

        const messageContent = messageContentInput.value;
        const clientErrors = [];

        if (messageContent.length < 5) {
            clientErrors.push("Message is too short (minimum 5 characters).");
        }
        if (messageContent.length > 5000) {
            clientErrors.push("Message is too long (maximum 5000 characters).");
        }

        if (clientErrors.length > 0) {
            displayErrors(clientErrors);
            return;
        }

        if (!recipientPublicKey) { // Ensure key is actually loaded before trying to use it
            displayErrors(["Encryption key not ready. Please wait a moment and try again. (If issue persists, refresh page)."]);
            return;
        }

        sendButton.disabled = true;
        sendButton.textContent = 'Sending...';
        loadingSpinner.style.display = 'inline-block';

        try {
            const messageBuffer = textEncoder.encode(messageContent);

            const symmetricKey = await window.crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
            );

            const messageIv = window.crypto.getRandomValues(new Uint8Array(12));
            const encryptedContentBuffer = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: messageIv }, symmetricKey, messageBuffer
            );

            const exportedSymmetricKey = await window.crypto.subtle.exportKey("raw", symmetricKey);
            const encryptedSymmetricKeyBuffer = await window.crypto.subtle.encrypt(
                { name: "RSA-OAEP" }, recipientPublicKey, exportedSymmetricKey
            );

            const encryptedContent = btoa(String.fromCharCode(...new Uint8Array(encryptedContentBuffer)));
            const messageIvBase64 = btoa(String.fromCharCode(...new Uint8Array(messageIv)));
            const encryptedSymmetricKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedSymmetricKeyBuffer)));

            const response = await fetch(`/inbox/${mailboxId}/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    encryptedContent: encryptedContent,
                    messageIv: messageIvBase64,
                    encryptedSymmetricKey: encryptedSymmetricKeyBase64
                }),
            });

            const result = await response.json();

            if (result.success) {
                successMessageDiv.style.display = 'block';
                sendMessageForm.reset();
                charCountSpan.textContent = `${messageContentInput.value.length} / ${messageContentInput.maxLength} characters`;
            } else {
                displayErrors(result.errors || ["An unknown error occurred."]);
            }

        } catch (error) {
            console.error("Error during message encryption or sending:", error);
            displayErrors(["Failed to send message securely. Please try again. Technical error: " + error.message]);
        } finally {
            sendButton.disabled = false;
            sendButton.textContent = 'Send Message';
            loadingSpinner.style.display = 'none';
        }
    });

    function displayErrors(errors) {
        if (errorMessagesDiv && errorList) {
            errorList.innerHTML = '';
            errors.forEach(e => {
                const li = document.createElement('li');
                li.textContent = e;
                errorList.appendChild(li);
            });
            errorMessagesDiv.style.display = 'block';
        }
    }

    function clearFeedback() {
        if (errorMessagesDiv) { errorMessagesDiv.style.display = 'none'; errorList.innerHTML = ''; }
        if (successMessageDiv) { successMessageDiv.style.display = 'none'; }
    }
});