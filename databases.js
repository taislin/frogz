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
		"CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at INTEGER, edited_at INTEGER, hash TEXT, style TEXT);";
	if (process.env.DB_TYPE == "postgres") {
		pool.query(querystring);
	} else {
		db.run(querystring);
	}
}
function createPage(content, pageid, date, hash, style) {
	if (process.env.DB_TYPE == "postgres") {
		pool.query("INSERT INTO documents (id, content, created_at, edited_at, hash, style) VALUES ($1,$2,$3,$3,$4,$5)", [
			pageid,
			content,
			date,
			hash,
			style,
		]);
	} else {
		db.run("INSERT INTO documents (id, content, created_at, edited_at, hash, style) VALUES (?,?,?,?,?,?)", [
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

function findPage(req, res) {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		pool.query("SELECT * FROM documents WHERE id = $1", [req.params.pgpr], (_err, data) => {
			foundContent = data.rows[0];
			renderPage(req, res, foundContent);
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", req.params.pgpr, function (_err, data) {
			foundContent = data;
			renderPage(req, res, foundContent);
		});
	}
}
function editExistingPage(req, res) {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		pool.query("SELECT * FROM documents WHERE id = $1", [req.params.pgpr], (_err, data) => {
			foundContent = data.rows[0];
			if (foundContent) {
				res.render("edit", {
					errors: "",
					pageid: req.params.pgpr,
					_content: foundContent.content,
					style: foundContent.style,
					Styles: Styles,
				});
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", req.params.pgpr, function (_err, data) {
			foundContent = data;
			if (foundContent) {
				res.render("edit", {
					errors: "",
					pageid: req.params.pgpr,
					_content: foundContent.content,
					style: foundContent.style,
					Styles: Styles,
				});
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
				pageAlreadyExists(req, res, errormsg);
			} else {
				savePage(req, res);
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", req.body.pageid, function (_err, data) {
			foundContent = data;
			if (foundContent) {
				pageAlreadyExists(req, res, errormsg);
			} else {
				savePage(req, res);
			}
		});
	}
}

function processEdit(req, res, errormsg = "") {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		pool.query("SELECT * FROM documents WHERE id = $1", [req.body.pageid], (_err, data) => {
			foundContent = data.rows[0];
			if (foundContent) {
				bcryptCheckEdit(req, res, foundContent, errormsg);
			} else {
				pageDoesNotExist(req, res, errormsg);
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", req.body.pageid, function (_err, data) {
			foundContent = data;
			if (foundContent) {
				bcryptCheckEdit(req, res, foundContent, errormsg);
			} else {
				pageDoesNotExist(req, res, errormsg);
			}
		});
	}
}

function bcryptCheckEdit(req, res, foundContent, errormsg) {
	bcrypt.compare(req.body.password, foundContent.hash, function (_err, bres) {
		if (!bres) {
			errormsg += "Incorrect password!<br>";
			res.render("edit", {
				_content: req.body.content,
				pageid: req.body.pageid,
				password: "",
				errors: errormsg,
				style: req.body.style,
				Styles: Styles,
			});
		} else {
			editPage(req, res);
		}
	});
}
function pageDoesNotExist(req, res, errormsg) {
	errormsg += "This page does not exist!<br>";
	res.render("edit", {
		_content: req.body.content,
		pageid: req.body.pageid,
		password: "",
		errors: errormsg,
		style: req.body.style,
		Styles: Styles,
	});
}

function pageAlreadyExists(req, res, errormsg) {
	errormsg += "This page already exists!<br>";
	res.render("new", {
		_content: req.body.content,
		pageid: req.body.pageid,
		password: req.body.password,
		errors: errormsg,
		style: req.body.style,
		Styles: Styles,
	});
}
function renderPage(req, res, foundContent) {
	if (!foundContent || foundContent.id == "edit") {
		res.render("new", { errors: "", pageid: req.params.pgpr, Styles: Styles });
	} else {
		let convContent = converter.makeHtml(foundContent.content);
		let timestamps = get_timestamps(foundContent.created_at, foundContent.edited_at);
		let style = "css/styles/classic.css";
		if (foundContent.style != "" && foundContent.style != undefined) {
			style = "css/styles/" + foundContent.style + ".css";
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
			console.log(req.body);
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
	return t_string + " " + powered_by;
}
module.exports = { createTable, editExistingPage, processEdit, findPage, submitPage };
