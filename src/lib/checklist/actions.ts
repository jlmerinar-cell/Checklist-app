/**
 * Every mutation the screen and the bot call.
 * Both go through storage, so a command and a tap cannot drift apart.
 */

import { flushCalendar, connectCalendar as connectGoogle, initCalendar } from "./calendar";
import { runDaily } from "./daily";
import { FREE_SHARED_LIST_CAP, upgradeLimits } from "./limits";
import { clampNotes, clampTitle, findList, findTask, isDate, nowIso, uid, uniqueSlug } from "./resolve";
import { inviteUrl, pullInvite, supabaseConfigured } from "./sharing";
import * as db from "./storage";
import type { ActionResult, List, Task, Theme } from "./types";
import { parseTheme } from "./themes";

function ok(message: string, ref?: string): ActionResult {
  db.setStatus({ message });
  return { ok: true, message, ref };
}

function fail(message: string): ActionResult {
  db.setStatus({ message });
  return { ok: false, message };
}

function requireList(listRef: string) {
  const found = findList(db.getSnapshot().lists, listRef);
  if (found.ambiguous) return { error: `More than one list matches “${listRef}”.` };
  if (!found.list) return { error: `No list matches “${listRef}”.` };
  return { list: found.list };
}

function requireTask(listRef: string, taskRef: string) {
  const listResult = requireList(listRef);
  if ("error" in listResult && listResult.error) return { error: listResult.error };
  const list = listResult.list;
  if (!list) return { error: `No list matches “${listRef}”.` };
  const found = findTask(list.tasks, taskRef);
  if (found.ambiguous) return { error: `More than one task matches “${taskRef}”.` };
  if (!found.task) return { error: `No task matches “${taskRef}” on ${list.name}.` };
  return { list, task: found.task };
}

export function createList(name: string): ActionResult {
  const trimmed = clampTitle(name).trim();
  if (!trimmed) return fail("A list needs a name.");
  const lists = db.getSnapshot().lists;
  const created = {
    id: uid(),
    slug: uniqueSlug(trimmed, lists),
    name: trimmed,
    inviteToken: uid(),
    shared: false,
    updatedAt: nowIso(),
    day: null,
    system: false,
    tasks: [] as Task[],
  };
  db.insertList(created);
  return ok(`Created ${created.name}.`, created.id);
}

export function switchTab(listRef: string): ActionResult {
  const found = requireList(listRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list) return fail(`No list matches “${listRef}”.`);
  db.setActive(found.list.id);
  return ok(`Showing ${found.list.name}.`, found.list.id);
}

export function addTask(listRef: string, title: string): ActionResult {
  const found = requireList(listRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list) return fail(`No list matches “${listRef}”.`);
  const trimmed = clampTitle(title).trim();
  if (!trimmed) return fail("A task needs a title.");
  const task: Task = {
    id: uid(),
    title: trimmed,
    done: false,
    notes: "",
    notesDraft: "",
    due: null,
    calendarEventId: null,
    calendarPending: false,
    notesOpen: false,
    editing: false,
  };
  db.addTask(found.list.id, task);
  db.setActive(found.list.id);
  return ok(`Added “${trimmed}” to ${found.list.name}.`, task.id);
}

export function addTaskToActive(title: string): ActionResult {
  const active = db.activeList();
  if (!active) return fail("Add a list first.");
  return addTask(active.slug, title);
}

export function editTitle(listRef: string, taskRef: string, title: string): ActionResult {
  const found = requireTask(listRef, taskRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list || !found.task) return fail("Task not found.");
  const trimmed = clampTitle(title).trim();
  if (!trimmed) return fail("A task needs a title.");
  db.editTitle(found.list.id, found.task.id, trimmed);
  void flushCalendar();
  return ok(`Title is now “${trimmed}”.`);
}

export function editTitleById(listId: string, taskId: string, title: string): void {
  db.editTitle(listId, taskId, clampTitle(title));
  void flushCalendar();
}

export function toggleCheckbox(listRef: string, taskRef: string, done?: boolean): ActionResult {
  const found = requireTask(listRef, taskRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list || !found.task) return fail("Task not found.");
  const next = done ?? !found.task.done;
  db.toggleDone(found.list.id, found.task.id, next);
  return ok(next ? `Checked “${found.task.title}”.` : `Unchecked “${found.task.title}”.`);
}

export function toggleById(listId: string, taskId: string): void {
  db.toggleDone(listId, taskId);
}

