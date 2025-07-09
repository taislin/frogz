// static/js/send_message.js

document.addEventListener("DOMContentLoaded", () => {
	const sendMessageForm = document.getElementById("sendMessageForm");
	const messageContentInput = document.getElementById("messageContent");
	const charCountSpan = document.getElementById("charCount");
	const sendButton = document.getElementById("sendButton");
	const loadingSpinner = document.getElementById("loadingSpinner");
	const successMessageDiv = document.getElementById("success-message");
	const errorMessagesDiv = document.getElementById("error-messages");
	const errorList = document.getElementById("error-list");

	if (errorMessagesDiv) errorMessagesDiv.style.display = "none";
	if (successMessageDiv) successMessageDiv.style.display = "none";

	const publicKeyJwkElement = document.getElementById("publicKeyJwk");

	let recipientPublicKeyJwk;
	let recipientPublicKey = null; // Will store the imported public key

	// === Client-side Public Key Parsing and Importing ===
	// This runs immediately on load to prepare the key for encryption
	async function initializePublicKey() {
		if (!publicKeyJwkElement) {
			displayErrors([
				"Critical Error: Public key container not found in HTML. Cannot encrypt message.",
			]);
			sendButton.disabled = true;
			return;
		}

		try {
			const jwkString = publicKeyJwkElement.textContent.trim(); // Trim any whitespace
			if (!jwkString || jwkString === "null") {
				// Check for empty or literal 'null' string
				// This means the mailbox ID likely doesn't exist, or the server failed to provide the key
				displayErrors([
					"Critical Error: Mailbox not found or public key data is missing. Cannot send message.",
				]);
				sendButton.disabled = true;
				return;
			}
			recipientPublicKeyJwk = JSON.parse(jwkString); // Parse the JSON string

			recipientPublicKey = await window.crypto.subtle.importKey(
				"jwk",
				recipientPublicKeyJwk,
				{ name: "RSA-OAEP", hash: "SHA-256" },
				false, // not extractable
				["encrypt"] // only need encrypt usage for public key
			);
		} catch (error) {
			console.error(
				"Error parsing or importing recipient public key:",
				error
			);
			displayErrors([
				"Critical Error: Failed to load encryption key. Message cannot be sent. (Technical: " +
					error.message +
					")",
			]);
			sendButton.disabled = true;
			return;
		}
		console.log("Recipient public key successfully loaded."); // Debugging confirmation
	}
	initializePublicKey(); // Call this function on DOM load

	// === Character Count Update ===
	messageContentInput.addEventListener("input", () => {
		charCountSpan.textContent = `${messageContentInput.value.length} / ${messageContentInput.maxLength} characters`;
	});
	charCountSpan.textContent = `${messageContentInput.value.length} / ${messageContentInput.maxLength} characters`;

	// === Form Submission Handler ===
	sendMessageForm.addEventListener("submit", async (event) => {
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

		if (!recipientPublicKey) {
			// Ensure key is actually loaded before trying to use it
			displayErrors([
				"Encryption key not ready. Please wait a moment and try again. (If issue persists, refresh page).",
			]);
			return;
		}

		sendButton.disabled = true;
		sendButton.textContent = "Sending...";
		loadingSpinner.style.display = "inline-block";

		try {
			const encoder = new TextEncoder();
			const messageBuffer = encoder.encode(messageContent);

			// === STEP 1: Generate a random, single-use Symmetric Key (AES-GCM) ===
			const symmetricKey = await window.crypto.subtle.generateKey(
				{ name: "AES-GCM", length: 256 },
				true,
				["encrypt", "decrypt"]
			);

			// === STEP 2: Encrypt the Message Content with the Symmetric Key ===
			const messageIv = window.crypto.getRandomValues(new Uint8Array(12));
			const encryptedContentBuffer = await window.crypto.subtle.encrypt(
				{ name: "AES-GCM", iv: messageIv },
				symmetricKey,
				messageBuffer
			);

			// === STEP 3: Encrypt the Symmetric Key itself with the Recipient's Public Key (RSA-OAEP) ===
			const exportedSymmetricKey = await window.crypto.subtle.exportKey(
				"raw",
				symmetricKey
			);
			const encryptedSymmetricKeyBuffer =
				await window.crypto.subtle.encrypt(
					{ name: "RSA-OAEP" },
					recipientPublicKey,
					exportedSymmetricKey
				);

			// Convert ArrayBuffers to Base64 strings for storage/transmission
			const encryptedContent = btoa(
				String.fromCharCode(...new Uint8Array(encryptedContentBuffer))
			);
			const messageIvBase64 = btoa(
				String.fromCharCode(...new Uint8Array(messageIv))
			);
			const encryptedSymmetricKeyBase64 = btoa(
				String.fromCharCode(
					...new Uint8Array(encryptedSymmetricKeyBuffer)
				)
			);

			const mailboxId = window.location.pathname.split("/")[2];

			const response = await fetch(`/inbox/${mailboxId}/send-message`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					encryptedContent: encryptedContent,
					messageIv: messageIvBase64,
					encryptedSymmetricKey: encryptedSymmetricKeyBase64,
				}),
			});

			const result = await response.json();

			if (result.success) {
				successMessageDiv.style.display = "block";
				sendMessageForm.reset();
				charCountSpan.textContent = `${messageContentInput.value.length} / ${messageContentInput.maxLength} characters`;
			} else {
				displayErrors(result.errors || ["An unknown error occurred."]);
			}
		} catch (error) {
			console.error("Error during message encryption or sending:", error);
			displayErrors([
				"Failed to send message securely. Please try again. Technical error: " +
					error.message,
			]);
		} finally {
			sendButton.disabled = false;
			sendButton.textContent = "Send Message";
			loadingSpinner.style.display = "none";
		}
	});

	function displayErrors(errors) {
		if (errorMessagesDiv && errorList) {
			errorList.innerHTML = "";
			errors.forEach((e) => {
				const li = document.createElement("li");
				li.textContent = e;
				errorList.appendChild(li);
			});
			errorMessagesDiv.style.display = "block";
		}
	}

	function clearFeedback() {
		if (errorMessagesDiv) {
			errorMessagesDiv.style.display = "none";
			errorList.innerHTML = "";
		}
		if (successMessageDiv) {
			successMessageDiv.style.display = "none";
		}
	}
});
