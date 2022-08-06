const bcrypt = require("bcrypt");
const showdown = require("showdown");
const converter = new showdown.Converter();

const { editPage, createPage } = require("./databases.js");
const Styles = require("./styles.json");

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

module.exports = { get_timestamps, savePage, renderPage, pageAlreadyExists, pageDoesNotExist, bcryptCheckEdit };
