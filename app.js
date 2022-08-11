const express = require("express");
const path = require("path");
const validator = require("validator");
require("dotenv").config();

const { createTable, editExistingPage, processEdit, findPage, submitPage, randomPage } = require("./databases.js");

const app = express();
const port = process.env.PORT || 3000;

const Styles = require("./styles.json");

createTable();

app.set("view engine", "pug");
app.use(express.static(path.join(__dirname, ".//static")));
app.use(
	express.urlencoded({
		extended: true,
	})
);
app.get("/", function (_req, res) {
	res.render("index");
});
app.get("/new", function (_req, res) {
	res.render("new", { errors: "", pageid: "", style: "classic", Styles: Styles });
});
app.get("/edit", function (_req, res) {
	res.redirect("/edit");
});
app.get("/terms", function (_req, res) {
	res.render("terms");
});
app.get("/markdown", function (_req, res) {
	res.render("markdown.html");
});
app.get("/about", function (_req, res) {
	res.render("about");
});
//
//app.get("/random", function (_req, res) {
//	randomPage(res);
//});
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
			style: req.body.style,
			Styles: Styles,
		});
	} else {
		submitPage(req, res);
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
			style: req.body.style,
			Styles: Styles,
		});
	} else {
		processEdit(req, res, errormsg);
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
