// databases.js (for the new Anti-Email Inbox service)

const pool = require("./../postgres.js");
const bcrypt = require("bcryptjs");
const crypto = require("crypto"); // Node.js built-in crypto for server-side
const { get_timestamps } = require("./../utils.js"); // Assuming you move get_timestamps here or create a utils file

// === TABLE CREATION ===
async function createTables() {
	try {
		// Mailboxes table: stores owner's encrypted private key and public key
		const createMailboxesTableQuery = `
            CREATE TABLE IF NOT EXISTS mailboxes (
                id TEXT PRIMARY KEY,                       -- The mailbox ID (e.g., 'myproject-feedback')
                public_key_jwk TEXT NOT NULL,              -- Recipient's Asymmetric Public Key (JWK format)
                encrypted_private_key_blob TEXT NOT NULL,  -- Recipient's Asymmetric Private Key (encrypted with derived symmetric key)
                private_key_iv TEXT NOT NULL,              -- IV for encrypting the private key blob
                kdf_salt TEXT NOT NULL,                    -- Salt for KDF (PBKDF2) to derive symmetric key from password
                password_hash TEXT NOT NULL,               -- bcrypt hash of the owner's password (for server-side login)
                created_at BIGINT NOT NULL
            );
        `;
		await pool.query(createMailboxesTableQuery);

		// Messages table: stores encrypted messages
		const createMessagesTableQuery = `
            CREATE TABLE IF NOT EXISTS messages (
                message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), -- Unique ID for each message
                mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE, -- Link to the mailbox
                encrypted_content TEXT NOT NULL,           -- The actual message content (encrypted with symmetric key)
                message_iv TEXT NOT NULL,                  -- IV for encrypting the message content
                encrypted_symmetric_key TEXT NOT NULL,     -- Symmetric key (used for message) encrypted by recipient's public key
                created_at BIGINT NOT NULL
            );
        `;
		await pool.query(createMessagesTableQuery);

		console.log("Database tables checked/created successfully.");
	} catch (err) {
		console.error("Error creating database tables:", err);
		process.exit(1); // Exit if tables can't be created, app won't function
	}
}

// === MAILBOX MANAGEMENT ===

async function createMailbox(
	id,
	publicKeyJwk,
	encryptedPrivateKeyBlob,
	privateKeyIv,
	kdfSalt,
	passwordPlaintext
) {
	try {
		const passwordHash = await bcrypt.hash(passwordPlaintext, 10);
		const createdAt = new Date().getTime();

		const query = `
            INSERT INTO mailboxes (id, public_key_jwk, encrypted_private_key_blob, private_key_iv, kdf_salt, password_hash, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id;
        `;
		const result = await pool.query(query, [
			id,
			publicKeyJwk,
			encryptedPrivateKeyBlob,
			privateKeyIv,
			kdfSalt,
			passwordHash,
			createdAt,
		]);
		return result.rows[0].id;
	} catch (err) {
		if (err.code === "23505") {
			// Unique violation error code
			throw new Error("Mailbox ID already exists.");
		}
		console.error("Error creating mailbox:", err);
		throw new Error("Failed to create mailbox.");
	}
}

async function getMailboxPublicKey(mailboxId) {
	try {
		const result = await pool.query(
			"SELECT public_key_jwk FROM mailboxes WHERE id = $1",
			[mailboxId]
		);
		return result.rows[0] ? result.rows[0].public_key_jwk : null;
	} catch (err) {
		console.error("Error fetching mailbox public key:", err);
		throw new Error("Failed to retrieve mailbox public key.");
	}
}

async function getMailboxDetailsForOwner(mailboxId, password) {
	try {
		const result = await pool.query(
			"SELECT password_hash, encrypted_private_key_blob, private_key_iv, kdf_salt FROM mailboxes WHERE id = $1",
			[mailboxId]
		);
		const mailbox = result.rows[0];

		if (!mailbox) {
			return null; // Mailbox not found
		}

		const passwordMatch = await bcrypt.compare(
			password,
			mailbox.password_hash
		);
		if (!passwordMatch) {
			return null; // Incorrect password
		}

		// Return sensitive parts only after successful authentication
		return {
			encrypted_private_key_blob: mailbox.encrypted_private_key_blob,
			private_key_iv: mailbox.private_key_iv,
			kdf_salt: mailbox.kdf_salt,
		};
	} catch (err) {
		console.error("Error authenticating or getting mailbox details:", err);
		throw new Error("Authentication failed or internal error.");
	}
}

// === MESSAGE MANAGEMENT ===

async function storeMessage(
	mailboxId,
	encryptedContent,
	messageIv,
	encryptedSymmetricKey
) {
	try {
		const createdAt = new Date().getTime();
		const query = `
            INSERT INTO messages (mailbox_id, encrypted_content, message_iv, encrypted_symmetric_key, created_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING message_id;
        `;
		const result = await pool.query(query, [
			mailboxId,
			encryptedContent,
			messageIv,
			encryptedSymmetricKey,
			createdAt,
		]);
		return result.rows[0].message_id;
	} catch (err) {
		console.error("Error storing message:", err);
		throw new Error("Failed to store message.");
	}
}

async function getMessagesForMailbox(mailboxId) {
	try {
		// Order by creation time, newest first
		const result = await pool.query(
			"SELECT message_id, encrypted_content, message_iv, encrypted_symmetric_key, created_at FROM messages WHERE mailbox_id = $1 ORDER BY created_at DESC",
			[mailboxId]
		);
		return result.rows; // Return all encrypted message details
	} catch (err) {
		console.error("Error retrieving messages:", err);
		throw new Error("Failed to retrieve messages.");
	}
}

async function deleteMessagesOlderThan(weeks) {
	try {
		const cutoffTime =
			new Date().getTime() - weeks * 7 * 24 * 60 * 60 * 1000; // Calculate milliseconds for `weeks`
		const result = await pool.query(
			"DELETE FROM messages WHERE created_at < $1 RETURNING message_id;",
			[cutoffTime]
		);
		console.log(
			`Deleted ${result.rowCount} messages older than ${weeks} weeks.`
		);
		return result.rowCount;
	} catch (err) {
		console.error("Error deleting old messages:", err);
		throw new Error("Failed to delete old messages.");
	}
}

// === EXPORTS ===
module.exports = {
	createTables,
	createMailbox,
	getMailboxPublicKey,
	getMailboxDetailsForOwner,
	storeMessage,
	getMessagesForMailbox,
	deleteMessagesOlderThan,
	// Add get_timestamps if it's placed here or in a utils file as noted
	get_timestamps, // Assuming get_timestamps function is defined here or imported from utils.js
};
