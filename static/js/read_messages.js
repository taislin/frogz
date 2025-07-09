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
    const deleteAllButton = document.getElementById('deleteAllButton');

    const mailboxId = window.location.pathname.split('/')[2];

    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

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

        await fetchAndRenderMessages();
    });


    async function fetchAndRenderMessages() {
        const password = passwordInput.value;

        if (!password || password.length < 8) {
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

            const passwordBuffer = textEncoder.encode(password);
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
                deleteAllButton.style.display = 'none';
            } else {
                noMessagesParagraph.style.display = 'none';
                deleteAllButton.style.display = 'block';
                for (const msg of messages) {
                    const li = document.createElement('li');
                    li.className = 'message-item';
                    li.dataset.messageId = msg.message_id;

                    let decryptedMessage = ''; 
                    let expirationText = '';

                    const oneWeekInMs = 7 * 24 * 60 * 60 * 1000;
                    
                    // === FIX START: Convert msg.created_at to a number explicitly ===
                    const messageCreatedAt = typeof msg.created_at === 'string' ? Number(msg.created_at) : msg.created_at;
                    // Ensure it's a valid number after conversion
                    if (isNaN(messageCreatedAt)) {
                        console.error("Invalid message created_at timestamp:", msg.created_at);
                        expirationText = 'Error calculating expiration';
                    } else {
                        const expirationTime = messageCreatedAt + oneWeekInMs;
                        const now = new Date().getTime();
                        const timeLeftMs = expirationTime - now;

                        if (timeLeftMs <= 0) {
                            expirationText = 'Expired (will be deleted soon)';
                            li.className += ' message-expired';
                        } else {
                            const days = Math.floor(timeLeftMs / (1000 * 60 * 60 * 24));
                            const hours = Math.floor((timeLeftMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                            expirationText = `Expires in ${days}d ${hours}h`;
                        }
                    }
                    // === FIX END ===

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
                        decryptedMessage = textDecoder.decode(decryptedContentBuffer);

                    } catch (msgError) {
                        console.error("Error decrypting individual message (might be password mismatch or corruption):", msgError);
                        li.className += ' message-error';
                        decryptedMessage = `<em>Failed to decrypt this message. It might be corrupted or sent with an old/incorrect key.</em>`;
                    }
                    li.innerHTML = `
                        <div class="message-meta">
                            Received: ${msg.created_at_readable} | ${expirationText}
                            <button class="btn btn-delete btn-sm" data-message-id="${msg.message_id}">Delete</button>
                        </div>
                        <div class="message-content">${decryptedMessage}</div>
                    `;
                    messageList.appendChild(li);
                }
                addDeleteButtonListeners(password);
            }

            accessInboxForm.style.display = 'none';
            messagesDisplaySection.style.display = 'block';

        } catch (error) {
            console.error("Overall message retrieval/decryption error:", error);
            displayErrors(["Failed to access messages. Check your password or try again. Technical: " + error.message]);
        } finally {
            accessButton.disabled = false;
            accessButton.textContent = 'Access Messages';
            loadingSpinner.style.display = 'none';
        }
    }

    function addDeleteButtonListeners(ownerPassword) {
        document.querySelectorAll('.btn-delete').forEach(button => {
            button.onclick = async () => {
                const messageId = button.dataset.messageId;
                if (confirm('Are you sure you want to delete this message?')) {
                    await deleteSingleMessage(messageId, ownerPassword);
                }
            };
        });
        if (deleteAllButton) {
            deleteAllButton.onclick = async () => {
                if (confirm('Are you absolutely sure you want to delete ALL messages in this inbox? This cannot be undone.')) {
                    await deleteAllMessages(ownerPassword);
                }
            };
        }
    }

    async function deleteSingleMessage(messageId, ownerPassword) {
        displayErrors([]);
        console.log(`Attempting to delete message: ${messageId} for mailbox: ${mailboxId}`);
        try {
            const response = await fetch(`/inbox/${mailboxId}/delete-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messageId: messageId, password: ownerPassword }),
            });
            const result = await response.json();
            if (result.success) {
                console.log("Message deleted successfully:", messageId);
                const deletedItem = document.querySelector(`[data-message-id="${messageId}"]`);
                if (deletedItem) {
                    deletedItem.remove();
                }
                if (messageList.children.length === 0) {
                    noMessagesParagraph.style.display = 'block';
                    deleteAllButton.style.display = 'none';
                }
            } else {
                displayErrors([result.error || `Failed to delete message: ${messageId}.`]);
            }
        } catch (error) {
            console.error("Error calling delete message API:", error);
            displayErrors([`Error deleting message: ${messageId}. (Technical: ${error.message})`]);
        }
    }

    async function deleteAllMessages(ownerPassword) {
        displayErrors([]);
        console.log(`Attempting to delete all messages for mailbox: ${mailboxId}`);
        try {
            const response = await fetch(`/inbox/${mailboxId}/delete-all-messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: ownerPassword }),
            });
            const result = await response.json();
            if (result.success) {
                console.log("All messages deleted successfully.");
                messageList.innerHTML = '';
                noMessagesParagraph.style.display = 'block';
                deleteAllButton.style.display = 'none';
            } else {
                displayErrors([result.error || "Failed to delete all messages."]);
            }
        } catch (error) {
            console.error("Error calling delete all messages API:", error);
            displayErrors([`Error deleting all messages. (Technical: ${error.message})`]);
        }
    }
});