const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("frogz.db");
const pool = require("./postgres.js");
require("dotenv").config();

const bcrypt = require("bcrypt");
const showdown = require("showdown");
const converter = new showdown.Converter();

const Styles = require("./styles.json");

function createTable() {
	let querystring =
		"CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at BIGINT, edited_at BIGINT, hash TEXT, style TEXT, indexed INTEGER);";
	if (process.env.DB_TYPE == "postgres") {
		pool.query(querystring);
	} else {
		querystring =
			"CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at REAL, edited_at REAL, hash TEXT, style TEXT, indexed INTEGER);";
		db.run(querystring);
	}
}
function createPage(content, pageid, date, hash, style) {
	if (process.env.DB_TYPE == "postgres") {
		pool.query(
			"INSERT INTO documents (id, content, created_at, edited_at, hash, style, indexed) VALUES ($1,$2,$3,$3,$4,$5,1)",
			[pageid, content, date, hash, style]
		);
	} else {
		db.run("INSERT INTO documents (id, content, created_at, edited_at, hash, style, indexed) VALUES (?,?,?,?,?,?,1)", [
			pageid,
			content,
			date,
			date,
			hash,
			style,
		]);
	}
}

function editPage(req, res) {
	let date = new Date().getTime();

	if (process.env.DB_TYPE == "postgres") {
		pool.query("UPDATE documents SET content=$1, edited_at=$2, style=$4 WHERE id=$3", [
			req.body.content,
			date,
			req.body.pageid,
			req.body.style,
		]);
	} else {
		db.run("UPDATE documents SET content=?, edited_at=?, style=? WHERE id=?", [
			req.body.content,
			date,
			req.body.pageid,
			req.body.style,
		]);
	}
	res.redirect(`/${req.body.pageid}`);
}

