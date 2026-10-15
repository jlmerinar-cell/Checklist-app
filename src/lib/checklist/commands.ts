/**
 * Text commands. Same actions the buttons call.
 * Example: checklist add fire-dept check hydrant map
 */

import {
  addTask,
  changeTheme,
  connectCalendar,
  createList,
  deleteList,
  downloadLists,
  editTitle,
  importLists,
  openNotes,
  refreshDaily,
  renameList,
  saveNotes,
  setDailyEnabled,
  setDueDate,
  shareList,
  switchTab,
  toggleCheckbox,
} from "./actions";
import { findList } from "./resolve";
import { getSnapshot, setStatus } from "./storage";
import type { ActionResult, List } from "./types";

const HELP = [
  "checklist add <list> <task>",
  "checklist create <name>",
  "checklist switch <list>",
  "checklist rename <list> to <name>",
  "checklist delete <list>",
  "checklist check <list> <task>",
  "checklist uncheck <list> <task>",
  "checklist toggle <list> <task>",
  "checklist edit <list> <task> to <title>",
  "checklist notes <list> <task>",
  "checklist save <list> <task> :: <notes>",
  "checklist due <list> <task> <YYYY-MM-DD>",
  "checklist clear-due <list> <task>",
  "checklist theme <light|dark|contrast|pink|rugged>",
  "checklist daily [on|off]",
  "checklist share <list>",
  "checklist download",
  "checklist import <json>",
  "checklist connect-calendar",
].join("\n");

function splitList(tokens: string[], allowEmptyRest: boolean): { list: List | null; rest: string[]; error?: string } {
  if (!tokens.length) return { list: null, rest: [], error: "Name the list." };
  const lists = getSnapshot().lists;
  const max = allowEmptyRest ? tokens.length : Math.max(tokens.length - 1, 1);
  for (let count = max; count >= 1; count -= 1) {
    const candidate = tokens.slice(0, count).join(" ");
    const found = findList(lists, candidate);
    if (found.ambiguous) return { list: null, rest: tokens, error: `More than one list matches “${candidate}”.` };
    if (found.list) return { list: found.list, rest: tokens.slice(count) };
  }
  return { list: null, rest: tokens, error: "No list matches that name." };
}

function fail(message: string): ActionResult {
  setStatus({ message });
  return { ok: false, message };
}

export function exec(input: string): ActionResult | Promise<ActionResult> {
  const raw = input.trim();
  const importMatch = raw.match(/^(?:checklist\s+)?import(?:\s+|$)([\s\S]*)$/i);
  if (importMatch) {
    const json = importMatch[1].trim();
    if (!json) return fail("Paste the JSON after checklist import.");
    return importLists(json);
  }
  const trimmed = raw.replace(/\s+/g, " ");
  if (!trimmed) return fail("Type a command. Try checklist help.");
  const body = trimmed.replace(/^checklist\s+/i, "");
  const [verbRaw, ...tokens] = body.split(" ");
  const verb = (verbRaw ?? "").toLowerCase();

  if (verb === "help") {
    setStatus({ message: HELP });
    return { ok: true, message: HELP };
  }
  if (verb === "create") return createList(tokens.join(" "));
  if (verb === "connect-calendar" || verb === "connect") return connectCalendar();
  if (verb === "theme") return changeTheme(tokens.join(" "));
  if (verb === "download" || verb === "export") return downloadLists();
  if (verb === "daily") {
    const arg = (tokens[0] ?? "").toLowerCase();
    if (arg === "on" || arg === "enable") return setDailyEnabled(true);
    if (arg === "off" || arg === "disable") return setDailyEnabled(false);
    return refreshDaily();
  }

  if (verb === "add") {
    const split = splitList(tokens, false);
    if (!split.list) return fail(split.error ?? "Name the list and the task.");
    return addTask(split.list.slug, split.rest.join(" "));
  }

  if (verb === "switch" || verb === "open") {
    const split = splitList(tokens, true);
    if (!split.list) return fail(split.error ?? "Name the list.");
    return switchTab(split.list.slug);
  }

  if (verb === "delete") {
    const split = splitList(tokens, true);
    if (!split.list) return fail(split.error ?? "Name the list.");
    return deleteList(split.list.slug);
  }

  if (verb === "share") {
    const split = splitList(tokens, true);
    if (!split.list) return fail(split.error ?? "Name the list.");
    return shareList(split.list.slug);
  }

  if (verb === "rename") {
    const marker = tokens.map((token) => token.toLowerCase()).indexOf("to");
    if (marker <= 0) return fail("Use checklist rename <list> to <name>.");
    const split = splitList(tokens.slice(0, marker), true);
    if (!split.list) return fail(split.error ?? "Name the list.");
    return renameList(split.list.slug, tokens.slice(marker + 1).join(" "));
  }

  const taskVerbs = new Set(["check", "uncheck", "toggle", "edit", "notes", "save", "due", "clear-due"]);
  if (!taskVerbs.has(verb)) return fail("Unknown command. Try checklist help.");

  if (verb === "edit") {
    const marker = tokens.map((token) => token.toLowerCase()).indexOf("to");
    if (marker <= 0) return fail("Use checklist edit <list> <task> to <title>.");
    const split = splitList(tokens.slice(0, marker), false);
    if (!split.list) return fail(split.error ?? "Name the list and the task.");
    return editTitle(split.list.slug, split.rest.join(" "), tokens.slice(marker + 1).join(" "));
  }

  if (verb === "save") {
    const raw = tokens.join(" ");
    const parts = raw.split(/\s*::\s*/);
    if (parts.length < 2) return fail("Use checklist save <list> <task> :: <notes>.");
    const head = parts[0].split(" ");
    const split = splitList(head, false);
    if (!split.list) return fail(split.error ?? "Name the list and the task.");
    return saveNotes(split.list.slug, split.rest.join(" "), parts.slice(1).join(" :: "));
  }

  if (verb === "due") {
    const date = tokens[tokens.length - 1] ?? "";
    const split = splitList(tokens.slice(0, -1), false);
    if (!split.list) return fail(split.error ?? "Name the list, the task, and a date.");
    return setDueDate(split.list.slug, split.rest.join(" "), date);
  }

  const split = splitList(tokens, false);
  if (!split.list) return fail(split.error ?? "Name the list and the task.");
  const task = split.rest.join(" ");
  if (verb === "check") return toggleCheckbox(split.list.slug, task, true);
  if (verb === "uncheck") return toggleCheckbox(split.list.slug, task, false);
  if (verb === "toggle") return toggleCheckbox(split.list.slug, task);
  if (verb === "notes") return openNotes(split.list.slug, task);
  if (verb === "clear-due") return setDueDate(split.list.slug, task, null);
  return fail("Unknown command. Try checklist help.");
}
