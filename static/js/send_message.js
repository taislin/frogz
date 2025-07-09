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

    const publicKeyJwkElement = document.getElementById('publicKeyJwk');
    if (!publicKeyJwkElement) {
        displayErrors(["Critical Error: Public key not found. Cannot encrypt message."]);
        sendButton.disabled = true;
        return;
    }
    const recipientPublicKeyJwk = JSON.parse(publicKeyJwkElement.textContent);

    let recipientPublicKey = null; // Will store the imported public key

    // === Character Count Update ===
    messageContentInput.addEventListener('input', () => {
        charCountSpan.textContent = `${messageContentInput.value.length} / ${messageContentInput.maxLength} characters`;
    });
    // Initial count
    charCountSpan.textContent = `${messageContentInput.value.length} / ${messageContentInput.maxLength} characters`;

    // === Initialize Public Key ===
    async function importPublicKey() {
        try {
            recipientPublicKey = await window.crypto.subtle.importKey(
                "jwk",
                recipientPublicKeyJwk,
                { name: "RSA-OAEP", hash: "SHA-256" },
                false, // not extractable
                ["encrypt"]
            );
        } catch (error) {
            console.error("Error importing recipient public key:", error);
            displayErrors(["Failed to load encryption key. Message cannot be sent."]);
            sendButton.disabled = true;
        }
    }
    importPublicKey();

    // === Form Submission Handler ===
    sendMessageForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Clear previous messages
        clearMessages();

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

        if (!recipientPublicKey) {
            displayErrors(["Encryption key not ready. Please wait a moment and try again."]);
            return;
        }

        // Show loading state
        sendButton.disabled = true;
        sendButton.textContent = 'Sending...';
        loadingSpinner.style.display = 'inline-block';

        try {
            const encoder = new TextEncoder();
            const messageBuffer = encoder.encode(messageContent);

            // === STEP 1: Generate a random, single-use Symmetric Key (AES-GCM) ===
            const symmetricKey = await window.crypto.subtle.generateKey(
                { name: "AES-GCM", length: 256 },
                true, // extractable (because we need to encrypt it)
                ["encrypt", "decrypt"]
            );

            // === STEP 2: Encrypt the Message Content with the Symmetric Key ===
            const messageIv = window.crypto.getRandomValues(new Uint8Array(12)); // 12 bytes IV for AES-GCM
            const encryptedContentBuffer = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: messageIv },
                symmetricKey,
                messageBuffer
            );

            // === STEP 3: Encrypt the Symmetric Key itself with the Recipient's Public Key (RSA-OAEP) ===
            const exportedSymmetricKey = await window.crypto.subtle.exportKey("raw", symmetricKey); // Export raw bytes
            const encryptedSymmetricKeyBuffer = await window.crypto.subtle.encrypt(
                { name: "RSA-OAEP" },
                recipientPublicKey,
                exportedSymmetricKey
            );

            // Convert ArrayBuffers to Base64 strings for storage/transmission
            const encryptedContent = btoa(String.fromCharCode(...new Uint8Array(encryptedContentBuffer)));
            const messageIvBase64 = btoa(String.fromCharCode(...new Uint8Array(messageIv)));
            const encryptedSymmetricKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(encryptedSymmetricKeyBuffer)));

            // === STEP 4: Send Encrypted Data to Server ===
            const mailboxId = window.location.pathname.split('/')[1]; // Extract mailboxId from URL

            const response = await fetch(`/${mailboxId}/send-message`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    encryptedContent: encryptedContent,
                    messageIv: messageIvBase64,
                    encryptedSymmetricKey: encryptedSymmetricKeyBase64
                }),
            });

            const result = await response.json();

            if (result.success) {
                successMessageDiv.style.display = 'block';
                sendMessageForm.reset(); // Clear form on success
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

    function clearMessages() {
        if (errorMessagesDiv) {
            errorMessagesDiv.style.display = 'none';
            errorList.innerHTML = '';
        }
        successMessageDiv.style.display = 'none';
    }
});