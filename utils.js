// utils.js

function get_timestamps(created_at, edited_at, locale = "en-GB") {
    // ... (existing get_timestamps code) ...
    let t_string = "";
    const cdate = new Date(created_at);
    const dateOptions = { year: "2-digit", month: "2-digit", day: "2-digit" };
    const timeOptions = { hour: "2-digit", minute: "2-digit" };

    t_string += cdate.toLocaleTimeString(locale, timeOptions) + " " + cdate.toLocaleDateString(locale, dateOptions);

    if (created_at !== edited_at && edited_at) {
        const edate = new Date(edited_at);
        t_string += ` (✎ ${edate.toLocaleTimeString(locale, timeOptions)} ${edate.toLocaleDateString(locale, dateOptions)})`;
    }
    return t_string;
}

// ADDED: Function to HTML-escape strings for safe insertion into HTML attributes/content
function escapeHtml(str) {
    if (typeof str !== 'string') {
        str = String(str);
    }
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}


module.exports = { get_timestamps, escapeHtml }; // Export the new function