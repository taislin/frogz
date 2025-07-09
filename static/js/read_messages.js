// static/js/read_messages.js

document.addEventListener('DOMContentLoaded', () => {
    const accessInboxForm = document.getElementById('accessInboxForm');
    const passwordInput = document.getElementById('password');
    const accessButton = document.getElementById('accessButton');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const errorMessagesDiv = document.getElementById('error-messages');
    const errorList = document.getElementById('error-list');
    const initialInfoDiv = document.getElementById('initial-info');
    const messagesDisplaySection = document.getElementById('messagesDisplay');
    const messageList = document.getElementById('messageList');
    const noMessagesParagraph = document.getElementById('noMessages');

    const mailboxId = window.location.pathname.split('/')[1]; // Extract mailboxId from URL

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

    // Helper to display errors
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

    // Helper to clear messages
    function clearMessages() {
        if (errorMessagesDiv) {
            errorMessagesDiv.style.display = 'none';
            errorList.innerHTML = '';
        }
    }

    // === Form Submission Handler for Password ===
    accessInboxForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessages(); // Clear previous errors

        const password = passwordInput.value;

        if (password.length < 8) {
            displayErrors(["Password must be at least 8 characters long."]);
            return;
        }

        // Show loading state
        accessButton.disabled = true;
        accessButton.textContent = 'Accessing...';
        loadingSpinner.style.display = 'inline-block';
        initialInfoDiv.style.display = 'none';

        try {
            // === STEP 1: Fetch Mailbox Details and Encrypted Messages from Server ===
            const response = await fetch(`/${mailboxId}/retrieve-messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ password: password }),
            });

            const result = await response.json();

            if (!result.success) {
                displayErrors(result.errors || ["Authentication failed. Invalid password?"]);
                return;
            }

            // Server-side authentication was successful, now client-side decryption
            const { encryptedPrivateKeyBlob, privateKeyIv, kdfSalt, messages } = result;

            // === STEP 2: Derive Symmetric Master Key from Password ===
            const passwordEncoder = new TextEncoder();
            const passwordBuffer = passwordEncoder.encode(password);
            const kdfSaltBuffer = base64ToArrayBuffer(kdfSalt);

            const kdfKey = await window.crypto.subtle.importKey(
                "raw",
                passwordBuffer,
                { name: "PBKDF2" },
                false,
                ["deriveBits"]
            );

            const derivedBits = await window.crypto.subtle.deriveBits(
                {
                    name: "PBKDF2",
                    salt: kdfSaltBuffer,
                    iterations: 310000, // Must match generation iterations
                    hash: "SHA-256",
                },
                kdfKey,
                256 // 256 bits for AES-GCM key
            );

            const derivedSymmetricKey = await window.crypto.subtle.importKey(
                "raw",
                derivedBits,
                { name: "AES-GCM" },
                false,
                ["encrypt", "decrypt"]
            );

            // === STEP 3: Decrypt the Asymmetric Private Key ===
            const privateKeyIvBuffer = base64ToArrayBuffer(privateKeyIv);
            const encryptedPrivateKeyBlobBuffer = base64ToArrayBuffer(encryptedPrivateKeyBlob);

            const decryptedPrivateKeyBuffer = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: privateKeyIvBuffer },
                derivedSymmetricKey,
                encryptedPrivateKeyBlobBuffer
            );

            const privateKeyJwk = passwordEncoder.decode(decryptedPrivateKeyBuffer);
            const privateKey = await window.crypto.subtle.importKey(
                "jwk",
                JSON.parse(privateKeyJwk),
                { name: "RSA-OAEP", hash: "SHA-256" },
                false, // not extractable, this is the final key to use
                ["decrypt"]
            );

            // === STEP 4: Decrypt Each Message ===
            messageList.innerHTML = ''; // Clear existing messages
            if (messages.length === 0) {
                noMessagesParagraph.style.display = 'block';
            } else {
                noMessagesParagraph.style.display = 'none';
                for (const msg of messages) {
                    try {
                        const encryptedSymmetricKeyBuffer = base64ToArrayBuffer(msg.encrypted_symmetric_key);
                        const messageIvBuffer = base64ToArrayBuffer(msg.message_iv);
                        const encryptedContentBuffer = base64ToArrayBuffer(msg.encrypted_content);

                        // Decrypt symmetric key with private key
                        const decryptedSymmetricKeyBuffer = await window.crypto.subtle.decrypt(
                            { name: "RSA-OAEP" },
                            privateKey,
                            encryptedSymmetricKeyBuffer
                        );

                        const messageSymmetricKey = await window.crypto.subtle.importKey(
                            "raw",
                            decryptedSymmetricKeyBuffer,
                            { name: "AES-GCM" },
                            false,
                            ["encrypt", "decrypt"]
                        );

                        // Decrypt message content with symmetric key
                        const decryptedContentBuffer = await window.crypto.subtle.decrypt(
                            { name: "AES-GCM", iv: messageIvBuffer },
                            messageSymmetricKey,
                            encryptedContentBuffer
                        );

                        const decryptedMessage = passwordEncoder.decode(decryptedContentBuffer);

                        // Display the decrypted message
                        const li = document.createElement('li');
                        li.className = 'message-item';
                        li.innerHTML = `
                            <div class="message-meta">Received: ${msg.created_at_readable}</div>
                            <div class="message-content">${decryptedMessage}</div>
                        `;
                        messageList.appendChild(li);

                    } catch (msgError) {
                        console.error("Error decrypting individual message:", msgError);
                        const li = document.createElement('li');
                        li.className = 'message-item message-error';
                        li.innerHTML = `<div class="message-meta">Received: ${msg.created_at_readable}</div><div class="message-content"><em>Failed to decrypt this message. It might be corrupted or sent with an old/incorrect key.</em></div>`;
                        messageList.appendChild(li);
                    }
                }
            }

            // Show messages and hide form
            accessInboxForm.style.display = 'none';
            messagesDisplaySection.style.display = 'block';

        } catch (error) {
            console.error("Overall decryption or fetch error:", error);
            displayErrors(["Failed to access messages. Check your password or try again later."]);
        } finally {
            accessButton.disabled = false;
            accessButton.textContent = 'Access Messages';
            loadingSpinner.style.display = 'none';
        }
    });
});