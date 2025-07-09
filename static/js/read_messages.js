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

    const mailboxId = window.location.pathname.split('/')[2];

    // Initialize encoders/decoders once
    const textEncoder = new TextEncoder(); // For encoding strings to bytes
    const textDecoder = new TextDecoder(); // For decoding bytes to strings

    function base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

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
    }

    accessInboxForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessages();

        const password = passwordInput.value;
        if (password.length < 8) {
            displayErrors(["Password must be at least 8 characters long."]);
            return;
        }

        accessButton.disabled = true;
        accessButton.textContent = 'Accessing...';
        loadingSpinner.style.display = 'inline-block';
        initialInfoDiv.style.display = 'none';

        try {
            const response = await fetch(`/inbox/${mailboxId}/retrieve-messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: password }),
            });

            const result = await response.json();

            if (!result.success) {
                displayErrors(result.errors || ["Authentication failed. Invalid password?"]);
                return;
            }

            const { encryptedPrivateKeyBlob, privateKeyIv, kdfSalt, messages } = result;

            const passwordBuffer = textEncoder.encode(password); // Use textEncoder for password encoding
            const kdfSaltBuffer = base64ToArrayBuffer(kdfSalt);

            const kdfKey = await window.crypto.subtle.importKey(
                "raw", passwordBuffer, { name: "PBKDF2" }, false, ["deriveBits"]
            );

            const derivedBits = await window.crypto.subtle.deriveBits(
                {
                    name: "PBKDF2", salt: kdfSaltBuffer, iterations: 310000, hash: "SHA-256"
                },
                kdfKey, 256
            );
            const derivedSymmetricKey = await window.crypto.subtle.importKey(
                "raw", derivedBits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
            );

            const privateKeyIvBuffer = base64ToArrayBuffer(privateKeyIv);
            const encryptedPrivateKeyBlobBuffer = base64ToArrayBuffer(encryptedPrivateKeyBlob);

            let decryptedPrivateKeyBuffer;
            try {
                decryptedPrivateKeyBuffer = await window.crypto.subtle.decrypt(
                    { name: "AES-GCM", iv: privateKeyIvBuffer }, derivedSymmetricKey, encryptedPrivateKeyBlobBuffer
                );
            } catch (decryptionError) {
                console.error("Failed to decrypt private key blob:", decryptionError);
                displayErrors(["Incorrect password. (Private key decryption failed)"]);
                return;
            }
            
            // Use textDecoder for decoding the decrypted private key JWK string
            const privateKeyJwk = textDecoder.decode(decryptedPrivateKeyBuffer);
            let privateKey;
            try {
                privateKey = await window.crypto.subtle.importKey(
                    "jwk", JSON.parse(privateKeyJwk), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]
                );
            } catch (importError) {
                console.error("Failed to import decrypted private key JWK:", importError);
                displayErrors(["Corrupted private key data. Cannot decrypt messages."]);
                return;
            }

            messageList.innerHTML = '';
            if (messages.length === 0) {
                noMessagesParagraph.style.display = 'block';
            } else {
                noMessagesParagraph.style.display = 'none';
                for (const msg of messages) {
                    const li = document.createElement('li');
                    li.className = 'message-item';
                    try {
                        const encryptedSymmetricKeyBuffer = base64ToArrayBuffer(msg.encrypted_symmetric_key);
                        const messageIvBuffer = base64ToArrayBuffer(msg.message_iv);
                        const encryptedContentBuffer = base64ToArrayBuffer(msg.encrypted_content);

                        const decryptedSymmetricKeyBuffer = await window.crypto.subtle.decrypt(
                            { name: "RSA-OAEP" }, privateKey, encryptedSymmetricKeyBuffer
                        );
                        const messageSymmetricKey = await window.crypto.subtle.importKey(
                            "raw", decryptedSymmetricKeyBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
                        );
                        const decryptedContentBuffer = await window.crypto.subtle.decrypt(
                            { name: "AES-GCM", iv: messageIvBuffer }, messageSymmetricKey, encryptedContentBuffer
                        );
                        // Use textDecoder for decoding the actual message content
                        const decryptedMessage = textDecoder.decode(decryptedContentBuffer);
                        li.innerHTML = `
                            <div class="message-meta">Received: ${msg.created_at_readable}</div>
                            <div class="message-content">${decryptedMessage}</div>
                        `;
                    } catch (msgError) {
                        console.error("Error decrypting individual message (might be password mismatch or corruption):", msgError);
                        li.className += ' message-error';
                        li.innerHTML = `<div class="message-meta">Received: ${msg.created_at_readable}</div><div class="message-content"><em>Failed to decrypt this message. It might be corrupted or sent with an old/incorrect key.</em></div>`;
                    }
                    messageList.appendChild(li);
                }
            }
            accessInboxForm.style.display = 'none';
            messagesDisplaySection.style.display = 'block';

        } catch (error) {
            console.error("Overall message retrieval/decryption error:", error);
            // This catches server errors, initial password decryption failures
            displayErrors(["Failed to access messages. Check your password or refresh and try again. Detailed: " + error.message]);
        } finally {
            accessButton.disabled = false;
            accessButton.textContent = 'Access Messages';
            loadingSpinner.style.display = 'none';
        }
    });
});