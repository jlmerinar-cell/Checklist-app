import { migrateV1toV2, normalizeTheme } from "./migrate.ts";
import {
  activeList,
  addTask,
  createList,
  deleteList,
  getState,
  moveListTo,
  moveTaskTo,
  markShared,
  renameList,
  replaceImported,
  saveNotes,
  setActive,
  setDone,
  setDueAt,
  setMessage,
  setNotesOpen,
  setTheme,
  setTitle,
  slugify,
  uniqueSlug,
  visibleLists,
} from "./store.ts";
import { dueAtFromParts, isDateOnly } from "./time.ts";
import { NOTES_LIMIT, TITLE_LIMIT, type List, type Task, type ThemeId } from "./types.ts";

export type CmdResult = { ok: boolean; message: string; ref?: string };

const THEME_LABEL: Record<ThemeId, string> = {
  light: "light",
  dark: "dark",
  contrast: "high contrast",
  pink: "pink",
  rugged: "rugged",
};

export const HELP = [
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
  "checklist due <list> <task> <YYYY-MM-DD> [HH:MM]",
  "checklist clear-due <list> <task>",
  "checklist move <list> <task> to <n>",
  "checklist move-list <list> to <n>",
  "checklist theme <light|dark|contrast|pink|rugged>",
  "checklist daily [on|off]",
  "checklist share <list>",
  "checklist download",
  "checklist import <json>",
  "checklist connect-calendar",
].join("\n");

function ok(message: string, ref?: string): CmdResult {
  setMessage(message);
  return { ok: true, message, ref };
}

function fail(message: string): CmdResult {
  setMessage(message);
  return { ok: false, message };
}

function findList(query: string): { list?: List; error?: string } {
  const lists = visibleLists();
  const name = query.trim().toLowerCase();
  if (!name) return { error: "Name the list." };
  const exact = lists.filter((list) => list.slug.toLowerCase() === name || list.name.toLowerCase() === name);
  if (exact.length === 1 && exact[0]) return { list: exact[0] };
  if (exact.length > 1) return { error: `More than one list matches “${query}”.` };
  const prefix = lists.filter(
    (list) => list.slug.toLowerCase().startsWith(name) || list.name.toLowerCase().startsWith(name),
  );
  if (prefix.length === 1 && prefix[0]) return { list: prefix[0] };
  if (prefix.length > 1) return { error: `More than one list matches “${query}”.` };
  return { error: `No list matches “${query}”.` };
}

function findTask(list: List, query: string): { task?: Task; error?: string } {
  const tasks = list.tasks.filter((item) => !item.deletedAt);
  const name = query.trim().toLowerCase();
  if (!name) return { error: "Name the task." };
  const exact = tasks.filter((item) => item.title.toLowerCase() === name);
  if (exact.length === 1 && exact[0]) return { task: exact[0] };
  if (exact.length > 1) return { error: `More than one task matches “${query}”.` };
  const prefix = tasks.filter((item) => item.title.toLowerCase().startsWith(name));
  if (prefix.length === 1 && prefix[0]) return { task: prefix[0] };
  if (prefix.length > 1) return { error: `More than one task matches “${query}”.` };
  const includes = tasks.filter((item) => item.title.toLowerCase().includes(name));
  if (includes.length === 1 && includes[0]) return { task: includes[0] };
  if (includes.length > 1) return { error: `More than one task matches “${query}”.` };
  return { error: `No task matches “${query}” on ${list.name}.` };
}

function splitList(words: string[], takeAll: boolean): { list?: List; rest: string[]; error?: string } {
  if (!words.length) return { rest: [], error: "Name the list." };
  const limit = takeAll ? words.length : Math.max(words.length - 1, 1);
  for (let size = limit; size >= 1; size -= 1) {
    const query = words.slice(0, size).join(" ");
    const found = findList(query);
    if (found.error?.startsWith("More than one")) return { rest: words, error: found.error };
    if (found.list) return { list: found.list, rest: words.slice(size) };
  }
  return { rest: words, error: "No list matches that name." };
}

