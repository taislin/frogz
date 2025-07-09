// app.js (Combined and Regenerated, CRITICAL Routing Order Fix)

const express = require("express");
const path = require("path");
require("dotenv").config();
const cron = require("node-cron");

const rateLimit = require("express-rate-limit");
const pool = require("./postgres.js");
const { get_timestamps, escapeHtml } = require("./utils.js");
const bcrypt = require("bcryptjs");
const snarkdown = require("snarkdown"); // Ensure snarkdown is imported here for reRenderPage

const Styles = require("./styles.json");

// FROGZ Database Functions
const {
	createTable: createFrogzTable,
	editExistingPage,
	processEdit,
	findPage,
	submitPage,
	randomPage,
} = require("./databases/frogz_db.js");

// Inbox Database Functions
const {
	createTables: createInboxTables,
	createMailbox,
	getMailboxPublicKey,
	getMailboxDetailsForOwner,
	storeMessage,
	getMessagesForMailbox,
	deleteMessagesOlderThan,
} = require("./databases/inbox_db.js");

const app = express();
const eta = require("eta");
const port = process.env.PORT || 3000;

// === APP SETUP ===
app.engine("eta", eta.renderFile);
app.set("view engine", "eta");
app.set("views", "./views");

// Create database tables for both services on startup
createFrogzTable();
createInboxTables();

// === MIDDLEWARE ===
app.use((req, res, next) => {
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	if (process.env.NODE_ENV === "production" && req.secure) {
		res.setHeader(
			"Strict-Transport-Security",
			"max-age=31536000; includeSubDomains; preload"
		);
	}
	res.setHeader(
		"Content-Security-Policy",
		"default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; worker-src 'self' blob:;"
	);
	next();
});

app.use(express.static(path.join(__dirname, "static")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 100,
	standardHeaders: true,
	legacyHeaders: false,
	message:
		"Too many requests from this IP, please try again after 15 minutes.",
});

// ==========================================================
// IMPORTANT: ROUTING ORDER IS CRITICAL!
// Specific API routes (return JSON) should come FIRST.
// Then specific HTML render routes.
// Then general dynamic HTML render routes (like /:pgpr).
// ==========================================================

// === API ENDPOINTS (RETURN JSON - MUST BE FIRST) ===

// 1. Inbox API Endpoints (POST requests typically return JSON)
app.post("/inbox/create-inbox", apiLimiter, async (req, res) => {
	const {
		mailboxId,
		password,
		publicKeyJwk,
		encryptedPrivateKeyBlob,
		privateKeyIv,
		kdfSalt,
	} = req.body;
	const errors = [];
	const reservedIds = [
		"create",
		"read",
		"send",
		"about",
		"terms",
		"admin",
		"api",
		"static",
		"js",
		"css",
		"inbox",
		"frogz",
	];
	if (
		!mailboxId ||
		mailboxId.length < 3 ||
		mailboxId.length > 50 ||
		!/^[a-z0-9-]+$/.test(mailboxId) ||
		reservedIds.includes(mailboxId.toLowerCase())
	) {
		errors.push(
			"Invalid or reserved mailbox ID. Must be 3-50 lowercase alphanumeric characters or hyphens."
		);
	}
	if (!password || password.length < 8) {
		errors.push("Password must be at least 8 characters long.");
	}
	if (
		!publicKeyJwk ||
		!encryptedPrivateKeyBlob ||
		!privateKeyIv ||
		!kdfSalt
	) {
		errors.push(
			"Missing encryption parameters. Client-side error? (Try refreshing)"
		);
	}

	if (errors.length > 0) {
		return res.status(400).json({ success: false, errors: errors });
	}

	try {
		const createdId = await createMailbox(
			mailboxId,
			publicKeyJwk,
			encryptedPrivateKeyBlob,
			privateKeyIv,
			kdfSalt,
			password
		);
		res.json({
			success: true,
			mailboxUrl: `${req.protocol}://${req.get(
				"host"
			)}/inbox/${createdId}/send`,
			readUrl: `${req.protocol}://${req.get(
				"host"
			)}/inbox/${createdId}/read`,
		});
	} catch (error) {
		console.error("Error creating FrogPost mailbox:", error);
		if (error.message === "Mailbox ID already exists.") {
			return res.status(409).json({
				success: false,
				errors: [
					"This Mailbox ID is already taken. Please choose another.",
				],
			});
		}
		res.status(500).json({
			success: false,
			errors: ["Failed to create mailbox due to a server error."],
		});
	}
});

