// databases/frogz_db.js (Renamed from original databases.js)
// Make sure to create a 'databases' directory and move this file there.

const pool = require("./../postgres.js");
require("dotenv").config();
const bcrypt = require("bcryptjs");
const snarkdown = require("snarkdown");
const { get_timestamps } = require("./../utils.js"); // Make sure utils.js is in the parent directory

const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

// Styles is not directly used here but was previously
// const Styles = require("../styles.json"); // Remove if not strictly needed here

async function createTable() {
	// Renamed from createTable to createFrogzTable in app.js import
	try {
		const querystring =
			"CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at BIGINT, edited_at BIGINT, hash TEXT, style TEXT, indexed INTEGER);";
		await pool.query(querystring);
	} catch (err) {
		console.error("Error creating FROGZ table:", err);
	}
}
async function createPage(content, pageid, date, hash, style, indexable) {
	await pool.query(
		"INSERT INTO documents (id, content, created_at, edited_at, hash, style, indexed) VALUES ($1,$2,$3,$3,$4,$5,$6)",
		[pageid, content, date, hash, style, indexable]
	);
}

async function editPage(req, res) {
	try {
		const date = new Date().getTime();
		const _indexed = req.body.indexable ? 1 : 0;
		await pool.query(
			"UPDATE documents SET content=$1, edited_at=$2, style=$4, indexed=$5 WHERE id=$3",
			[req.body.content, date, req.body.pageid, req.body.style, _indexed]
		);
		res.redirect(`/${req.body.pageid}`);
	} catch (err) {
		console.error("Error editing FROGZ page:", err);
		res.status(500).send(
			"An internal server error occurred while editing the FROGZ page."
		);
	}
}

async function findPage(req, res, sub = undefined) {
	try {
		let pageURL = sub ? `${sub}/${req.params.pgpr}` : req.params.pgpr;

		const { rows } = await pool.query(
			"SELECT * FROM documents WHERE id = $1",
			[pageURL]
		);
		const foundContent = rows[0];

		renderPage(req, res, foundContent, pageURL, sub);
	} catch (err) {
		console.error("Error finding FROGZ page:", err);
		res.status(500).send(
			"An internal server error occurred while finding the FROGZ page."
		);
	}
}
async function editExistingPage(req, res, sub = undefined) {
	try {
		const pageURL = sub
			? `${req.params.master}/${req.params.pgpr}`
			: req.params.pgpr;

		const { rows } = await pool.query(
			"SELECT * FROM documents WHERE id = $1",
			[pageURL]
		);
		const foundContent = rows[0];

		if (foundContent) {
			res.render("new", {
				errors: "",
				pageid: pageURL,
				_content: foundContent.content,
				style: foundContent.style,
				Styles: require("../styles.json"), // Load Styles here
				action: "edit",
				indexed: foundContent.indexed,
			});
		} else {
			let _pageid = pageURL;
			if (_pageid.includes("/") && sub) {
				res.render("new", {
					errors: "<strong>Errors:</strong><br>This subpage does not exist! You can create it if you have the master page's password.<br>",
					pageid: pageURL,
					_content: "",
					Styles: require("../styles.json"), // Load Styles here
					action: "submit",
				});
			} else {
				res.redirect("/new");
			}
		}
	} catch (err) {
		console.error("Error in editExistingFROGZPage:", err);
		res.status(500).send("An internal server error occurred.");
	}
}
async function submitPage(req, res) {
	try {
		const pageId = req.body.pageid;

		const { rows: pageRows } = await pool.query(
			"SELECT * FROM documents WHERE id = $1",
			[pageId]
		);

		if (pageRows.length > 0) {
			return pageAlreadyExists(req, res);
		}

		const subdomain = pageId.split("/")[0];
		if (subdomain !== pageId) {
			const { rows: masterRows } = await pool.query(
				"SELECT * FROM documents WHERE id = $1",
				[subdomain]
			);
			if (masterRows.length > 0) {
				return await bcryptCheck(req, res, masterRows[0], "", true);
			}
		}

		await savePage(req, res);
	} catch (err) {
		console.error("Error submitting FROGZ page:", err);
		res.status(500).send(
			"An internal server error occurred while submitting the FROGZ page."
		);
	}
}