export function createListCommand(name: string): CmdResult {
  const trimmed = name.trim().slice(0, TITLE_LIMIT);
  if (!trimmed) return fail("A list needs a name.");
  const list = createList(trimmed);
  return ok(`Created ${list.name}.`, list.id);
}

export function switchCommand(query: string): CmdResult {
  const found = findList(query);
  if (!found.list) return fail(found.error ?? "No list matches that name.");
  setActive(found.list.id);
  return ok(`Showing ${found.list.name}.`, found.list.id);
}

export function addTaskCommand(listQuery: string, title: string): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Name the list and the task.");
  const trimmed = title.trim().slice(0, TITLE_LIMIT);
  if (!trimmed) return fail("A task needs a title.");
  const created = addTask(found.list.id, trimmed);
  if (!created) return fail("A task needs a title.");
  setActive(found.list.id);
  return ok(`Added “${trimmed}” to ${found.list.name}.`, created.id);
}

export function editTitleCommand(listQuery: string, taskQuery: string, title: string): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Name the list and the task.");
  const task = findTask(found.list, taskQuery);
  if (!task.task) return fail(task.error ?? "Task not found.");
  const trimmed = title.trim().slice(0, TITLE_LIMIT);
  if (!trimmed) return fail("A task needs a title.");
  setTitle(found.list.id, task.task.id, trimmed);
  return ok(`Title is now “${trimmed}”.`);
}

export function toggleCommand(listQuery: string, taskQuery: string, done?: boolean): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Task not found.");
  const task = findTask(found.list, taskQuery);
  if (!task.task) return fail(task.error ?? "Task not found.");
  const next = done ?? !task.task.done;
  setDone(found.list.id, task.task.id, next);
  return ok(next ? `Checked “${task.task.title}”.` : `Unchecked “${task.task.title}”.`);
}

export function notesCommand(listQuery: string, taskQuery: string): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Task not found.");
  const task = findTask(found.list, taskQuery);
  if (!task.task) return fail(task.error ?? "Task not found.");
  setActive(found.list.id);
  setNotesOpen(found.list.id, task.task.id, true);
  return ok(`Notes open for “${task.task.title}”.`);
}

export function saveNotesCommand(listQuery: string, taskQuery: string, notes?: string): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Task not found.");
  const task = findTask(found.list, taskQuery);
  if (!task.task) return fail(task.error ?? "Task not found.");
  saveNotes(found.list.id, task.task.id, notes?.slice(0, NOTES_LIMIT));
  return ok(`Saved notes for “${task.task.title}”.`);
}

export function dueCommand(listQuery: string, taskQuery: string, date: string | null, clock?: string | null): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Task not found.");
  const task = findTask(found.list, taskQuery);
  if (!task.task) return fail(task.error ?? "Task not found.");
  if (date && !isDateOnly(date)) return fail("Use a due date like 2026-10-20.");
  const dueAt = date ? dueAtFromParts(date, clock) : null;
  if (date && !dueAt) return fail("Use a time like 09:00.");
  setDueAt(found.list.id, task.task.id, dueAt);
  if (!date) return ok(`Cleared the due date on “${task.task.title}”.`);
  const calendar = getState().calendar === "connected" ? " Sending it to Google Calendar." : " Saved on this phone.";
  const when = clock ? `${date} ${clock}` : date;
  return ok(`Due ${when} on “${task.task.title}”.${calendar}`);
}

export function themeCommand(name: string): CmdResult {
  const token = name.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const known = new Set([
    "light",
    "dark",
    "contrast",
    "high-contrast",
    "highcontrast",
    "pink",
    "floral",
    "girly",
    "flower",
    "rugged",
    "masculine",
    "leather",
    "forest",
  ]);
  if (!known.has(token)) return fail("Theme must be light, dark, contrast, pink, or rugged.");
  const theme = normalizeTheme(token);
  setTheme(theme);
  return ok(`Theme is ${THEME_LABEL[theme]}.`);
}

export function renameCommand(listQuery: string, name: string): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Name the list.");
  const error = renameList(found.list.id, name);
  if (error) return fail(error);
  return ok(`Renamed to ${name.trim()}.`);
}

