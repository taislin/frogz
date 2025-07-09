// static/js/create_inbox.js

document.addEventListener('DOMContentLoaded', () => {
    const createInboxForm = document.getElementById('createInboxForm');
    const mailboxIdInput = document.getElementById('mailboxId');
    const passwordInput = document.getElementById('password');
    const passwordConfirmInput = document.getElementById('passwordConfirm');
    const createButton = document.getElementById('createButton');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const successMessageDiv = document.getElementById('successMessage');
    const errorMessagesDiv = document.getElementById('error-messages');
    const errorListUl = errorMessagesDiv ? errorMessagesDiv.querySelector('ul') : null; // Get the UL inside error div

    // --- FIX START: Ensure initial state for messages ---
    // Hide both success and error messages on page load.
    // If the server *explicitly* rendered errors, the error div will be populated
    // but we'll manage its visibility here.
    if (errorMessagesDiv) errorMessagesDiv.style.display = 'none';
    if (successMessageDiv) successMessageDiv.style.display = 'none';
    // --- FIX END ---

    createInboxForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Clear previous messages and errors on new submission attempt
        clearFeedback();

        const mailboxId = mailboxIdInput.value.trim();
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;

        const clientErrors = [];

        if (!mailboxId || !/^[a-z0-9-]+$/.test(mailboxId) || mailboxId.length < 3 || mailboxId.length > 50) {
            clientErrors.push("Mailbox ID must be 3-50 lowercase alphanumeric characters or hyphens.");
        }
        if (password.length < 8) {
            clientErrors.push("Password must be at least 8 characters long.");
        }
        if (password !== passwordConfirm) {
            clientErrors.push("Passwords do not match.");
        }

        if (clientErrors.length > 0) {
            displayErrors(clientErrors);
            return;
        }

        // Show loading state
        createButton.disabled = true;
        createButton.textContent = 'Creating...';
        loadingSpinner.style.display = 'inline-block';

        try {
            // ... (Your existing Web Crypto API logic for key generation and encryption) ...
            // This part remains identical to your previous create_inbox.js logic
            
            // === STEP 1: Generate Asymmetric Key Pair (RSA-OAEP for encryption) ===
            const keyPair = await window.crypto.subtle.generateKey(
                {
                    name: "RSA-OAEP",
                    modulusLength: 2048,
                    publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
                    hash: "SHA-256",
                },
                true,
                ["encrypt", "decrypt"]
            );

            const publicKeyJwk = JSON.stringify(await window.crypto.subtle.exportKey("jwk", keyPair.publicKey));
            const privateKeyJwk = JSON.stringify(await window.crypto.subtle.exportKey("jwk", keyPair.privateKey));
            
            // === STEP 2: Derive Symmetric Master Key from Password (PBKDF2) ===
            const salt = window.crypto.getRandomValues(new Uint8Array(16));
            const passwordEncoder = new TextEncoder();
            const passwordBuffer = passwordEncoder.encode(password);

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
                    salt: salt,
                    iterations: 310000,
                    hash: "SHA-256",
                },
                kdfKey,
                256
            );

            const derivedSymmetricKey = await window.crypto.subtle.importKey(
                "raw",
                derivedBits,
                { name: "AES-GCM" },
                false,
                ["encrypt", "decrypt"]
            );

            // === STEP 3: Encrypt the Private Key using the Derived Symmetric Key ===
            const privateKeyIv = window.crypto.getRandomValues(new Uint8Array(12));
            const privateKeyBuffer = passwordEncoder.encode(privateKeyJwk);

            const encryptedPrivateKeyBlobBuffer = await window.crypto.subtle.encrypt(
                { name: "AES-GCM", iv: privateKeyIv },
                derivedSymmetricKey,
                privateKeyBuffer
            );

            const encryptedPrivateKeyBlob = btoa(String.fromCharCode(...new Uint8Array(encryptedPrivateKeyBlobBuffer)));
            const privateKeyIvBase64 = btoa(String.fromCharCode(...new Uint8Array(privateKeyIv)));
            const kdfSaltBase64 = btoa(String.fromCharCode(...new Uint8Array(salt)));

            // === STEP 4: Send Encrypted Data to Server ===
            const response = await fetch('/inbox/create-inbox', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    mailboxId: mailboxId,
                    password: password,
                    publicKeyJwk: publicKeyJwk,
                    encryptedPrivateKeyBlob: encryptedPrivateKeyBlob,
                    privateKeyIv: privateKeyIvBase64,
                    kdfSalt: kdfSaltBase64
                }),
            });

            const result = await response.json();

            if (result.success) {
                // Populate success message links
                const publicUrlLink = document.getElementById('publicUrl');
                const readUrlLink = document.getElementById('readUrl');
                
                if (publicUrlLink) {
                    publicUrlLink.href = result.mailboxUrl;
                    publicUrlLink.textContent = result.mailboxUrl;
                }
                if (readUrlLink) {
                    readUrlLink.href = result.readUrl;
                    readUrlLink.textContent = result.readUrl;
                }
                
                successMessageDiv.style.display = 'block';
                createInboxForm.reset(); // Clear form on success
            } else {
                displayErrors(result.errors || ["An unknown error occurred."]);
            }

        } catch (error) {
            console.error("Error during inbox creation:", error);
            displayErrors(["Failed to create inbox. Please check your input and try again. Technical error: " + error.message]);
        } finally {
            createButton.disabled = false;
            createButton.textContent = 'Create Inbox';
            loadingSpinner.style.display = 'none';
        }
    });

    // Helper function to display errors
    function displayErrors(errors) {
        if (errorMessagesDiv && errorListUl) {
            errorListUl.innerHTML = ''; // Clear previous list items
            errors.forEach(e => {
                const li = document.createElement('li');
                li.textContent = e;
                errorListUl.appendChild(li);
            });
            errorMessagesDiv.style.display = 'block'; // Show the error div
        }
    }

    // Helper function to clear all feedback messages
    function clearFeedback() {
        if (errorMessagesDiv) {
            errorMessagesDiv.style.display = 'none';
            if (errorListUl) errorListUl.innerHTML = '';
        }
        if (successMessageDiv) {
            successMessageDiv.style.display = 'none';
        }
    }
});