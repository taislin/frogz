// databases/inbox_db.js

const pool = require("../postgres.js");
const bcrypt = require("bcryptjs");
const { get_timestamps } = require("../utils.js");

// === TABLE CREATION ===
async function createTables() {
    try {
        const createMailboxesTableQuery = `
            CREATE TABLE IF NOT EXISTS mailboxes (
                id TEXT PRIMARY KEY,
                public_key_jwk TEXT NOT NULL,
                encrypted_private_key_blob TEXT NOT NULL,
                private_key_iv TEXT NOT NULL,
                kdf_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at BIGINT NOT NULL
            );
        `;
        await pool.query(createMailboxesTableQuery);

        const createMessagesTableQuery = `
            CREATE TABLE IF NOT EXISTS messages (
                message_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                mailbox_id TEXT NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
                encrypted_content TEXT NOT NULL,
                message_iv TEXT NOT NULL,
                encrypted_symmetric_key TEXT NOT NULL,
                created_at BIGINT NOT NULL
            );
        `;
        await pool.query(createMessagesTableQuery);

        console.log("Inbox database tables checked/created successfully.");
    } catch (err) {
        console.error("Error creating Inbox database tables:", err);
        process.exit(1);
    }
}

// === MAILBOX MANAGEMENT ===
async function createMailbox(id, publicKeyJwk, encryptedPrivateKeyBlob, privateKeyIv, kdfSalt, passwordPlaintext) {
    try {
        const passwordHash = await bcrypt.hash(passwordPlaintext, 10);
        const createdAt = new Date().getTime();

        const query = `
            INSERT INTO mailboxes (id, public_key_jwk, encrypted_private_key_blob, private_key_iv, kdf_salt, password_hash, created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7)
            RETURNING id;
        `;
        const result = await pool.query(query, [id, publicKeyJwk, encryptedPrivateKeyBlob, privateKeyIv, kdfSalt, passwordHash, createdAt]);
        return result.rows[0].id;
    } catch (err) {
        if (err.code === '23505') {
            throw new Error('Mailbox ID already exists.');
        }
        console.error("Error creating mailbox:", err);
        throw new Error('Failed to create mailbox.');
    }
}

async function getMailboxPublicKey(mailboxId) {
    try {
        const result = await pool.query("SELECT public_key_jwk FROM mailboxes WHERE id = $1", [mailboxId]);
        return result.rows[0] ? result.rows[0].public_key_jwk : null;
    } catch (err) {
        console.error("Error fetching mailbox public key:", err);
        throw new Error('Failed to retrieve mailbox public key.');
    }
}

async function getMailboxDetailsForOwner(mailboxId, password) {
    try {
        const result = await pool.query("SELECT password_hash, encrypted_private_key_blob, private_key_iv, kdf_salt FROM mailboxes WHERE id = $1", [mailboxId]);
        const mailbox = result.rows[0];

        if (!mailbox) {
            return null;
        }

        const passwordMatch = await bcrypt.compare(password, mailbox.password_hash);
        if (!passwordMatch) {
            return null;
        }

        return {
            encrypted_private_key_blob: mailbox.encrypted_private_key_blob,
            private_key_iv: mailbox.private_key_iv,
            kdf_salt: mailbox.kdf_salt
        };

    } catch (err) {
        console.error("Error authenticating or getting mailbox details:", err);
        throw new Error('Authentication failed or internal error.');
    }
}

// === MESSAGE MANAGEMENT ===

async function storeMessage(mailboxId, encryptedContent, messageIv, encryptedSymmetricKey) {
    try {
        const createdAt = new Date().getTime();
        const query = `
            INSERT INTO messages (mailbox_id, encrypted_content, message_iv, encrypted_symmetric_key, created_at)
            VALUES ($1,$2,$3,$4,$5)
            RETURNING message_id;
        `;
        const result = await pool.query(query, [mailboxId, encryptedContent, messageIv, encryptedSymmetricKey, createdAt]);
        return result.rows[0].message_id;
    } catch (err) {
        console.error("[DB ERROR storeMessage] Error executing SQL INSERT into messages table:", err);
        throw new Error('Failed to store message.');
    }
}

async function getMessagesForMailbox(mailboxId) {
    try {
        const result = await pool.query("SELECT message_id, encrypted_content, message_iv, encrypted_symmetric_key, created_at FROM messages WHERE mailbox_id = $1 ORDER BY created_at DESC", [mailboxId]);
        return result.rows;
    } catch (err) {
        console.error("Error retrieving messages:", err);
        throw new Error('Failed to retrieve messages.');
    }
}

// ADDED: Function to delete a single message by its ID and mailbox ID
async function deleteMessageById(messageId, mailboxId) {
    try {
        const result = await pool.query("DELETE FROM messages WHERE message_id = $1 AND mailbox_id = $2 RETURNING message_id;", [messageId, mailboxId]);
        return result.rowCount > 0; // True if a message was deleted
    } catch (err) {
        console.error(`Error deleting message ${messageId} for mailbox ${mailboxId}:`, err);
        throw new Error('Failed to delete message.');
    }
}

// ADDED: Function to delete all messages for a specific mailbox
async function deleteAllMessagesForMailbox(mailboxId) {
    try {
        const result = await pool.query("DELETE FROM messages WHERE mailbox_id = $1 RETURNING message_id;", [mailboxId]);
        return result.rowCount; // Number of messages deleted
    } catch (err) {
        console.error(`Error deleting all messages for mailbox ${mailboxId}:`, err);
        throw new Error('Failed to delete all messages.');
    }
}


async function deleteMessagesOlderThan(weeks) {
    try {
        const cutoffTime = new Date().getTime() - (weeks * 7 * 24 * 60 * 60 * 1000);
        const result = await pool.query("DELETE FROM messages WHERE created_at < $1 RETURNING message_id;", [cutoffTime]);
        console.log(`Deleted ${result.rowCount} FrogPost messages older than ${weeks} weeks.`);
        return result.rowCount;
    } catch (err) {
        console.error("Error deleting old FrogPost messages:", err);
        throw new Error('Failed to delete old messages.');
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
    deleteMessageById, // EXPORTED
    deleteAllMessagesForMailbox, // EXPORTED
    deleteMessagesOlderThan,
};