export function openNotes(listRef: string, taskRef: string): ActionResult {
  const found = requireTask(listRef, taskRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list || !found.task) return fail("Task not found.");
  db.setActive(found.list.id);
  db.setNotesOpen(found.list.id, found.task.id, true);
  return ok(`Notes open for “${found.task.title}”.`);
}

export function setNotesOpenById(listId: string, taskId: string, open: boolean): void {
  db.setNotesOpen(listId, taskId, open);
}

export function setNotesDraftById(listId: string, taskId: string, draft: string): void {
  db.setNotesDraft(listId, taskId, clampNotes(draft));
}

export function saveNotes(listRef: string, taskRef: string, notes?: string): ActionResult {
  const found = requireTask(listRef, taskRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list || !found.task) return fail("Task not found.");
  db.saveNotes(found.list.id, found.task.id, notes === undefined ? undefined : clampNotes(notes));
  void flushCalendar();
  return ok(`Saved notes for “${found.task.title}”.`);
}

export function saveNotesById(listId: string, taskId: string): void {
  db.saveNotes(listId, taskId);
  db.setStatus({ message: "Notes saved." });
  void flushCalendar();
}

export function setDueDate(listRef: string, taskRef: string, due: string | null): ActionResult {
  const found = requireTask(listRef, taskRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list || !found.task) return fail("Task not found.");
  if (due && !isDate(due)) return fail("Use a due date like 2026-10-20.");
  db.setDue(found.list.id, found.task.id, due);
  void flushCalendar();
  if (!due) return ok(`Cleared the due date on “${found.task.title}”.`);
  const calendar = db.getSnapshot().calendar;
  const extra = calendar === "connected" ? " Sending it to Google Calendar." : " Saved on this phone.";
  return ok(`Due ${due} on “${found.task.title}”.${extra}`);
}

export function setDueById(listId: string, taskId: string, due: string | null): void {
  const list = db.getSnapshot().lists.find((item) => item.id === listId);
  const task = list?.tasks.find((item) => item.id === taskId);
  if (!list || !task) return;
  if (due && !isDate(due)) return;
  db.setDue(listId, taskId, due);
  void flushCalendar();
  db.setStatus({
    message: due ? `Due ${due}.` : "Due date cleared.",
  });
}

export function focusEdit(listId: string, taskId: string): void {
  db.setEditing(listId, taskId, true);
}

const THEME_LABEL: Record<Theme, string> = {
  light: "light",
  dark: "dark",
  contrast: "high contrast",
  pink: "pink",
  rugged: "rugged",
};

export function changeTheme(theme: string): ActionResult {
  const parsed = parseTheme(theme);
  if (!parsed) return fail("Theme must be light, dark, contrast, pink, or rugged.");
  db.setTheme(parsed);
  return ok(`Theme is ${THEME_LABEL[parsed]}.`);
}

export function renameList(listRef: string, name: string): ActionResult {
  const found = requireList(listRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list) return fail(`No list matches “${listRef}”.`);
  if (found.list.system) return fail("Daily can't be renamed.");
  const trimmed = clampTitle(name).trim();
  if (!trimmed) return fail("A list needs a name.");
  const slug = uniqueSlug(
    trimmed,
    db.getSnapshot().lists.filter((list) => list.id !== found.list?.id),
  );
  db.renameList(found.list.id, trimmed, slug);
  return ok(`Renamed to ${trimmed}.`);
}

export function deleteList(listRef: string): ActionResult {
  const found = requireList(listRef);
  if ("error" in found && found.error) return fail(found.error);
  if (!found.list) return fail(`No list matches “${listRef}”.`);
  if (found.list.system) return fail("Daily can't be deleted.");
  const name = found.list.name;
  db.removeList(found.list.id);
  return ok(`Deleted ${name}.`);
}