function findPage(req, res, sub = undefined) {
	let foundContent = undefined;
	let pageURL = req.params.pgpr;
	if (sub) {
		pageURL = sub + "/" + req.params.pgpr;
	}
	if (process.env.DB_TYPE == "postgres") {
		pool.query("SELECT * FROM documents WHERE id = $1", [pageURL], (_err, data) => {
			foundContent = data.rows[0];
			renderPage(res, foundContent, pageURL, sub);
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", pageURL, function (_err, data) {
			foundContent = data;
			renderPage(res, foundContent, pageURL, sub);
		});
	}
}
function editExistingPage(req, res, sub = undefined) {
	let foundContent = undefined;
	let pageURL = req.params.pgpr;
	if (sub) {
		pageURL = req.params.master + "/" + req.params.pgpr;
	}
	if (process.env.DB_TYPE == "postgres") {
		pool.query("SELECT * FROM documents WHERE id = $1", [pageURL], (_err, data) => {
			foundContent = data.rows[0];
			if (foundContent) {
				let _Styles = purgeStyles(foundContent.style);
				res.render("new.html", {
					errors: "",
					pageid: pageURL,
					_content: foundContent.content,
					style: foundContent.style,
					Styles: _Styles,
					action: "/edit",
				});
			} else {
				if (_pageid.includes("/") && sub) {
					res.render("new.html", {
						errors:
							"<strong>Errors:</strong><br>This subpage does not exist! You can create it if you have the master page's password.<br>",
						pageid: pageURL,
						_content: "",
						Styles: _Styles,
						action: "/submit",
					});
				}
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", pageURL, function (_err, data) {
			foundContent = data;
			if (foundContent) {
				let _Styles = purgeStyles(foundContent.style);
				res.render("new.html", {
					errors: "",
					pageid: pageURL,
					_content: foundContent.content,
					style: foundContent.style,
					Styles: _Styles,
					action: "/edit",
				});
			} else {
				if (_pageid.includes("/") && sub) {
					res.render("new.html", {
						errors:
							"<strong>Errors:</strong><br>This subpage does not exist! You can create it if you have the master page's password.<br>",
						pageid: pageURL,
						_content: "",
						Styles: _Styles,
						action: "/submit",
					});
				}
			}
		});
	}
}
function submitPage(req, res) {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		pool.query("SELECT * FROM documents WHERE id = $1", [req.body.pageid], (_err, data) => {
			foundContent = data.rows[0];
			if (foundContent) {
				pageAlreadyExists(req, res);
			} else {
				savePage(req, res);
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", req.body.pageid, function (_err, data) {
			foundContent = data;
			if (foundContent) {
				pageAlreadyExists(req, res);
			} else {
				let foundContent2 = undefined;
				let subdomain = req.body.pageid.split("/")[0];
				db.get("SELECT * FROM documents WHERE id = ?", [subdomain], (_err2, data2) => {
					foundContent2 = data2;
					if (foundContent2) {
						bcryptCheckEdit(req, res, foundContent2, "", true);
					} else {
						savePage(req, res);
					}
				});
			}
		});
	}
}

function processEdit(req, res, errormsg = "") {
	let foundContent = undefined;
	let subdomain = req.body.pageid.split("/")[0];
	if (process.env.DB_TYPE == "postgres") {
		pool.query("SELECT * FROM documents WHERE id = $1", [subdomain], (_err, data) => {
			foundContent = data.rows[0];
			if (foundContent) {
				bcryptCheckEdit(req, res, foundContent, errormsg);
			} else {
				pageDoesNotExist(req, res, errormsg);
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", subdomain, function (_err, data) {
			foundContent = data;
			if (foundContent) {
				bcryptCheckEdit(req, res, foundContent, errormsg);
			} else {
				pageDoesNotExist(req, res, errormsg);
			}
		});
	}
}

function bcryptCheckEdit(req, res, foundContent, errormsg = "", newpage = false) {
	bcrypt.compare(req.body.password, foundContent.hash, function (_err, bres) {
		if (!bres) {
			errormsg += "Incorrect password!<br>";
			let _Styles = purgeStyles(req.body.style);
			res.render("new.html", {
				_content: req.body.content,
				pageid: req.body.pageid,
				password: "",
				errors: errormsg,
				style: req.body.style,
				Styles: _Styles,
				action: "/edit",
			});
		} else {
			if (newpage) {
				editPage(req, res);
			} else {
				savePage(req, res);
			}
		}
	});
}
function pageDoesNotExist(req, res, errormsg) {
	errormsg += "This page does not exist!<br>";
	let _Styles = purgeStyles(req.body.style);
	res.render("new.html", {
		_content: req.body.content,
		pageid: req.body.pageid,
		password: "",
		errors: errormsg,
		style: req.body.style,
		Styles: _Styles,
		action: "/submit",
	});
}

function pageAlreadyExists(req, res, errormsg = "") {
	errormsg += "This page already exists!<br>";
	let _Styles = purgeStyles(req.body.style);
	res.render("new.html", {
		_content: req.body.content,
		pageid: req.body.pageid,
		password: req.body.password,
		errors: errormsg,
		style: req.body.style,
		Styles: _Styles,
		action: "/submit",
	});
}
function renderPage(res, foundContent, _pageid, sub = undefined) {
	if (!foundContent || foundContent.id == "edit") {
		if (_pageid.includes("/") && sub) {
			res.render("new.html", {
				errors:
					"<strong>Errors:</strong><br>This subpage does not exist! You can create it if you have the master page's password.<br>",
				pageid: _pageid,
				_content: "",
				Styles: Styles,
				action: "/submit",
			});
		} else {
			res.render("new.html", { errors: "", pageid: _pageid, Styles: Styles, action: "/submit" });
		}
	} else {
		let convContent = converter.makeHtml(foundContent.content);
		let timestamps = get_timestamps(foundContent.created_at, foundContent.edited_at);
		let style = "/css/styles/classic.css";
		if (foundContent.style != "" && foundContent.style != undefined) {
			style = "/css/styles/" + foundContent.style + ".css";
		}
		res.render("page.html", { content: convContent, times: timestamps, styling: style });
	}
}
function savePage(req, res) {
	let bhash = "";
	bcrypt.hash(req.body.password, 10, function (err, hash) {
		bhash = hash;
		if (err) {
			console.error(err);
		} else {
			createPage(req.body.content, req.body.pageid, new Date().getTime(), bhash, req.body.style);
		}
		res.redirect(`/${req.body.pageid}`);
	});
}
function get_timestamps(created_at, edited_at) {
	let powered_by = "<a id='powered_by' href='/'>FROGZ</a>";
	let t_string = "";
	let cdate = new Date();
	cdate.setTime(created_at);
	t_string +=
		cdate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
		" " +
		cdate.toLocaleDateString([], {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
		});
	if (created_at != edited_at && edited_at != undefined) {
		let edate = new Date();
		edate.setTime(edited_at);
		t_string +=
			" (✎ " +
			edate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) +
			" " +
			edate.toLocaleDateString([], {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
			}) +
			")";
	}
	return t_string + " | " + powered_by;
}
function randomPage(res) {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		pool.query("SELECT * FROM documents WHERE indexed = 1 ORDER BY RANDOM() LIMIT 1;", [], (_err, data) => {
			foundContent = data.rows[0];
			if (foundContent) {
				res.redirect("/" + foundContent.id);
			} else {
				res.redirect("/index");
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE indexed = 1 ORDER BY RANDOM() LIMIT 1;", [], function (_err, data) {
			foundContent = data;
			if (foundContent) {
				renderPage(res, foundContent, foundContent.id);
			} else {
				res.render("index.html");
			}
		});
	}
}
function purgeStyles(_style) {
	let _Styles = Styles;
	let usedStyle = _Styles.indexOf(_style);
	if (usedStyle > -1) {
		_Styles.splice(usedStyle, 1);
	}
	return _Styles;
}
module.exports = { createTable, editExistingPage, processEdit, findPage, submitPage, randomPage, purgeStyles };
