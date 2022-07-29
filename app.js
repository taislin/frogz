const showdown = require("showdown");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const validator = require("validator");
require("dotenv").config();

var converter = new showdown.Converter();
const db = new sqlite3.Database("frogz.db");
const app = express();

const port = process.env.PORT || 3000;
if (process.env.DB_TYPE == "postgres") {
	var pool = require("./postgres.js");
	pool.query("CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at REAL, hash TEXT);");
} else {
	db.run("CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at REAL, hash TEXT);");
}

function createPage(content, pageid, date, hash) {
	var html = converter.makeHtml(content);
	if (process.env.DB_TYPE == "postgres") {
		var pool = require("./postgres.js");
		pool.query(
			"INSERT INTO documents (id, content, created_at, hash) VALUES ($1,$2,$3,$4)",
			[pageid, html, date, hash],
			(err, data) => {}
		);
	} else {
		db.run("INSERT INTO documents (id, content, created_at, hash) VALUES (?,?,?,?)", [pageid, html, date, hash]);
	}
}

app.set("view engine", "pug");
app.use(express.static(path.join(__dirname, ".//static")));
app.use(
	express.urlencoded({
		extended: true,
	})
);
app.get("/", function (req, res) {
	res.sendFile("index.html", { root: path.join(__dirname, "./static/") });
});
app.get("/new", function (req, res) {
	res.render("edit", { errors: "", pageid: "" });
});
app.get("/:pgpr", function (req, res) {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		var pool = require("./postgres.js");
		pool.query("SELECT * FROM documents WHERE id = $1", [req.params.pgpr], (err, data) => {
			foundContent = data.rows[0];
			if (!foundContent || foundContent.id == "edit") {
				res.render("edit", { errors: "", pageid: req.params.pgpr });
			} else {
				res.render("page", { content: foundContent.content });
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", req.params.pgpr, function (err, data) {
			foundContent = data;
			if (!foundContent || foundContent.id == "edit") {
				res.render("edit", { errors: "", pageid: req.params.pgpr });
			} else {
				res.render("page", { content: foundContent.content });
			}
		});
	}
});
app.post("/submit-page", (req, res) => {
	//validate
	let errormsg = "<strong>Errors:</strong><br>";
	if (!validator.isAlphanumeric(req.body.pageid)) {
		errormsg += "The page name (url) must be alphanumeric.<br>";
	}
	if (!validator.isLength(req.body.pageid, { min: 1, max: 100 })) {
		errormsg += "The page name (url) cannot be empty and needs to be under 100 characters.<br>";
	}
	if (!validator.isLength(req.body.password, { min: 0, max: 50 })) {
		errormsg += "The Password needs to be under 50 characters!<br>";
	}
	if (!validator.isLength(req.body.content, { min: 1, max: 10000 })) {
		errormsg += "The Content cannot be empty and needs to be under 10,000 characters!<br>";
	}

	if (errormsg != "<strong>Errors:</strong><br>") {
		res.render("edit", {
			_content: req.body.content,
			pageid: req.body.pageid,
			password: req.body.password,
			errors: errormsg,
		});
	} else {
		let foundContent = undefined;
		if (process.env.DB_TYPE == "postgres") {
			var pool = require("./postgres.js");
			pool.query("SELECT * FROM documents WHERE id = $1", [req.body.pageid], (err, data) => {
				foundContent = data.rows[0];
				if (foundContent) {
					errormsg += "This page already exists!<br>";
					res.render("edit", {
						_content: req.body.content,
						pageid: req.body.pageid,
						password: req.body.password,
						errors: errormsg,
					});
				} else {
					let bhash = "";
					bcrypt.hash(req.body.password, 10, function (err, hash) {
						bhash = hash;
						if (err) {
							console.error(err);
						} else {
							createPage(req.body.content, req.body.pageid, new Date().getTime(), bhash);
						}
						res.redirect(`/${req.body.pageid}`);
					});
				}
			});
		} else {
			db.get("SELECT * FROM documents WHERE id = ?", req.body.pageid, function (err, data) {
				foundContent = data;
				if (foundContent) {
					errormsg += "This page already exists!<br>";
					res.render("edit", {
						_content: req.body.content,
						pageid: req.body.pageid,
						password: req.body.password,
						errors: errormsg,
					});
				} else {
					let bhash = "";
					bcrypt.hash(req.body.password, 10, function (err, hash) {
						bhash = hash;
						if (err) {
							console.error(err);
						} else {
							createPage(req.body.content, req.body.pageid, new Date().getTime(), bhash);
						}
						res.redirect(`/${req.body.pageid}`);
					});
				}
			});
		}
	}
});

app.listen(port, () => {
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
