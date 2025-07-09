// utils.js

function get_timestamps(created_at, edited_at, locale = "en-GB") {
    let t_string = "";
    const cdate = new Date(created_at);
    const dateOptions = { year: "2-digit", month: "2-digit", day: "2-digit" };
    const timeOptions = { hour: "2-digit", minute: "2-digit" };

    t_string += cdate.toLocaleTimeString(locale, timeOptions) + " " + cdate.toLocaleDateString(locale, dateOptions);

    if (created_at !== edited_at && edited_at) { // edited_at might not exist for new service
        const edate = new Date(edited_at);
        t_string += ` (✎ ${edate.toLocaleTimeString(locale, timeOptions)} ${edate.toLocaleDateString(locale, dateOptions)})`;
    }
    return t_string;
}

module.exports = { get_timestamps };