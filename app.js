const express = require("express");
const path = require("path");
const whiskers = require("whiskers");
require("dotenv").config();

const {
	createTable,
	editExistingPage,
	processEdit,
	findPage,
	submitPage,
	randomPage,
	purgeStyles,
} = require("./databases.js");

const app = express();
const port = process.env.PORT || 3000;

const Styles = require("./styles.json");

createTable();

app.engine(".html", whiskers.__express);
app.set("views", __dirname + "/views");
app.set("view engine", "whiskers");
app.use(express.static(path.join(__dirname, ".//static")));
app.use(
	express.urlencoded({
		extended: true,
	})
);
app.get("/", function (_req, res) {
	res.render("index.html");
});
app.get("/new", function (_req, res) {
	res.render("new.html", { errors: "", pageid: "", Styles: Styles, action: "submit" });
});
app.get("/edit", function (_req, res) {
	res.render("new.html", { errors: "", pageid: "", Styles: Styles, action: "edit" });
});
app.get("/terms", function (_req, res) {
	res.render("terms.html");
});
app.get("/markdown", function (_req, res) {
	res.render("markdown.html");
});
app.get("/about", function (_req, res) {
	res.render("about.html");
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
	if (!validateAlphanumeric(req.body.pageid)) {
		let _pid = req.body.pageid.replace("/", "");
		if (!validateAlphanumeric(_pid)) {
			errormsg += "The page name (url) must be alphanumeric.<br>";
		}
	}
	if (!validateLength(req.body.pageid, 1, 100)) {
		errormsg += "The page name (url) cannot be empty and needs to be under 100 characters.<br>";
	}
	if (!validateLength(req.body.password, 0, 50)) {
		errormsg += "The Password needs to be under 50 characters!<br>";
	}
	if (!validateLength(req.body.content, 1, 10000)) {
		errormsg += "The Content cannot be empty and needs to be under 10,000 characters!<br>";
	}

	if (errormsg != "<strong>Errors:</strong><br>") {
		let _Styles = purgeStyles(req.body.style);
		res.render("new.html", {
			_content: req.body.content,
			pageid: req.body.pageid,
			password: req.body.password,
			errors: errormsg,
			style: req.body.style,
			Styles: _Styles,
			action: "submit",
		});
	} else {
		submitPage(req, res);
	}
});

app.post("/edit", (req, res) => {
	//validate
	let errormsg = "<strong>Errors:</strong><br>";
	if (!validateLength(req.body.password, 0, 50)) {
		errormsg += "The Password needs to be under 50 characters!<br>";
	}
	if (!validateLength(req.body.content, 1, 10000)) {
		errormsg += "The Content cannot be empty and needs to be under 10,000 characters!<br>";
	}

	if (errormsg != "<strong>Errors:</strong><br>") {
		let _Styles = purgeStyles(req.body.style);
		res.render("new.html", {
			_content: req.body.content,
			pageid: req.body.pageid,
			password: req.body.password,
			errors: errormsg,
			style: req.body.style,
			Styles: _Styles,
			action: "edit",
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

function validateAlphanumeric(str) {
	let regexp = /^[a-z0-9-_]+$/i;
	if (str.search(regexp) === -1) {
		return false;
	}
	return true;
}
function validateLength(str, min = 0, max = 100) {
	let strl = str.length;
	if (strl < min || strl > max) {
		return false;
	}
	return true;
}
