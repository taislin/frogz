const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("frogz.db");
const pool = require("./postgres.js");
require("dotenv").config();

const { savePage, renderPage, pageAlreadyExists, pageDoesNotExist, bcryptCheckEdit } = require("./pages.js");
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

function processEdit(req, res) {
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

module.exports = { createTable, editPage, createPage, editExistingPage, processEdit, findPage, submitPage };
