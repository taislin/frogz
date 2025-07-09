// ADDED: JSDOM and DOMPurify to sanitize HTML and prevent XSS attacks. This is a critical security fix.
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

const pool = require("./postgres.js");
require("dotenv").config();

const bcrypt = require("bcryptjs");
const snarkdown = require("snarkdown");

const Styles = require("./styles.json");

// CHANGED: Converted to an async function for modern error handling.
async function createTable() {
	try {
		const querystring =
			"CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at BIGINT, edited_at BIGINT, hash TEXT, style TEXT, indexed INTEGER);";
		await pool.query(querystring);
	} catch (err) {
		console.error("Error creating table:", err);
	}
}

// CHANGED: Converted to async. No functional change, just modern syntax.
async function createPage(content, pageid, date, hash, style, indexable) {
	await pool.query(
		"INSERT INTO documents (id, content, created_at, edited_at, hash, style, indexed) VALUES ($1,$2,$3,$3,$4,$5,$6)",
		[pageid, content, date, hash, style, indexable]
	);
}

// CHANGED: Converted to async for consistency and error handling.
async function editPage(req, res) {
	try {
		const date = new Date().getTime();
		const _indexed = req.body.indexable ? 1 : 0;
		await pool.query("UPDATE documents SET content=$1, edited_at=$2, style=$4, indexed=$5 WHERE id=$3", [
			req.body.content,
			date,
			req.body.pageid,
			req.body.style,
			_indexed,
		]);
		res.redirect(`/${req.body.pageid}`);
	} catch (err) {
		console.error("Error editing page:", err);
		res.status(500).send("An internal server error occurred while editing the page.");
	}
}

// CHANGED: Converted to async to avoid callback nesting.
async function findPage(req, res, sub = undefined) {
	try {
		let pageURL = sub ? `${sub}/${req.params.pgpr}` : req.params.pgpr;

		const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [pageURL]);
		const foundContent = rows[0];

		renderPage(req, res, foundContent, pageURL, sub);
	} catch (err) {
		console.error("Error finding page:", err);
		res.status(500).send("An internal server error occurred while finding the page.");
	}
}

// CHANGED: Converted to async.
async function editExistingPage(req, res, sub = undefined) {
	try {
		const pageURL = sub ? `${req.params.master}/${req.params.pgpr}` : req.params.pgpr;

		const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [pageURL]);
		const foundContent = rows[0];

		if (foundContent) {
			res.render("new", {
				errors: "",
				pageid: pageURL,
				_content: foundContent.content,
				style: foundContent.style,
				Styles: Styles,
				action: "edit",
				indexed: foundContent.indexed,
			});
		} else {
			// This logic is complex and can probably be simplified, but for now it is preserved.
			let _pageid = pageURL;
			if (_pageid.includes("/") && sub) {
				res.render("new", {
					errors: "<strong>Errors:</strong><br>This subpage does not exist! You can create it if you have the master page's password.<br>",
					pageid: pageURL,
					_content: "",
					Styles: Styles,
					action: "submit",
				});
			} else {
				// Redirect to a clean 'new' page if a top-level page doesn't exist.
				res.redirect('/new');
			}
		}
	} catch (err) {
		console.error("Error in editExistingPage:", err);
		res.status(500).send("An internal server error occurred.");
	}
}

// CHANGED: Major refactor to async/await, removing nested callbacks.
async function submitPage(req, res) {
	try {
		const { pageid } = req.body;

		const { rows: existingPage } = await pool.query("SELECT * FROM documents WHERE id = $1", [pageid]);

		if (existingPage.length > 0) {
			return pageAlreadyExists(req, res);
		}

		const masterId = pageid.split("/")[0];
		// If this is a subpage creation attempt
		if (masterId !== pageid) {
			const { rows: masterPage } = await pool.query("SELECT * FROM documents WHERE id = $1", [masterId]);
			if (masterPage.length > 0) {
				// Master page exists, so we check its password to authorize subpage creation
				return await bcryptCheck(req, res, masterPage[0], "", true); // isNewPage = true
			}
		}

		// If it's a new top-level page or a subpage with no existing master, save it directly.
		await savePage(req, res);

	} catch (err) {
		console.error("Error submitting page:", err);
		res.status(500).send("An internal server error occurred while submitting the page.");
	}
}

// CHANGED: Refactored to async/await.
async function processEdit(req, res, errormsg = "") {
	try {
		const pageid = req.body.pageid;
		const masterId = pageid.split("/")[0]; // An edit always refers to a master page.

		const { rows } = await pool.query("SELECT * FROM documents WHERE id = $1", [masterId]);
		const foundContent = rows[0];

		if (foundContent) {
			await bcryptCheck(req, res, foundContent, errormsg, false); // isNewPage = false
		} else {
			pageDoesNotExist(req, res, errormsg);
		}
	} catch (err) {
		console.error("Error processing edit:", err);
		res.status(500).send("An internal server error occurred while processing the edit.");
	}
}

