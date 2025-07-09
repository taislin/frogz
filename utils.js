// utils.js

function get_timestamps(created_at, edited_at, locale = "en-GB") {
    console.log("[DEBUG get_timestamps] Received created_at:", created_at, "Type:", typeof created_at);
    console.log("[DEBUG get_timestamps] Received locale:", locale); // ADDED: Log locale

    let t_string = "";

    // Ensure created_at is a number. If it's a string, convert it.
    // Use Number() for more direct conversion if it's already a clean string representation of a number.
    const createdTime = typeof created_at === 'string' ? Number(created_at) : created_at;

    // Check if createdTime is a valid number.
    if (isNaN(createdTime) || createdTime === null || createdTime === undefined) {
        console.error("[DEBUG get_timestamps] Invalid created_at value provided after conversion:", created_at);
        return "Invalid Date";
    }

    // === FIX START: Robust Locale Handling ===
    // Validate locale string (basic check) and fallback if invalid
    // `toLocaleTimeString` can throw RangeError if locale is not a valid BCP 47 language tag
    let validLocale = "en-GB"; // Default fallback
    try {
        // Test if the provided locale is valid by trying to create an Intl.DateTimeFormat object
        // This is a robust way to validate without relying on a full list
        new Intl.DateTimeFormat(locale);
        validLocale = locale;
    } catch (e) {
        console.warn(`[DEBUG get_timestamps] Invalid locale '${locale}' provided. Falling back to '${validLocale}'. Error:`, e.message);
    }
    // === FIX END ===

    const cdate = new Date(createdTime);
    const dateOptions = { year: "2-digit", month: "2-digit", day: "2-digit" };
    const timeOptions = { hour: "2-digit", minute: "2-digit" };

    t_string += cdate.toLocaleTimeString(validLocale, timeOptions) + " " + cdate.toLocaleDateString(validLocale, dateOptions);

    if (created_at !== edited_at && edited_at) {
        const editedTime = typeof edited_at === 'string' ? Number(edited_at) : edited_at; // Use Number() for consistency
        if (!isNaN(editedTime) && editedTime !== null && editedTime !== undefined) {
            const edate = new Date(editedTime);
            t_string += ` (✎ ${edate.toLocaleTimeString(validLocale, timeOptions)} ${edate.toLocaleDateString(validLocale, dateOptions)})`;
        }
    }
    return t_string;
}

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

module.exports = { get_timestamps, escapeHtml };