app.post("/inbox/:mailboxId/send-message", apiLimiter, async (req, res) => {
	console.log("[DEBUG send-message] Route hit for:", req.params.mailboxId);
	console.log("[DEBUG send-message] Request Body:", req.body); // This should show your encrypted data

	const mailboxId = req.params.mailboxId;
	const { encryptedContent, messageIv, encryptedSymmetricKey } = req.body;

	if (!encryptedContent || !messageIv || !encryptedSymmetricKey) {
		console.log("[DEBUG send-message] Validation failed: Missing data.");
		// Ensure this sends JSON
		return res.status(400).json({
			success: false,
			errors: ["Missing encrypted message data."],
		});
	}

	try {
		console.log(
			"[DEBUG send-message] Attempting to store message in DB..."
		);
		const messageId = await storeMessage(
			mailboxId,
			encryptedContent,
			messageIv,
			encryptedSymmetricKey
		);
		console.log(
			"[DEBUG send-message] Message stored successfully with ID:",
			messageId
		);
		// Ensure this sends JSON
		res.json({ success: true, messageId: messageId });
	} catch (error) {
		// Log the actual server-side error here
		console.error(
			"[ERROR send-message] Server-side error during message storage:",
			error
		);
		// Ensure this sends JSON
		res.status(500).json({
			success: false,
			errors: ["Failed to send message due to a server error."],
		});
	}
});

app.post(
	"/inbox/:mailboxId/retrieve-messages",
	apiLimiter,
	async (req, res) => {
		const mailboxId = req.params.mailboxId;
		const { password } = req.body;

		if (!password) {
			return res
				.status(400)
				.json({ success: false, errors: ["Password is required."] });
		}

		try {
			const mailboxDetails = await getMailboxDetailsForOwner(
				mailboxId,
				password
			);
			if (!mailboxDetails) {
				return res.status(401).json({
					success: false,
					errors: ["Invalid mailbox ID or password."],
				});
			}

			const messages = await getMessagesForMailbox(mailboxId);

			const encryptedMessages = messages.map((msg) => ({
				message_id: msg.message_id,
				encrypted_content: msg.encrypted_content,
				message_iv: msg.message_iv,
				encrypted_symmetric_key: msg.encrypted_symmetric_key,
				created_at: msg.created_at,
				created_at_readable: get_timestamps(
					msg.created_at,
					msg.created_at,
					req.headers["accept-language"]
				),
			}));

			res.json({
				success: true,
				encryptedPrivateKeyBlob:
					mailboxDetails.encrypted_private_key_blob,
				privateKeyIv: mailboxDetails.private_key_iv,
				kdfSalt: mailboxDetails.kdf_salt,
				messages: encryptedMessages,
			});
		} catch (error) {
			console.error("Error retrieving messages:", error);
			res.status(500).json({
				success: false,
				errors: ["Failed to retrieve messages."],
			});
		}
	}
);