// CHANGED: Renamed from bcryptCheckEdit to be more generic. Converted to use async/await with bcrypt.
async function bcryptCheck(req, res, foundContent, errormsg = "", isNewPage = false) {
	try {
		const match = await bcrypt.compare(req.body.password, foundContent.hash);

		if (!match) {
			errormsg += "Incorrect password!<br>";
			const _indexed = !!req.body.indexable; // simpler boolean conversion
			return res.render("new", {
				_content: req.body.content,
				pageid: req.body.pageid,
				password: "",
				errors: errormsg,
				style: req.body.style,
				Styles: Styles,
				action: "edit",
				indexed: _indexed,
			});
		}

		if (isNewPage) {
			await savePage(req, res);
		} else {
			await editPage(req, res);
		}
	} catch (err) {
		console.error("Error during bcrypt check:", err);
		res.status(500).send("An internal server error occurred during authentication.");
	}
}

// ADDED: Logic for saving a new page refactored into its own async function.
async function savePage(req, res) {
	try {
		// bcrypt.hash is async, so we await it
		const bhash = await bcrypt.hash(req.body.password, 10);
		const indexable = req.body.indexable ? 1 : 0;
		await createPage(req.body.content, req.body.pageid, new Date().getTime(), bhash, req.body.style, indexable);
		res.redirect(`/${req.body.pageid}`);
	} catch (err) {
		console.error("Error saving page:", err);
		res.status(500).send("An internal server error occurred while saving the page.");
	}
}


function pageDoesNotExist(req, res, errormsg) {
	errormsg += "This page does not exist!<br>";
	res.render("new", {
		_content: req.body.content, pageid: req.body.pageid, password: "", errors: errormsg, style: req.body.style, Styles: Styles, action: "submit", indexed: !!req.body.indexable,
	});
}

function pageAlreadyExists(req, res, errormsg = "") {
	errormsg += "This page already exists!<br>";
	res.render("new", {
		_content: req.body.content, pageid: req.body.pageid, password: req.body.password, errors: errormsg, style: req.body.style, Styles: Styles, action: "submit", indexed: !!req.body.indexable,
	});
}

function renderPage(req, res, foundContent, _pageid, sub = undefined) {
	if (!foundContent) {
		if (_pageid.includes("/") && sub) {
			res.render("new", { errors: "<strong>Errors:</strong><br>This subpage does not exist! You can create it if you have the master page's password.<br>", pageid: _pageid, _content: "", Styles: Styles, action: "submit", });
		} else {
			res.render("new", { errors: "", pageid: _pageid, Styles: Styles, action: "submit" });
		}
	} else {
		// CHANGED: Added sanitization step to prevent XSS attacks.
		const dirtyHTML = snarkdown(foundContent.content);
		const cleanHTML = DOMPurify.sanitize(dirtyHTML);
        
        // NOTE: The line below that replaces newlines with <br> is not ideal.
        // A better approach is to remove this line and use `white-space: pre-wrap;`
        // in your CSS for the content container. But for now, we sanitize first.
		// const finalContent = cleanHTML.replace(/(?:\r\n|\r|\n)/g, "<br>");
        
		let locale = req.headers["accept-language"] ? req.headers["accept-language"].split(",")[0].split(";")[0] : "en-GB";
		const timestamps = get_timestamps(foundContent.created_at, foundContent.edited_at, locale);
		let style = foundContent.style && foundContent.style !== "no css" ? `/css/styles/${foundContent.style}.css` : "";
		
		res.render("page", { content: cleanHTML, times: timestamps, styling: style });
	}
}

function get_timestamps(created_at, edited_at, locale = "en-GB") {
    // This synchronous function is fine as is.
	let t_string = "";
	const cdate = new Date(created_at);
    const dateOptions = { year: "2-digit", month: "2-digit", day: "2-digit" };
    const timeOptions = { hour: "2-digit", minute: "2-digit" };

	t_string += cdate.toLocaleTimeString(locale, timeOptions) + " " + cdate.toLocaleDateString(locale, dateOptions);
	
	if (created_at !== edited_at && edited_at) {
		const edate = new Date(edited_at);
		t_string += ` (✎ ${edate.toLocaleTimeString(locale, timeOptions)} ${edate.toLocaleDateString(locale, dateOptions)})`;
	}
	return t_string;
}

// CHANGED: Converted to async.
async function randomPage(res) {
	try {
		const { rows } = await pool.query("SELECT id FROM documents WHERE indexed = 1 ORDER BY RANDOM() LIMIT 1;");
		const foundContent = rows[0];

		if (foundContent) {
			res.redirect("/" + foundContent.id);
		} else {
            // Redirect to a known page if no indexable pages are found.
			res.redirect("/"); 
		}
	} catch (err) {
		console.error("Error fetching random page:", err);
		res.redirect("/"); // Fail gracefully
	}
}

module.exports = { createTable, editExistingPage, processEdit, findPage, submitPage, randomPage };