export async function shareList(listRef?: string): Promise<ActionResult> {
  const target = listRef ? requireList(listRef) : { list: db.activeList() };
  if ("error" in target && target.error) return fail(target.error);
  const list = target.list;
  if (!list) return fail("Nothing to share yet.");
  const sharedCount = db.getSnapshot().lists.filter((item) => item.shared && item.id !== list.id).length;
  if (!list.shared && sharedCount >= FREE_SHARED_LIST_CAP) {
    return fail(upgradeLimits().message);
  }
  const token = !list.shared && list.inviteToken.startsWith("seed-") ? uid() : list.inviteToken;
  db.markShared(list.id, token);
  const link = inviteUrl(token);
  let copied = false;
  try {
    await navigator.clipboard.writeText(link);
    copied = true;
  } catch {
    copied = false;
  }
  if (!supabaseConfigured()) {
    return ok(
      (copied ? "Invite link copied. " : "Invite link: " + link + " ") +
        `Only ${list.name} is shared. Other lists stay on this phone. Connect Supabase for live updates.`,
      list.id,
    );
  }
  return ok(
    (copied ? "Invite link copied. " : "Invite link: " + link + " ") +
      `Only ${list.name} is shared. Other lists stay private.`,
    list.id,
  );
}

export function downloadLists(): ActionResult {
  if (typeof document === "undefined") return fail("Download only works in the browser.");
  const snap = db.getSnapshot();
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${month}-${day}`;
  const payload = {
    exportedAt: now.toISOString(),
    theme: snap.theme,
    dailyEnabled: snap.dailyEnabled,
    lists: snap.lists.map((list) => ({
      id: list.id,
      slug: list.slug,
      name: list.name,
      shared: list.shared,
      day: list.day,
      system: list.system,
      tasks: list.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        done: task.done,
        notes: task.notes,
        due: task.due,
        calendarEventId: task.calendarEventId,
      })),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `checklist-${stamp}.json`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  return ok(`Exported ${snap.lists.length} lists.`);
}

export function importLists(json: string): ActionResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return fail("Invalid JSON.");
  }
  if (!data || typeof data !== "object" || !("lists" in data) || !Array.isArray(data.lists)) {
    return fail("No lists found in file.");
  }
  const imported: List[] = [];
  for (const item of data.lists) {
    if (!item || typeof item !== "object") continue;
    const row = item as { name?: unknown; tasks?: unknown };
    const name = clampTitle(String(row.name ?? "Untitled")).trim() || "Untitled";
    const tasks: Task[] = [];
    if (Array.isArray(row.tasks)) {
      for (const taskItem of row.tasks) {
        if (!taskItem || typeof taskItem !== "object") continue;
        const task = taskItem as { title?: unknown; done?: unknown; notes?: unknown; due?: unknown };
        const title = clampTitle(String(task.title ?? "")).trim();
        if (!title) continue;
        const notes = clampNotes(String(task.notes ?? ""));
        const due = String(task.due ?? "");
        tasks.push({
          id: uid(),
          title,
          done: Boolean(task.done),
          notes,
          notesDraft: notes,
          due: isDate(due) ? due : null,
          calendarEventId: null,
          calendarPending: false,
          notesOpen: false,
          editing: false,
        });
      }
    }
    imported.push({
      id: uid(),
      slug: uniqueSlug(name, imported),
      name,
      inviteToken: uid(),
      shared: false,
      updatedAt: nowIso(),
      day: null,
      system: false,
      tasks,
    });
  }
  if (!imported.length) return fail("No lists found in file.");
  db.setLists(imported);
  if ("theme" in data && typeof data.theme === "string") {
    const theme = parseTheme(data.theme);
    if (theme) db.setTheme(theme);
  }
  if ("dailyEnabled" in data && typeof data.dailyEnabled === "boolean") {
    db.setDailyEnabled(data.dailyEnabled);
  }
  return ok(`Imported ${imported.length} lists.`);
}

export function connectCalendar(): Promise<ActionResult> {
  return connectGoogle().then((result) => {
    db.setStatus({ message: result.message });
    return result;
  });
}

export async function acceptInvite(token: string): Promise<ActionResult> {
  const local = db.getSnapshot().lists.find((list) => list.inviteToken === token);
  if (local) {
    db.setActive(local.id);
    return ok(`Opened ${local.name}.`, local.id);
  }
  const joined = await pullInvite(token);
  if (!joined.ok || !joined.list) return fail(joined.message);
  db.mergeRemote(joined.list);
  db.setActive(joined.list.id);
  return ok(joined.message, joined.list.id);
}

export function bootChecklist(): void {
  db.hydrate();
  initCalendar();
}

export function setDailyEnabled(on: boolean): ActionResult {
  db.setDailyEnabled(on);
  if (on) void runDaily(true);
  return ok(on ? "Daily will fill each morning from the calendar." : "Daily is off.");
}

export function refreshDaily(): Promise<ActionResult> {
  return runDaily(true);
}

export { upgradeLimits };
