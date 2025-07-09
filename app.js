const express = require("express");
const path = require("path");
const snarkdown = require("snarkdown");
require("dotenv").config();

// ADDED: Require rate limiting library
const rateLimit = require("express-rate-limit");
// ADDED: Require pool directly for graceful shutdown
const pool = require("./postgres.js"); // Ensure this imports the pool instance directly

const {
	createTable,
	editExistingPage,
	processEdit,
	findPage,
	submitPage,
	randomPage,
	get_timestamps,
} = require("./databases.js");

const app = express();
const eta = require("eta");
const port = process.env.PORT || 3000;

app.engine("eta", eta.renderFile);
app.set("view engine", "eta");
app.set("views", "./views");
const Styles = require("./styles.json");

// ADDED: Call createTable only once at startup
createTable();

// ADDED: HTTP Security Headers Middleware
// These headers help prevent common web vulnerabilities without adding frontend bloat.
app.use((req, res, next) => {
	res.setHeader("X-Content-Type-Options", "nosniff"); // Prevent MIME-sniffing attacks
	res.setHeader("X-Frame-Options", "DENY"); // Prevent clickjacking
	// Strict-Transport-Security (HSTS): Enforce HTTPS. ONLY enable if your site is always HTTPS.
	// Otherwise, users on HTTP might get errors.
	if (process.env.NODE_ENV === "production" && req.secure) {
		// Only set in production AND if request is HTTPS
		res.setHeader(
			"Strict-Transport-Security",
			"max-age=31536000; includeSubDomains; preload"
		);
	}
	// Content-Security-Policy (CSP): Restrict sources of content.
	// 'unsafe-inline' for style-src is used here because custom CSS
	// can be injected by users directly into pages. Re-evaluate if you remove that feature.
	res.setHeader(
		"Content-Security-Policy",
		"default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self';"
	);
	next();
});

app.use(express.static(path.join(__dirname, ".//static")));
app.use(
	express.urlencoded({
		extended: true,
	})
);

// ADDED: Rate Limiter Configuration
// Applies a limit of 100 requests per 15 minutes per IP.
// This helps prevent brute-force attacks on pages and form submissions.
const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000, // 15 minutes
	max: 100, // Limit each IP to 100 requests per windowMs
	standardHeaders: true, // Return rate limit info in the headers
	legacyHeaders: false, // Disable X-RateLimit-*-headers
	message:
		"Too many requests from this IP, please try again after 15 minutes.",
});

