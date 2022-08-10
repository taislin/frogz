const Pool = require("pg").Pool;
require("dotenv").config();
let ssl_mode = true;
if (process.env.NODE_ENV == "development") {
	ssl_mode = false;
}
const connectionString = `postgresql://${process.env.PG_USER}:${process.env.PG_PASSWORD}@${process.env.PG_HOST}:${process.env.PG_PORT}/${process.env.PG_DATABASE}`;
const pool = new Pool({
	connectionString: connectionString,
	ssl: ssl_mode,
});
module.exports = pool;