// 2. FROGZ API Endpoints (POST requests typically return JSON, raw content is text/plain)
app.post("/submit", apiLimiter, (req, res) => {
	// This is FROGZ page submission
	if (req.body.preview) {
		let cdate = new Date();
		let rend = cdate.toLocaleTimeString("en-GB", {
			hour: "2-digit",
			minute: "2-digit",
		});
		reRenderPage(req, res, "submit", "Preview rendered at " + rend, true);
	} else {
		let _action = "submit";
		let errormsg = "<strong>Errors:</strong><br>";
		errormsg = doValidations(req, errormsg);
		if (errormsg != "<strong>Errors:</strong><br>") {
			reRenderPage(req, res, _action, errormsg);
		} else {
			submitPage(req, res);
		}
	}
});
app.post("/edit", apiLimiter, (req, res) => {
	// This is FROGZ page edit
	let _action = "edit";
	let errormsg = "<strong>Errors:</strong><br>";
	errormsg = doValidations(req, errormsg);
	if (errormsg != "<strong>Errors:</strong><br>") {
		reRenderPage(req, res, _action, errormsg);
	} else {
		processEdit(req, res, errormsg);
	}
});
app.get("/:pgpr/raw", apiLimiter, async (req, res) => {
	// This is FROGZ raw content download
	try {
		const pageURL = req.params.pgpr;
		const { rows } = await pool.query(
			"SELECT content FROM documents WHERE id = $1",
			[pageURL]
		);

		const pageContent = rows[0];
		if (pageContent) {
			res.setHeader("Content-Type", "text/plain; charset=utf-8");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="${pageURL}.md"`
			);
			res.send(pageContent.content);
		} else {
			res.status(404).send("Page not found.");
		}
	} catch (error) {
		console.error("Error serving raw FROGZ page content:", error);
		res.status(500).send("An internal server error occurred.");
	}
});

// 3. Admin Endpoint (JSON response)
app.post("/admin/moderate", apiLimiter, async (req, res) => {
	const { pageId, adminPassword, action } = req.body;
	const expectedAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

	if (!adminPassword || !pageId || !action) {
		return res.status(400).send("Missing parameters.");
	}

	const match = await bcrypt.compare(
		adminPassword,
		expectedAdminPasswordHash
	);

	if (!match) {
		return res.status(401).send("Unauthorized.");
	}

	try {
		if (action === "delete_frogz_page") {
			await pool.query("DELETE FROM documents WHERE id = $1", [pageId]);
			res.status(200).send(
				`FROGZ Page '${pageId}' deleted successfully.`
			);
		} else if (action === "unindex_frogz_page") {
			await pool.query("UPDATE documents SET indexed = 0 WHERE id = $1", [
				pageId,
			]);
			res.status(200).send(
				`FROGZ Page '${pageId}' unindexed successfully.`
			);
		} else if (action === "delete_inbox_mailbox") {
			await pool.query("DELETE FROM mailboxes WHERE id = $1", [pageId]);
			res.status(200).send(
				`FrogPost Mailbox '${pageId}' and its messages deleted successfully.`
			);
		} else {
			res.status(400).send("Invalid admin action.");
		}
	} catch (error) {
		console.error("Admin moderation error:", error);
		res.status(500).send("An error occurred during moderation.");
	}
});

// === HTML PAGE RENDERING ROUTES (Order from specific to general) ===

// Common/Marketing Pages
app.get("/", apiLimiter, function (_req, res) {
	res.render("index");
});
app.get("/terms", apiLimiter, function (_req, res) {
	res.render("terms");
});
app.get("/about", apiLimiter, function (_req, res) {
	res.render("about");
});
app.get("/styles", apiLimiter, function (_req, res) {
	res.render("styles", {
		partials: { styledemo: "styledemo" },
		Styles: Styles,
		style: "classic",
	});
});
app.post("/styles", apiLimiter, (req, res) => {
	res.render("styles", {
		partials: { styledemo: "styledemo" },
		Styles: Styles,
		style: req.body.style,
	});
}); // This might be an API if it only changes data. Assuming it renders HTML here.
app.get("/random", apiLimiter, function (_req, res) {
	randomPage(res);
}); // Redirects to a page, HTML

// FrogPost HTML Pages
app.get("/inbox/create", apiLimiter, (req, res) => {
	res.render("create_inbox", { errors: null, mailboxId: null });
});
app.get("/inbox/:mailboxId/send", apiLimiter, async (req, res) => {
	const mailboxId = req.params.mailboxId;
	console.log(
		"[APP DEBUG] Rendering send_message page for mailbox:",
		mailboxId
	);
	try {
		let publicKeyJwk = await getMailboxPublicKey(mailboxId);

		if (publicKeyJwk === null) {
			console.log(
				"[APP DEBUG] Public Key JWK is NULL from DB, mailbox not found or key missing."
			);
			return res.status(404).render("404");
		}

		console.log(
			"[APP DEBUG] Public Key JWK fetched and passed to template (truncated):",
			publicKeyJwk ? publicKeyJwk.substring(0, 50) + "..." : "null"
		);
		console.log(
			"[APP DEBUG] Type of publicKeyJwk passed to template:",
			typeof publicKeyJwk
		);

		// CRITICAL FIX: Pass the escapeHtml function to the template context
		res.render("send_message", {
			mailboxId: mailboxId,
			publicKeyJwk: publicKeyJwk,
			escapeHtml: escapeHtml,
		});
	} catch (error) {
		console.error("[APP ERROR] Error rendering send message page:", error);
		res.status(500).send("An internal server error occurred.");
	}
});

app.get("/inbox/:mailboxId/read", apiLimiter, async (req, res) => {
	const mailboxId = req.params.mailboxId;
	res.render("read_messages", {
		mailboxId: mailboxId,
		errors: null,
		messages: [],
		mailboxDetails: null,
	});
});

// FROGZ HTML Pages (Specific then general dynamic ones)
app.get("/new", apiLimiter, function (_req, res) {
	// Frogz create new page form
	res.render("new", {
		errors: "",
		pageid: "",
		Styles: Styles,
		action: "submit",
		preview: "",
		indexable: true,
	});
});
app.get("/edit", apiLimiter, function (_req, res) {
	// Frogz edit page form (for existing page by ID)
	res.render("new", {
		errors: "",
		pageid: "",
		Styles: Styles,
		action: "edit",
		preview: "",
		indexable: true,
	});
});
app.get("/:master/:pgpr/edit", apiLimiter, function (req, res) {
	// Frogz subpage edit form
	editExistingPage(req, res, req.params.master);
});
app.get("/:master/:pgpr", apiLimiter, function (req, res) {
	// Frogz general subpage view
	findPage(req, res, req.params.master);
});
app.get("/:pgpr/edit", apiLimiter, function (req, res) {
	// Frogz top-level page edit form
	editExistingPage(req, res);
});
app.get("/:pgpr", apiLimiter, function (req, res) {
	// Frogz general top-level page view
	findPage(req, res);
});

// === FROGZ helper functions (moved from app.js for organization) ===
function validateAlphanumeric(str) {
	let regexp = /^[a-z0-9-_]+$/i;
	return str.search(regexp) !== -1;
}
function validateLength(str, min = 0, max = 100) {
	let strl = str.length;
	return !(strl < min || strl > max);
}
function doValidations(req, errormsg = "") {
	const reservedFrogzPageIds = [
		"new",
		"edit",
		"terms",
		"about",
		"styles",
		"random",
		"health",
		"explore",
		"contact",
		"admin",
		"login",
		"signup",
		"news",
		"inbox",
	];
	if (reservedFrogzPageIds.includes(req.body.pageid.toLowerCase())) {
		errormsg += `The page name '${req.body.pageid}' is reserved. Please choose another name.<br>`;
	}
	if (!validateAlphanumeric(req.body.pageid)) {
		let _pid = req.body.pageid.replace("/", "");
		if (!validateAlphanumeric(_pid)) {
			errormsg +=
				"The page name (url) must be alphanumeric (allowing hyphens and underscores for hierarchy)!<br>";
		}
	}
	if (!validateLength(req.body.pageid, 1, 100)) {
		errormsg +=
			"The page name (url) cannot be empty and needs to be under 100 characters!<br>";
	}
	if (!validateLength(req.body.password, 0, 50)) {
		errormsg += "The Password needs to be under 50 characters!<br>";
	}
	if (!validateLength(req.body.content, 1, 50000)) {
		errormsg +=
			"The Content cannot be empty and needs to be under 50,000 characters!<br>";
	}
	return errormsg;
}
function reRenderPage(req, res, _action, errormsg, _preview = false) {
	// This function requires snarkdown, ensure it's imported at the top of app.js
	if (!snarkdown) {
		const snarkdown = require("snarkdown");
	} // Fallback if not global
	let dopreview = "";
	if (_preview && req.body.content) {
		dopreview = snarkdown(req.body.content);
	}
	let _indexed = false;
	if (req.body.indexable) {
		_indexed = true;
	}
	res.render("new", {
		_content: req.body.content,
		pageid: req.body.pageid,
		password: req.body.password,
		errors: errormsg,
		style: Styles, // Pass Styles directly, not req.body.style
		Styles: Styles,
		action: _action,
		preview: dopreview,
		indexed: _indexed,
	});
}

// === SCHEDULED TASKS ===
cron.schedule("0 3 * * *", async () => {
	console.log("Running daily message deletion job...");
	try {
		await deleteMessagesOlderThan(1);
	} catch (error) {
		console.error("Error during scheduled message deletion:", error);
	}
});

// === GLOBAL ERROR HANDLING / 404 ===
// This must be the absolute last middleware/route in your app.js
app.use((req, res) => {
	res.status(404).render("404");
});

// === START SERVER AND GRACEFUL SHUTDOWN ===
const server = app.listen(port, () => {
	console.log(`FROGZ & FrogPost services running on port ${port}.`);
});

process.on("SIGINT", () => {
	console.log("SIGINT signal received: closing HTTP server");
	server.close(() => {
		console.log("HTTP server closed.");
		pool.end()
			.then(() => {
				console.log("PostgreSQL pool closed.");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Error closing PostgreSQL pool:", err);
				process.exit(1);
			});
	});
});

process.on("SIGTERM", () => {
	console.log("SIGTERM signal received: closing HTTP server");
	server.close(() => {
		console.log("HTTP server closed.");
		pool.end()
			.then(() => {
				console.log("PostgreSQL pool closed.");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Error closing PostgreSQL pool:", err);
				process.exit(1);
			});
	});
});
