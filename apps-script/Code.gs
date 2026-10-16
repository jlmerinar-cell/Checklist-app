/**
 * Checklist calendar hook.
 *
 * This web app runs as the Google account that deploys it and creates events
 * on that account's default calendar. The phone app never talks to Google
 * OAuth. It only POSTs here.
 *
 * Deploy: Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Script property: CAL_TOKEN = the same string as VITE_CALENDAR_HOOK_TOKEN.
 * Code edits do not go live until you deploy a new version.
 *
 * Request JSON: { "token": "...", "title": "...", "start": "<ISO-8601>", "end": "<ISO-8601>" }
 * Response JSON: { "ok": true|false, "message": "...", "eventId": "..." }
 *
 * CORS (Capacitor Android WebView and browsers):
 * Apps Script does not answer a CORS preflight. A POST with Content-Type
 * application/json makes the WebView send OPTIONS first, and that fails, so
 * the event is never created. The app therefore sends Content-Type: text/plain
 * (a "simple" request, no preflight). The /exec URL answers with a redirect to
 * script.googleusercontent.com. The client must follow it (fetch redirect
 * "follow"). That redirected response is readable cross-origin. Do not use
 * mode "no-cors" — the body would be hidden and the status line could not
 * show success or the error. doPost reads the raw text from e.postData.contents
 * and JSON.parses it, so text/plain is fine.
 */

var EVENT_MS_LIMIT = 1000 * 60 * 60 * 24 * 14;

function doGet() {
  return json_({
    ok: false,
    message: "This hook only accepts POST. Send JSON with token, title, start, and end.",
    eventId: "",
  });
}

function doPost(e) {
  try {
    return createFromPost_(e);
  } catch (err) {
    return json_({
      ok: false,
      message: errorText_(err),
      eventId: "",
    });
  }
}

function createFromPost_(e) {
  var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : "";
  var data;
  try {
    data = JSON.parse(raw);
  } catch (parseError) {
    return json_({
      ok: false,
      message: "Expected JSON with token, title, start, and end.",
      eventId: "",
    });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return json_({
      ok: false,
      message: "Expected JSON with token, title, start, and end.",
      eventId: "",
    });
  }

  var expected = String(PropertiesService.getScriptProperties().getProperty("CAL_TOKEN") || "").trim();
  var given = typeof data.token === "string" ? data.token.trim() : "";
  if (!expected) {
    return json_({
      ok: false,
      message: "Set the CAL_TOKEN script property, then deploy again if you have not.",
      eventId: "",
    });
  }
  if (!given || given !== expected) {
    return json_({
      ok: false,
      message: "The calendar token does not match CAL_TOKEN.",
      eventId: "",
    });
  }

  var title = typeof data.title === "string" ? data.title.trim() : "";
  if (title.length > 200) title = title.slice(0, 200).trim();
  if (!title) {
    return json_({ ok: false, message: "Name the event.", eventId: "" });
  }

  var start = parseInstant_(data.start);
  var end = parseInstant_(data.end);
  if (!start || !end) {
    return json_({
      ok: false,
      message: "Start and end must be ISO times, such as 2026-10-16T18:00:00.000Z.",
      eventId: "",
    });
  }
  if (end.getTime() <= start.getTime()) {
    return json_({ ok: false, message: "End must be after start.", eventId: "" });
  }
  if (end.getTime() - start.getTime() > EVENT_MS_LIMIT) {
    return json_({ ok: false, message: "That event is longer than 14 days.", eventId: "" });
  }

  var created = CalendarApp.getDefaultCalendar().createEvent(title, start, end);
  return json_({
    ok: true,
    message: 'Added "' + title + '" to Google Calendar.',
    eventId: created.getId(),
  });
}

function parseInstant_(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  var date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date;
}

function errorText_(err) {
  var text = err && err.message ? String(err.message) : "Calendar did not save that event.";
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "Calendar did not save that event.";
  if (text.length > 180) return text.slice(0, 180);
  return text;
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