export function deleteCommand(listQuery: string): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Name the list.");
  const label = found.list.name;
  const error = deleteList(found.list.id);
  if (error) return fail(error);
  return ok(`Deleted ${label}.`);
}

export function moveTaskCommand(listQuery: string, taskQuery: string, position: number): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Name the list and the task.");
  const task = findTask(found.list, taskQuery);
  if (!task.task) return fail(task.error ?? "Task not found.");
  const error = moveTaskTo(found.list.id, task.task.id, position);
  if (error) return fail(error);
  return ok(`Moved “${task.task.title}” to ${position}.`);
}

export function moveListCommand(listQuery: string, position: number): CmdResult {
  const found = findList(listQuery);
  if (!found.list) return fail(found.error ?? "Name the list.");
  const error = moveListTo(found.list.id, position);
  if (error) return fail(error);
  return ok(`Moved ${found.list.name} to ${position}.`);
}

export function downloadCommand(): CmdResult {
  if (typeof document === "undefined") return fail("Download only works in the browser.");
  const current = getState();
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const lists = visibleLists(current.lists).map((list) => ({
    ...list,
    tasks: list.tasks.filter((item) => !item.deletedAt),
  }));
  const payload = {
    version: 2,
    exportedAt: now.toISOString(),
    theme: current.settings.defaultTheme,
    dailyEnabled: current.settings.dailyEnabled,
    settings: current.settings,
    lists,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `checklist-${day}.json`;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return ok(`Exported ${lists.length} lists.`);
}

export function importCommand(raw: string): CmdResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fail("Invalid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || !("lists" in parsed) || !Array.isArray((parsed as { lists: unknown }).lists)) {
    return fail("No lists found in file.");
  }
  const body = parsed as { lists: unknown[]; theme?: unknown; dailyEnabled?: unknown };
  const imported = body.lists.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const name = String(record.name ?? "Untitled").slice(0, TITLE_LIMIT).trim() || "Untitled";
    const tasks = Array.isArray(record.tasks) ? record.tasks : [];
    return [
      {
        ...record,
        id: crypto.randomUUID(),
        name,
        slug: slugify(name),
        system: false,
        tasks: tasks.flatMap((task) => {
          if (!task || typeof task !== "object") return [];
          const item = task as Record<string, unknown>;
          const title = String(item.title ?? "").slice(0, TITLE_LIMIT).trim();
          if (!title) return [];
          return [{ ...item, id: crypto.randomUUID(), title, calendarEventId: null }];
        }),
      },
    ];
  });
  if (!imported.length) return fail("No lists found in file.");
  const theme = typeof body.theme === "string" ? normalizeTheme(body.theme) : undefined;
  const dailyEnabled = typeof body.dailyEnabled === "boolean" ? body.dailyEnabled : undefined;
  const shaped = migrateV1toV2({ lists: imported, theme, dailyEnabled, activeId: null });
  const lists = shaped.lists
    .filter((list) => list.kind !== "daily")
    .map((list) => ({ ...list, slug: uniqueSlug(list.name, shaped.lists, list.id), shared: false }));
  replaceImported(lists, theme, dailyEnabled);
  return ok(`Imported ${lists.length} lists.`);
}

export function listLink(list: List): string {
  if (typeof window === "undefined") return `?list=${encodeURIComponent(list.slug)}`;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("list", list.slug);
  return url.toString();
}

export async function shareCommand(query?: string): Promise<CmdResult> {
  const found = query ? findList(query) : { list: activeList() ?? undefined };
  if ("error" in found && found.error) return fail(found.error);
  const list = found.list;
  if (!list) return fail("Nothing to share yet.");
  markShared(list.id);
  const link = listLink(list);
  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    copied = false;
  }
  const lead = copied ? "Link copied. " : `Link: ${link} `;
  return ok(`${lead}Opens ${list.name}. With sync on, every list in this space stays updated.`, list.id);
}

function positionOf(words: string[]): { index: number; position: number } | { error: string } {
  const at = words.map((word) => word.toLowerCase()).lastIndexOf("to");
  if (at <= 0 || at === words.length - 1) return { error: "Add “to” and a position, like to 1." };
  const position = Number(words[at + 1]);
  if (!Number.isInteger(position)) return { error: "Position has to be a whole number." };
  return { index: at, position };
}

