const showdown = require("showdown");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const validator = require("validator");
require("dotenv").config();

const converter = new showdown.Converter();
const db = new sqlite3.Database("frogz.db");
const app = express();

const port = process.env.PORT || 3000;

const querystring =
	"CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at INTEGER, edited_at INTEGER, hash TEXT);";
if (process.env.DB_TYPE == "postgres") {
	let pool = require("./postgres.js");
	pool.query(querystring);
} else {
	db.run(querystring);
}
//functions
function createPage(content, pageid, date, hash) {
	if (process.env.DB_TYPE == "postgres") {
		let pool = require("./postgres.js");
		pool.query("INSERT INTO documents (id, content, created_at, edited_at, hash) VALUES ($1,$2,$3,$3,$4)", [
			pageid,
			content,
			date,
			hash,
		]);
	} else {
		db.run("INSERT INTO documents (id, content, created_at, edited_at, hash) VALUES (?,?,?,?,?)", [
			pageid,
			content,
			date,
			date,
			hash,
		]);
	}
}
function savePage(req, res) {
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
function editPage(req, res) {
	let date = new Date().getTime();

	if (process.env.DB_TYPE == "postgres") {
		let pool = require("./postgres.js");
		pool.query("UPDATE documents SET content=$1, edited_at=$2 WHERE id=$3", [req.body.content, date, req.body.pageid]);
	} else {
		db.run("UPDATE documents SET content=?, edited_at=? WHERE id=?", [req.body.content, date, req.body.pageid]);
	}
	res.redirect(`/${req.body.pageid}`);
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
///

app.set("view engine", "pug");
app.use(express.static(path.join(__dirname, ".//static")));
app.use(
	express.urlencoded({
		extended: true,
	})
);
app.get("/", function (_req, res) {
	res.sendFile("index.html", { root: path.join(__dirname, "./static/") });
});
app.get("/new", function (_req, res) {
	res.render("new", { errors: "", pageid: "" });
});
app.get("/edit", function (_req, res) {
	res.render("new", { errors: "", pageid: "" });
});
app.get("/:pgpr", function (req, res) {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		let pool = require("./postgres.js");
		pool.query("SELECT * FROM documents WHERE id = $1", [req.params.pgpr], (_err, data) => {
			foundContent = data.rows[0];
			let convContent = converter.makeHtml(foundContent.content);
			if (!foundContent || foundContent.id == "edit") {
				res.render("new", { errors: "", pageid: req.params.pgpr });
			} else {
				let timestamps = get_timestamps(foundContent.created_at, foundContent.edited_at);
				res.render("page", { content: convContent, times: timestamps });
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", req.params.pgpr, function (_err, data) {
			foundContent = data;
			let convContent = converter.makeHtml(foundContent.content);
			if (!foundContent || foundContent.id == "edit") {
				res.render("new", { errors: "", pageid: req.params.pgpr });
			} else {
				let timestamps = get_timestamps(foundContent.created_at, foundContent.edited_at);
				res.render("page", { content: convContent, times: timestamps });
			}
		});
	}
});
app.get("/:pgpr/edit", function (req, res) {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		let pool = require("./postgres.js");
		pool.query("SELECT * FROM documents WHERE id = $1", [req.params.pgpr], (_err, data) => {
			foundContent = data.rows[0];
			if (foundContent) {
				res.render("edit", { errors: "", pageid: req.params.pgpr, _content: foundContent.content });
			}
		});
	} else {
		db.get("SELECT * FROM documents WHERE id = ?", req.params.pgpr, function (_err, data) {
			foundContent = data;
			if (foundContent) {
				res.render("edit", { errors: "", pageid: req.params.pgpr, _content: foundContent.content });
			}
		});
	}
});

app.post("/submit", (req, res) => {
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
		res.render("new", {
			_content: req.body.content,
			pageid: req.body.pageid,
			password: req.body.password,
			errors: errormsg,
		});
	} else {
		let foundContent = undefined;
		if (process.env.DB_TYPE == "postgres") {
			let pool = require("./postgres.js");
			pool.query("SELECT * FROM documents WHERE id = $1", [req.body.pageid], (_err, data) => {
				foundContent = data.rows[0];
				if (foundContent) {
					errormsg += "This page already exists!<br>";
					res.render("new", {
						_content: req.body.content,
						pageid: req.body.pageid,
						password: req.body.password,
						errors: errormsg,
					});
				} else {
					savePage(req, res);
				}
			});
		} else {
			db.get("SELECT * FROM documents WHERE id = ?", req.body.pageid, function (_err, data) {
				foundContent = data;
				if (foundContent) {
					errormsg += "This page already exists!<br>";
					res.render("new", {
						_content: req.body.content,
						pageid: req.body.pageid,
						password: req.body.password,
						errors: errormsg,
					});
				} else {
					savePage(req, res);
				}
			});
		}
	}
});

app.post("/edit", (req, res) => {
	//validate
	let errormsg = "<strong>Errors:</strong><br>";
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
			let pool = require("./postgres.js");
			pool.query("SELECT * FROM documents WHERE id = $1", [req.body.pageid], (_err, data) => {
				foundContent = data.rows[0];
				if (foundContent) {
					bcrypt.compare(req.body.password, foundContent.hash, function (_err, bres) {
						if (!bres) {
							errormsg += "Incorrect password!<br>";
							res.render("edit", {
								_content: req.body.content,
								pageid: req.body.pageid,
								password: "",
								errors: errormsg,
							});
						} else {
							editPage(req, res);
						}
					});
				} else {
					errormsg += "This page does not exist!<br>";
					res.render("edit", {
						_content: req.body.content,
						pageid: req.body.pageid,
						password: "",
						errors: errormsg,
					});
				}
			});
		} else {
			db.get("SELECT * FROM documents WHERE id = ?", req.body.pageid, function (_err, data) {
				foundContent = data;
				if (foundContent) {
					bcrypt.compare(req.body.password, foundContent.hash, function (_err, bres) {
						if (!bres) {
							errormsg += "Incorrect password!<br>";
							res.render("edit", {
								_content: req.body.content,
								pageid: req.body.pageid,
								password: "",
								errors: errormsg,
							});
						} else {
							editPage(req, res);
						}
					});
				} else {
					errormsg += "This page does not exist!<br>";
					res.render("edit", {
						_content: req.body.content,
						pageid: req.body.pageid,
						password: "",
						errors: errormsg,
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