// Apply rate limiting to all POST requests
app.post("/submit", apiLimiter, (req, res) => {
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
	let _action = "edit";
	let errormsg = "<strong>Errors:</strong><br>";
	errormsg = doValidations(req, errormsg);
	if (errormsg != "<strong>Errors:</strong><br>") {
		reRenderPage(req, res, _action, errormsg);
	} else {
		processEdit(req, res, errormsg);
	}
});
// ADDED: Simple Admin Endpoint for Takedown/Verification
// This would be password-protected and ideally have a secret URL/token too.
// For now, let's use a very basic password check.
// usage: curl -X POST -d "pageId=malicious_page&adminPassword=your_admin_secret&action=delete"
app.post("/admin/moderate", apiLimiter, async (req, res) => {
	const { pageId, adminPassword, action } = req.body;
	const expectedAdminPasswordHash = process.env.ADMIN_PASSWORD_HASH; // Store this in .env (bcrypt hashed)

	if (!adminPassword || !pageId || !action) {
		return res.status(400).send("Missing parameters.");
	}

	// Hash the submitted admin password and compare
	const match = await bcrypt.compare(
		adminPassword,
		expectedAdminPasswordHash
	);

	if (!match) {
		return res.status(401).send("Unauthorized.");
	}

	try {
		if (action === "delete") {
			await pool.query("DELETE FROM documents WHERE id = $1", [pageId]);
			res.status(200).send(`Page '${pageId}' deleted successfully.`);
		} else if (action === "unindex") {
			await pool.query("UPDATE documents SET indexed = 0 WHERE id = $1", [
				pageId,
			]);
			res.status(200).send(`Page '${pageId}' unindexed successfully.`);
		} else {
			res.status(400).send("Invalid action.");
		}
	} catch (error) {
		console.error("Admin moderation error:", error);
		res.status(500).send("An error occurred during moderation.");
	}
});
// ADDED: Route for downloading raw page content
app.get("/:pgpr/raw", apiLimiter, async (req, res) => {
	try {
		const pageURL = req.params.pgpr;
		const { rows } = await pool.query(
			"SELECT content FROM documents WHERE id = $1",
			[pageURL]
		);

		const pageContent = rows[0];
		if (pageContent) {
			// Set headers for file download
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
		console.error("Error serving raw page content:", error);
		res.status(500).send("An internal server error occurred.");
	}
});
app.get("/explore", apiLimiter, async (req, res) => {
	try {
		// Fetch recent indexed pages (e.g., top 20, ordered by creation date)
		const { rows } = await pool.query(
			"SELECT id, created_at FROM documents WHERE indexed = 1 ORDER BY created_at DESC LIMIT 20;"
		);

		// Format timestamps for display
		const pages = rows.map((page) => ({
			id: page.id,
			created_at_readable: get_timestamps(
				page.created_at,
				page.created_at,
				req.headers["accept-language"]
			),
		}));

		res.render("explore", { pages: pages });
	} catch (error) {
		console.error("Error fetching explore pages:", error);
		res.status(500).send("Could not load explore page.");
	}
});

// ADDED: Health Check Endpoint
app.get("/health", async (_req, res) => {
	try {
		await pool.query("SELECT 1"); // Simple DB connection test
		res.status(200).send("OK");
	} catch (error) {
		console.error("Health check failed:", error);
		res.status(500).send("Database connection failed");
	}
});

// Existing GET routes
app.get("/", function (_req, res) {
	res.render("index");
});
app.get("/new", function (_req, res) {
	res.render("new", {
		errors: "",
		pageid: "",
		Styles: Styles,
		action: "submit",
		preview: "",
		indexable: true,
	});
});
app.get("/edit", function (_req, res) {
	res.render("new", {
		errors: "",
		pageid: "",
		Styles: Styles,
		action: "edit",
		preview: "",
		indexable: true,
	});
});
app.get("/terms", function (_req, res) {
	res.render("terms");
});
app.get("/about", function (_req, res) {
	res.render("about");
});
app.get("/styles", function (_req, res) {
	res.render("styles", {
		partials: { styledemo: "styledemo" },
		Styles: Styles,
		style: "classic",
	});
});
app.post("/styles", (req, res) => {
	// Apply rate limit here too, if it's a form submission
	res.render("styles", {
		partials: { styledemo: "styledemo" },
		Styles: Styles,
		style: req.body.style,
	});
});

app.get("/random", function (_req, res) {
	randomPage(res);
});
app.get("/:pgpr", function (req, res) {
	findPage(req, res);
});
app.get("/:pgpr/edit", function (req, res) {
	editExistingPage(req, res);
});
app.get("/:master/:pgpr", function (req, res) {
	findPage(req, res, req.params.master);
});
app.get("/:master/:pgpr/edit", function (req, res) {
	editExistingPage(req, res, req.params.master);
});
app.get("/rss.xml", apiLimiter, async (req, res) => {
	try {
		const { rows } = await pool.query(
			"SELECT id, created_at, content FROM documents WHERE indexed = 1 ORDER BY created_at DESC LIMIT 15;"
		); // Latest 15 indexed pages

		let rssItems = "";
		for (const page of rows) {
			const pageUrl = `https://frogz.club/${page.id}`; // Ensure this matches your live domain
			const pubDate = new Date(page.created_at).toUTCString();
			const title = page.id; // Or try to extract first H1 from content
			const description =
				page.content.substring(0, 200).replace(/<[^>]*>?/gm, "") +
				"..."; // Basic plain text summary

			rssItems += `
                <item>
                    <title><![CDATA[${title}]]></title>
                    <link>${pageUrl}</link>
                    <guid>${pageUrl}</guid>
                    <pubDate>${pubDate}</pubDate>
                    <description><![CDATA[${description}]]></description>
                </item>
            `;
		}

		const rssFeed = `<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
        <channel>
            <title>FROGZ - New Pages</title>
            <link>https://frogz.club</link>
            <atom:link href="https://frogz.club/rss.xml" rel="self" type="application/rss+xml" />
            <description>Recently created pages on FROGZ, the anti-bloat microhosting service.</description>
            <language>en-us</language>
            <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
            ${rssItems}
        </channel>
        </rss>`;

		res.setHeader("Content-Type", "application/rss+xml");
		res.send(rssFeed);
	} catch (error) {
		console.error("Error generating RSS feed:", error);
		res.status(500).send("Error generating RSS feed.");
	}
});
app.use((req, res) => {
	res.status(404).render("404");
});
// CHANGED: Capture server instance for graceful shutdown
const server = app.listen(port, () => {
	console.log(`
    ______ _____   ____   _____ ______
   |  ____|  __ \\ / __ \\ / ____|___  /
   | |__  | |__) | |  | | |  __   / / 
   |  __| |  _  /| |  | | | |_ | / /  
   | |    | | \\ \\| |__| | |__| |/ /__ 
   |_|    |_|  \\_\\\\____/ \\_____/_____|
  `);
	console.log(`STATUS: App running on port ${port}.`);
});

// ADDED: Graceful Shutdown
// Ensures that the Express server and the PostgreSQL connection pool close cleanly
// when the process receives a termination signal (e.g., from Docker, Ctrl+C).
process.on("SIGINT", () => {
	console.log("SIGINT signal received: closing HTTP server");
	server.close(() => {
		console.log("HTTP server closed.");
		pool.end()
			.then(() => {
				// Close DB pool
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
				// Close DB pool
				console.log("PostgreSQL pool closed.");
				process.exit(0);
			})
			.catch((err) => {
				console.error("Error closing PostgreSQL pool:", err);
				process.exit(1);
			});
	});
});

function validateAlphanumeric(str) {
	let regexp = /^[a-z0-9-_]+$/i;
	return str.search(regexp) !== -1;
}
function validateLength(str, min = 0, max = 100) {
	let strl = str.length;
	return !(strl < min || strl > max);
}

function doValidations(req, errormsg = "") {
	// ADDED: Prevent creating/editing specific reserved routes
	const reservedPageIds = [
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
	];
	if (reservedPageIds.includes(req.body.pageid.toLowerCase())) {
		errormsg += `The page name '${req.body.pageid}' is reserved. Please choose another name.<br>`;
	}

	if (!validateAlphanumeric(req.body.pageid)) {
		let _pid = req.body.pageid.replace("/", ""); // Handle subpage case for alpha validation
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
		// Note: 0 length password allowed, per current spec
		errormsg += "The Password needs to be under 50 characters!<br>";
	}
	if (!validateLength(req.body.content, 1, 50000)) {
		errormsg +=
			"The Content cannot be empty and needs to be under 50,000 characters!<br>";
	}

	return errormsg;
}

function reRenderPage(req, res, _action, errormsg, _preview = false) {
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
		style: req.body.style,
		Styles: Styles,
		action: _action,
		preview: dopreview,
		indexed: _indexed,
	});
}