let dailyHandler: ((force: boolean) => Promise<CmdResult>) | null = null;
let connectHandler: (() => Promise<CmdResult>) | null = null;
let dailyToggle: ((enabled: boolean) => CmdResult) | null = null;

export function registerAsyncCommands(handlers: {
  daily: (force: boolean) => Promise<CmdResult>;
  connect: () => Promise<CmdResult>;
  setDaily: (enabled: boolean) => CmdResult;
}): void {
  dailyHandler = handlers.daily;
  connectHandler = handlers.connect;
  dailyToggle = handlers.setDaily;
}

export async function execCommand(input: string): Promise<CmdResult> {
  const trimmed = input.trim();
  const imported = trimmed.match(/^(?:checklist\s+)?import(?:\s+|$)([\s\S]*)$/i);
  if (imported) {
    const body = imported[1]?.trim() ?? "";
    return body ? importCommand(body) : fail("Paste the JSON after checklist import.");
  }
  const flat = trimmed.replace(/\s+/g, " ");
  if (!flat) return fail("Type a command. Try checklist help.");
  const [verbRaw, ...words] = flat.replace(/^checklist\s+/i, "").split(" ");
  const verb = (verbRaw ?? "").toLowerCase();
  if (verb === "help") return ok(HELP);
  if (verb === "create") return createListCommand(words.join(" "));
  if (verb === "connect-calendar" || verb === "connect") {
    return connectHandler ? connectHandler() : fail("Calendar isn’t ready yet.");
  }
  if (verb === "theme") return themeCommand(words.join(" "));
  if (verb === "download" || verb === "export") return downloadCommand();
  if (verb === "daily") {
    const flag = (words[0] ?? "").toLowerCase();
    if (flag === "on" || flag === "enable") return dailyToggle ? dailyToggle(true) : fail("Daily isn’t ready yet.");
    if (flag === "off" || flag === "disable") return dailyToggle ? dailyToggle(false) : fail("Daily isn’t ready yet.");
    return dailyHandler ? dailyHandler(true) : fail("Daily isn’t ready yet.");
  }
  if (verb === "add") {
    const split = splitList(words, false);
    return split.list ? addTaskCommand(split.list.slug, split.rest.join(" ")) : fail(split.error ?? "Name the list and the task.");
  }
  if (verb === "switch" || verb === "open") {
    const split = splitList(words, true);
    return split.list ? switchCommand(split.list.slug) : fail(split.error ?? "Name the list.");
  }
  if (verb === "delete") {
    const split = splitList(words, true);
    return split.list ? deleteCommand(split.list.slug) : fail(split.error ?? "Name the list.");
  }
  if (verb === "share") {
    const split = splitList(words, true);
    return split.list ? shareCommand(split.list.slug) : fail(split.error ?? "Name the list.");
  }
  if (verb === "rename") {
    const at = words.map((word) => word.toLowerCase()).indexOf("to");
    if (at <= 0) return fail("Use checklist rename <list> to <name>.");
    const split = splitList(words.slice(0, at), true);
    return split.list ? renameCommand(split.list.slug, words.slice(at + 1).join(" ")) : fail(split.error ?? "Name the list.");
  }
  if (verb === "move-list") {
    const position = positionOf(words);
    if ("error" in position) return fail(`Use checklist move-list <list> to <n>. ${position.error}`);
    const split = splitList(words.slice(0, position.index), true);
    return split.list ? moveListCommand(split.list.slug, position.position) : fail(split.error ?? "Name the list.");
  }
  if (verb === "move") {
    const position = positionOf(words);
    if ("error" in position) return fail(`Use checklist move <list> <task> to <n>. ${position.error}`);
    const split = splitList(words.slice(0, position.index), false);
    return split.list
      ? moveTaskCommand(split.list.slug, split.rest.join(" "), position.position)
      : fail(split.error ?? "Name the list and the task.");
  }
  if (verb === "edit") {
    const at = words.map((word) => word.toLowerCase()).indexOf("to");
    if (at <= 0) return fail("Use checklist edit <list> <task> to <title>.");
    const split = splitList(words.slice(0, at), false);
    return split.list
      ? editTitleCommand(split.list.slug, split.rest.join(" "), words.slice(at + 1).join(" "))
      : fail(split.error ?? "Name the list and the task.");
  }
  if (verb === "save") {
    const parts = words.join(" ").split(/\s*::\s*/);
    if (parts.length < 2) return fail("Use checklist save <list> <task> :: <notes>.");
    const split = splitList((parts[0] ?? "").split(" ").filter(Boolean), false);
    return split.list
      ? saveNotesCommand(split.list.slug, split.rest.join(" "), parts.slice(1).join(" :: "))
      : fail(split.error ?? "Name the list and the task.");
  }
  if (verb === "due") {
    const clock = words.length >= 2 && /^\d{1,2}:\d{2}$/.test(words[words.length - 1] ?? "") ? words[words.length - 1] : null;
    const dateIndex = clock ? words.length - 2 : words.length - 1;
    const date = words[dateIndex] ?? "";
    const split = splitList(words.slice(0, dateIndex), false);
    return split.list
      ? dueCommand(split.list.slug, split.rest.join(" "), date, clock)
      : fail(split.error ?? "Name the list, the task, and a date.");
  }
  if (!["check", "uncheck", "toggle", "notes", "clear-due"].includes(verb)) {
    return fail("Unknown command. Try checklist help.");
  }
  const split = splitList(words, false);
  if (!split.list) return fail(split.error ?? "Name the list and the task.");
  const taskQuery = split.rest.join(" ");
  if (verb === "check") return toggleCommand(split.list.slug, taskQuery, true);
  if (verb === "uncheck") return toggleCommand(split.list.slug, taskQuery, false);
  if (verb === "toggle") return toggleCommand(split.list.slug, taskQuery);
  if (verb === "notes") return notesCommand(split.list.slug, taskQuery);
  return dueCommand(split.list.slug, taskQuery, null);
}

