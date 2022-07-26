const showdown = require("showdown");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");

var converter = new showdown.Converter();
const db = new sqlite3.Database("frogz.db");
const app = express();
const port = process.env.PORT || 3000;

db.run("CREATE TABLE IF NOT EXISTS documents (id TEXT, content TEXT, created_at REAL, hash TEXT);");

function createPage(content, pageid, date, hash) {
	var html = converter.makeHtml(content);
	if (process.env.DB_TYPE == "postgres") {
		var pool = require("./postgres.js");
		pool.query(
			"INSERT INTO documents (id, content, created_at, hash) VALUES (?,?,?,?)",
			[pageid, html, date, hash],
			(err, data) => {
				console.log(err, data);
			}
		);
	} else {
		db.run("INSERT INTO documents (id, content, created_at, hash) VALUES (?,?,?,?)", [pageid, html, date, hash]);
	}
}

app.use(express.static(path.join(__dirname, ".//static")));
app.use(
	express.urlencoded({
		extended: true,
	})
);
app.get("/", function (req, res) {
	res.sendFile("index.html", { root: path.join(__dirname, "./static/") });
});
app.get("/:pgpr", function (req, res) {
	let foundContent = undefined;
	if (process.env.DB_TYPE == "postgres") {
		var pool = require("./postgres.js");
		pool.query("select * FROM documents WHERE id = ?", req.params.pgpr, (err, data) => {
			foundContent = data;
			if (!foundContent || foundContent.id == "edit") {
				res.sendFile("edit.html", { root: path.join(__dirname, "./static/") });
			} else {
				res.send(foundContent.content);
			}
		});
	} else {
		db.get("select * FROM documents WHERE id = ?", req.params.pgpr, function (err, data) {
			foundContent = data;
			if (!foundContent || foundContent.id == "edit") {
				res.sendFile("edit.html", { root: path.join(__dirname, "./static/") });
			} else {
				res.send(foundContent.content);
			}
		});
	}
});
app.post("/submit-page", (req, res) => {
	//TODO: validate
	let bhash = "";
	bcrypt.hash(req.body.password, 10, function (err, hash) {
		bhash = hash;
		if (err) {
			console.error(err);
		} else {
			createPage(req.body.content, req.body.pageid, new Date().getTime(), bhash);
		}
		res.send("Success!");
	});
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
	console.log(`STATUS: App running on port ${port}`);
});
