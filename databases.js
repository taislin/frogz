const pool = require("./postgres.js");
require("dotenv").config();

const bcrypt = require("bcryptjs");
const snarkdown = require("snarkdown");

const Styles = require("./styles.json");

function createTable() {
	let querystring =
		"CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at BIGINT, edited_at BIGINT, hash TEXT, style TEXT, indexed INTEGER);";
	pool.query(querystring);
}
function createPage(content, pageid, date, hash, style, indexable) {
	pool.query(
		"INSERT INTO documents (id, content, created_at, edited_at, hash, style, indexed) VALUES ($1,$2,$3,$3,$4,$5,$6)",
		[pageid, content, date, hash, style, indexable]
	);
}

function editPage(req, res) {
	let date = new Date().getTime();
	let _indexed = 0;
	if (req.body.indexable) {
		_indexed = 1;
	}
	pool.query("UPDATE documents SET content=$1, edited_at=$2, style=$4, indexed=$5 WHERE id=$3", [
		req.body.content,
		date,
		req.body.pageid,
		req.body.style,
		_indexed,
	]);

	res.redirect(`/${req.body.pageid}`);
}

function findPage(req, res, sub = undefined) {
	let foundContent = undefined;
	let pageURL = req.params.pgpr;
	if (sub) {
		pageURL = sub + "/" + req.params.pgpr;
	}

	pool.query("SELECT * FROM documents WHERE id = $1", [pageURL], (_err, data) => {
		foundContent = data.rows[0];
		renderPage(req, res, foundContent, pageURL, sub);
	});
}
function editExistingPage(req, res, sub = undefined) {
	let foundContent = undefined;
	let pageURL = req.params.pgpr;
	if (sub) {
		pageURL = req.params.master + "/" + req.params.pgpr;
	}

	pool.query("SELECT * FROM documents WHERE id = $1", [pageURL], (_err, data) => {
		foundContent = data.rows[0];
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
			if (_pageid.includes("/") && sub) {
				res.render("new", {
					errors:
						"<strong>Errors:</strong><br>This subpage does not exist! You can create it if you have the master page's password.<br>",
					pageid: pageURL,
					_content: "",
					Styles: Styles,
					action: "submit",
				});
			}
		}
	});
}
function submitPage(req, res) {
	let foundContent = undefined;
	pool.query("SELECT * FROM documents WHERE id = $1", [req.body.pageid], (_err, data) => {
		foundContent = data.rows[0];
		if (foundContent) {
			pageAlreadyExists(req, res);
		} else {
			let foundContent2 = undefined;
			let subdomain = req.body.pageid.split("/")[0];
			pool.query("SELECT * FROM documents WHERE id = $1", [subdomain], (_err2, data2) => {
				foundContent2 = data2.rows[0];
				if (foundContent2) {
					bcryptCheckEdit(req, res, foundContent2, "", true);
				} else {
					savePage(req, res);
				}
			});
		}
	});
}

function processEdit(req, res, errormsg = "") {
	let foundContent = undefined;
	let subdomain = req.body.pageid.split("/")[0];
	pool.query("SELECT * FROM documents WHERE id = $1", [subdomain], (_err, data) => {
		foundContent = data.rows[0];
		if (foundContent) {
			bcryptCheckEdit(req, res, foundContent, errormsg);
		} else {
			pageDoesNotExist(req, res, errormsg);
		}
	});
}

function bcryptCheckEdit(req, res, foundContent, errormsg = "", newpage = false) {
	bcrypt.compare(req.body.password, foundContent.hash, function (_err, bres) {
		if (!bres) {
			errormsg += "Incorrect password!<br>";
			let _indexed = false;
			if (req.body.indexable) {
				_indexed = true;
			}
			res.render("new", {
				_content: req.body.content,
				pageid: req.body.pageid,
				password: "",
				errors: errormsg,
				style: req.body.style,
				Styles: Styles,
				action: "edit",
				indexed: _indexed,
			});
		} else {
			if (newpage) {
				savePage(req, res);
			} else {
				editPage(req, res);
			}
		}
	});
}
function pageDoesNotExist(req, res, errormsg) {
	errormsg += "This page does not exist!<br>";
	let _indexed = false;
	if (req.body.indexable) {
		_indexed = true;
	}
	res.render("new", {
		_content: req.body.content,
		pageid: req.body.pageid,
		password: "",
		errors: errormsg,
		style: req.body.style,
		Styles: Styles,
		action: "submit",
		indexed: _indexed,
	});
}

function pageAlreadyExists(req, res, errormsg = "") {
	errormsg += "This page already exists!<br>";
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
		action: "submit",
		indexed: _indexed,
	});
}
function renderPage(req, res, foundContent, _pageid, sub = undefined) {
	if (!foundContent || foundContent.id == "edit") {
		if (_pageid.includes("/") && sub) {
			res.render("new", {
				errors:
					"<strong>Errors:</strong><br>This subpage does not exist! You can create it if you have the master page's password.<br>",
				pageid: _pageid,
				_content: "",
				Styles: Styles,
				action: "submit",
			});
		} else {
			res.render("new", { errors: "", pageid: _pageid, Styles: Styles, action: "submit" });
		}
	} else {
		let convContent = snarkdown(foundContent.content);
		convContent = convContent.replace(/(?:\r\n|\r|\n)/g, "<br>");
		let locale = "en-GB";
		if (req.headers["accept-language"]) {
			locale = req.headers["accept-language"];
			locale = locale.split(",")[0];
			locale = locale.split(";")[0];
		}
		let timestamps = get_timestamps(foundContent.created_at, foundContent.edited_at, locale);
		let style = "/css/styles/classic.css";
		if (foundContent.style != "" && foundContent.style != undefined) {
			style = "/css/styles/" + foundContent.style + ".css";
		}
		res.render("page", { content: convContent, times: timestamps, styling: style });
	}
}
function savePage(req, res) {
	let bhash = "";
	bcrypt.hash(req.body.password, 10, function (err, hash) {
		bhash = hash;
		if (err) {
			console.error(err);
		} else {
			let indexable = 0;
			if (req.body.indexable) {
				indexable = 1;
			}
			createPage(req.body.content, req.body.pageid, new Date().getTime(), bhash, req.body.style, indexable);
		}
		res.redirect(`/${req.body.pageid}`);
	});
}
function get_timestamps(created_at, edited_at, locale = "en-GB") {
	let powered_by = "";
	let t_string = "";
	let cdate = new Date();
	cdate.setTime(created_at);
	if (!locale || typeof locale !== "string") {
		locale = "en-GB";
	}
	t_string +=
		cdate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) +
		" " +
		cdate.toLocaleDateString(locale, {
			year: "2-digit",
			month: "2-digit",
			day: "2-digit",
		});
	if (created_at != edited_at && edited_at != undefined) {
		let edate = new Date();
		edate.setTime(edited_at);
		t_string +=
			" (✎ " +
			edate.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) +
			" " +
			edate.toLocaleDateString(locale, {
				year: "2-digit",
				month: "2-digit",
				day: "2-digit",
			}) +
			")";
	}
	return t_string + " | " + powered_by;
}
function randomPage(res) {
	let foundContent = undefined;

	pool.query("SELECT * FROM documents WHERE indexed = 1 ORDER BY RANDOM() LIMIT 1;", [], (_err, data) => {
		foundContent = data.rows[0];
		if (foundContent) {
			res.redirect("/" + foundContent.id);
		} else {
			res.redirect("/index");
		}
	});
}

module.exports = { createTable, editExistingPage, processEdit, findPage, submitPage, randomPage };