export type ChecklistApi = ((input: string) => Promise<CmdResult>) & {
  createList: typeof createListCommand;
  switchTab: typeof switchCommand;
  addTask: typeof addTaskCommand;
  editTitle: typeof editTitleCommand;
  toggleCheckbox: typeof toggleCommand;
  openNotes: typeof notesCommand;
  saveNotes: typeof saveNotesCommand;
  setDueDate: typeof dueCommand;
  changeTheme: typeof themeCommand;
  renameList: typeof renameCommand;
  deleteList: typeof deleteCommand;
  moveTask: typeof moveTaskCommand;
  moveList: typeof moveListCommand;
  downloadLists: typeof downloadCommand;
  importLists: typeof importCommand;
  shareList: typeof shareCommand;
  exec: typeof execCommand;
};

export function installCommands(): void {
  if (typeof window === "undefined") return;
  const api = Object.assign(execCommand, {
    createList: createListCommand,
    switchTab: switchCommand,
    addTask: addTaskCommand,
    editTitle: editTitleCommand,
    toggleCheckbox: toggleCommand,
    openNotes: notesCommand,
    saveNotes: saveNotesCommand,
    setDueDate: dueCommand,
    changeTheme: themeCommand,
    renameList: renameCommand,
    deleteList: deleteCommand,
    moveTask: moveTaskCommand,
    moveList: moveListCommand,
    downloadLists: downloadCommand,
    importLists: importCommand,
    shareList: shareCommand,
    exec: execCommand,
  });
  window.checklist = api;
  window.__checklistReady = true;
}

export function uninstallCommands(): void {
  if (typeof window === "undefined") return;
  delete window.checklist;
  window.__checklistReady = false;
}

declare global {
  interface Window {
    checklist?: ChecklistApi;
    __checklistReady?: boolean;
    Capacitor?: { isNativePlatform?: () => boolean };
    google?: {
      accounts?: {
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; expires_in?: number; error?: string }) => void;
          }) => { requestAccessToken: (options?: { prompt?: string }) => void };
        };
      };
    };
  }
}