async function processEdit(req, res, errormsg = "") {
	try {
		const pageid = req.body.pageid;
		const masterId = pageid.split("/")[0];

		const { rows } = await pool.query(
			"SELECT * FROM documents WHERE id = $1",
			[masterId]
		);
		const foundContent = rows[0];

		if (foundContent) {
			await bcryptCheck(req, res, foundContent, errormsg, false);
		} else {
			pageDoesNotExist(req, res, errormsg);
		}
	} catch (err) {
		console.error("Error processing FROGZ edit:", err);
		res.status(500).send(
			"An internal server error occurred while processing the FROGZ edit."
		);
	}
}

async function bcryptCheck(
	req,
	res,
	foundContent,
	errormsg = "",
	isNewPage = false
) {
	try {
		const match = await bcrypt.compare(
			req.body.password,
			foundContent.hash
		);

		if (!match) {
			errormsg += "Incorrect password!<br>";
			const _indexed = !!req.body.indexable;
			return res.render("new", {
				_content: req.body.content,
				pageid: req.body.pageid,
				password: "",
				errors: errormsg,
				style: req.body.style,
				Styles: require("../styles.json"), // Load Styles here
				action: "edit",
				indexed: _indexed,
			});
		}

		if (isNewPage) {
			await savePage(req, res);
		} else {
			editPage(req, res);
		}
	} catch (err) {
		console.error("Error during bcrypt check (FROGZ):", err);
		res.status(500).send(
			"An internal server error occurred during FROGZ authentication."
		);
	}
}

async function savePage(req, res) {
	try {
		const bhash = await bcrypt.hash(req.body.password, 10);
		const indexable = req.body.indexable ? 1 : 0;
		await createPage(
			req.body.content,
			req.body.pageid,
			new Date().getTime(),
			bhash,
			req.body.style,
			indexable
		);
		res.redirect(`/${req.body.pageid}`);
	} catch (err) {
		console.error("Error saving FROGZ page:", err);
		res.status(500).send(
			"An internal server error occurred while saving the FROGZ page."
		);
	}
}

function pageDoesNotExist(req, res, errormsg) {
	errormsg += "This page does not exist!<br>";
	res.render("new", {
		_content: req.body.content,
		pageid: req.body.pageid,
		password: "",
		errors: errormsg,
		style: req.body.style,
		Styles: require("../styles.json"),
		action: "submit",
		indexed: !!req.body.indexable,
	});
}

function pageAlreadyExists(req, res, errormsg = "") {
	errormsg += "This page already exists!<br>";
	res.render("new", {
		_content: req.body.content,
		pageid: req.body.pageid,
		password: req.body.password,
		errors: errormsg,
		style: req.body.style,
		Styles: require("../styles.json"),
		action: "submit",
		indexed: !!req.body.indexable,
	});
}

function renderPage(req, res, foundContent, _pageid, sub = undefined) {
	if (!foundContent) {
		// Do NOT render 'new' page here. Let the 404 middleware handle it.
		res.status(404).render("404"); // Explicitly render 404 for non-existent FROGZ pages
		return;
	} else {
		const dirtyHTML = snarkdown(foundContent.content);
		const cleanHTML = DOMPurify.sanitize(dirtyHTML);

		let locale = req.headers["accept-language"]
			? req.headers["accept-language"].split(",")[0].split(";")[0]
			: "en-GB";
		const timestamps = get_timestamps(
			foundContent.created_at,
			foundContent.edited_at,
			locale
		);
		let style =
			foundContent.style && foundContent.style !== "no css"
				? `/css/styles/${foundContent.style}.css`
				: "";

		res.render("page", {
			content: cleanHTML,
			times: timestamps,
			styling: style,
			pageid: _pageid,
		});
	}
}

async function randomPage(res) {
	try {
		const { rows } = await pool.query(
			"SELECT id FROM documents WHERE indexed = 1 ORDER BY RANDOM() LIMIT 1;"
		);
		const foundContent = rows[0];

		if (foundContent) {
			res.redirect("/" + foundContent.id);
		} else {
			res.redirect("/");
		}
	} catch (err) {
		console.error("Error fetching random FROGZ page:", err);
		res.redirect("/");
	}
}

module.exports = {
	createTable,
	editExistingPage,
	processEdit,
	findPage,
	submitPage,
	randomPage,
};
