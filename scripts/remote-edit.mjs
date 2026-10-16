#!/usr/bin/env node
/**
 * Change the owner's checklist in Supabase from a computer.
 * The phone picks the edit up on its next sync (resume, focus, realtime, or the 30s poll).
 *
 * Required environment (either name works):
 *   VITE_SUPABASE_URL or SUPABASE_URL          Project URL
 *   VITE_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY  anon public key
 *   VITE_SYNC_SPACE_ID or SYNC_SPACE_ID          same space id baked into the app
 *
 * Do not use the service_role key. The anon key plus the space id is the
 * credential, and row level security scopes every row to that space id.
 * Both values are also inside the public APK. See the README.
 *
 *   node scripts/remote-edit.mjs notes --list "Fire department" --task "Check hydrant map" --notes "Called the station"
 *   node scripts/remote-edit.mjs add --list "Personal" --task "Buy milk"
 *   node scripts/remote-edit.mjs remove --list "Personal" --task "Buy milk"
 *
 * Match is the whole list name (or its slug) and the whole task title, case-insensitive.
 */

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "")
  .trim()
  .replace(/\/+$/, "");
const key = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "").trim();
const space = (process.env.VITE_SYNC_SPACE_ID || process.env.SYNC_SPACE_ID || "").trim();

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function usage() {
  fail(
    [
      "Usage:",
      '  node scripts/remote-edit.mjs notes --list "Fire department" --task "Check hydrant map" --notes "Called the station"',
      '  node scripts/remote-edit.mjs add --list "Personal" --task "Buy milk"',
      '  node scripts/remote-edit.mjs remove --list "Personal" --task "Buy milk"',
    ].join("\n"),
  );
}

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      out._.push(token);
      continue;
    }
    const name = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) fail(`Missing value for --${name}`);
    out[name] = value;
    i += 1;
  }
  return out;
}

function enc(value) {
  return encodeURIComponent(value);
}

async function rest(path, init = {}) {
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    "x-sync-space": space,
  };
  if (init.prefer) headers.Prefer = init.prefer;
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body,
    signal: AbortSignal.timeout(8000),
  });
  const raw = await response.text();
  if (!response.ok) fail(raw.slice(0, 300) || `Supabase ${response.status}`);
  return raw ? JSON.parse(raw) : null;
}

function one(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0) fail(`No ${label} matched.`);
  if (rows.length > 1) fail(`More than one ${label} matched. Use the full name.`);
  return rows[0];
}

async function main() {
  if (!url || !key || !space) {
    fail("Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_SYNC_SPACE_ID.", 2);
  }
  const parsed = args(process.argv.slice(2));
  const command = parsed._[0];
  const listName = parsed.list?.trim();
  const taskTitle = parsed.task?.trim();
  if (!command || !listName || !taskTitle) usage();
  if (command === "notes" && parsed.notes === undefined)
    fail('notes needs --notes. Use --notes "" to clear them.');
  if (command !== "notes" && command !== "add" && command !== "remove") usage();

  const lists = await rest(
    `sync_lists?select=id,name,slug&space_id=eq.${enc(space)}&deleted_at=is.null&limit=10000`,
  );
  if (!Array.isArray(lists)) fail("Supabase returned an unexpected list payload.");
  const wanted = listName.toLowerCase();
  const exact = lists.filter(
    (list) => list.name?.toLowerCase() === wanted || list.slug?.toLowerCase() === wanted,
  );
  const list = one(exact, `list named “${listName}”`);

  const tasks = await rest(
    `sync_tasks?select=id,title,notes&space_id=eq.${enc(space)}&list_id=eq.${enc(list.id)}&deleted_at=is.null&limit=10000`,
  );
  if (!Array.isArray(tasks)) fail("Supabase returned an unexpected task payload.");
  const title = taskTitle.toLowerCase();
  const matches = tasks.filter((task) => task.title?.toLowerCase() === title);
  const now = new Date().toISOString();

  if (command === "add") {
    if (matches.length) fail(`“${taskTitle}” is already on ${list.name}.`);
    const created = await rest("sync_tasks", {
      method: "POST",
      prefer: "return=representation",
      body: JSON.stringify({
        space_id: space,
        id: crypto.randomUUID(),
        list_id: list.id,
        title: taskTitle,
        done: false,
        notes: "",
        due: null,
        calendar_event_id: null,
        updated_at: now,
        deleted_at: null,
      }),
    });
    if (!Array.isArray(created) || !created.length) fail("Supabase did not save the task.");
    console.log(`Added “${taskTitle}” to ${list.name}.`);
    return;
  }

  const task = one(matches, `task titled “${taskTitle}” on ${list.name}`);
  if (command === "remove") {
    const removed = await rest(`sync_tasks?space_id=eq.${enc(space)}&id=eq.${enc(task.id)}`, {
      method: "PATCH",
      prefer: "return=representation",
      body: JSON.stringify({ updated_at: now, deleted_at: now }),
    });
    if (!Array.isArray(removed) || !removed.length) fail("Supabase did not remove the task.");
    console.log(`Removed “${task.title}” from ${list.name}.`);
    return;
  }

  const saved = await rest(`sync_tasks?space_id=eq.${enc(space)}&id=eq.${enc(task.id)}`, {
    method: "PATCH",
    prefer: "return=representation",
    body: JSON.stringify({ notes: parsed.notes, updated_at: now }),
  });
  if (!Array.isArray(saved) || !saved.length) fail("Supabase did not save the notes.");
  console.log(`Saved notes on “${task.title}” in ${list.name}.`);
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : "Request failed.");
});
