/**
 * Local source of truth. Every write lands here first.
 * Sharing and calendar subscribe; they never keep a second copy of the lists.
 */

import { applyTheme, parseTheme } from "./themes";
import type { CalendarState, List, RemoteList, Snapshot, SyncState, Task, Theme } from "./types";

export const STATE_KEY = "checklist.state.v1";
export const DAILY_LIST_ID = "00000000-0000-4000-8000-0000000000da";

const STAMP = "2026-01-01T00:00:00.000Z";

function task(
  id: string,
  title: string,
  extra?: Partial<Pick<Task, "done" | "notes">>,
): Task {
  return {
    id,
    title,
    done: extra?.done ?? false,
    notes: extra?.notes ?? "",
    notesDraft: extra?.notes ?? "",
    due: null,
    calendarEventId: null,
    calendarPending: false,
    notesOpen: false,
    editing: false,
  };
}

function list(
  id: string,
  slug: string,
  name: string,
  inviteToken: string,
  tasks: Task[],
): List {
  return {
    id,
    slug,
    name,
    inviteToken,
    shared: false,
    updatedAt: STAMP,
    day: null,
    system: false,
    tasks,
  };
}

const SEED_LISTS: List[] = [
  list("11111111-1111-4111-8111-111111111111", "barbershop", "Barbershop", "seed-barbershop", [
    task("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "Saturday open until 5"),
    task("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "Check tomorrow's bookings", { done: true }),
  ]),
  list("22222222-2222-4222-8222-222222222222", "fire-dept", "Fire department", "seed-fire-dept", [
    task("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", "Check hydrant map"),
    task("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", "Quincy Hill relay", { done: true }),
  ]),
  list("33333333-3333-4333-8333-333333333333", "personal", "Personal", "seed-personal", [
    task("cccccccc-cccc-4ccc-8ccc-ccccccccccc1", "EMT skill sheets"),
  ]),
];

function blankDaily(): List {
  return {
    id: DAILY_LIST_ID,
    slug: "daily",
    name: "Daily",
    inviteToken: "seed-daily-list",
    shared: false,
    updatedAt: STAMP,
    day: null,
    system: true,
    tasks: [],
  };
}

export function isDaily(list: List): boolean {
  return list.system || list.id === DAILY_LIST_ID || list.slug === "daily";
}

function withDaily(lists: List[]): List[] {
  const index = lists.findIndex((item) => isDaily(item));
  if (index === -1) return [blankDaily(), ...lists];
  const current = lists[index];
  const fixed: List = {
    ...current,
    id: DAILY_LIST_ID,
    slug: "daily",
    name: "Daily",
    system: true,
  };
  return [fixed, ...lists.filter((_, itemIndex) => itemIndex !== index)];
}

function baseSnapshot(lists: List[], activeId: string | null, theme: Theme): Snapshot {
  return {
    lists: withDaily(lists),
    activeId,
    theme,
    message: "",
    sync: "local",
    syncDetail: "",
    calendar: "off",
    dailyEnabled: false,
    dailyError: "",
  };
}

const SERVER_SNAPSHOT: Snapshot = baseSnapshot(SEED_LISTS, "22222222-2222-4222-8222-222222222222", "dark");

let snapshot: Snapshot = SERVER_SNAPSHOT;
let hydrated = false;
const listeners = new Set<() => void>();
let onLocalSync: (() => void) | null = null;
let onSharedRemove: ((inviteToken: string) => void) | null = null;

export function setRemoveNotifier(fn: ((inviteToken: string) => void) | null): void {
  onSharedRemove = fn;
}

export function setSyncNotifier(fn: (() => void) | null): void {
  onLocalSync = fn;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Snapshot {
  return snapshot;
}

export function getServerSnapshot(): Snapshot {
  return SERVER_SNAPSHOT;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function writeLocal(next: Snapshot): void {
  if (typeof localStorage === "undefined") return;
  const data = {
    lists: next.lists,
    activeId: next.activeId,
    theme: next.theme,
    dailyEnabled: next.dailyEnabled,
  };
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(data));
    localStorage.setItem("checklist.theme", next.theme);
  } catch {
    /* quota or private mode */
  }
}

function commit(next: Snapshot, opts?: { sync?: boolean; persist?: boolean }): void {
  snapshot = next;
  if (opts?.persist !== false && hydrated) writeLocal(next);
  emit();
  if (opts?.sync && hydrated) onLocalSync?.();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseTask(value: unknown): Task | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return null;
  const notes = typeof value.notes === "string" ? value.notes : "";
  const due = typeof value.due === "string" ? value.due : null;
  return {
    id: value.id,
    title: value.title,
    done: value.done === true,
    notes,
    notesDraft: typeof value.notesDraft === "string" ? value.notesDraft : notes,
    due,
    calendarEventId: typeof value.calendarEventId === "string" ? value.calendarEventId : null,
    calendarPending: value.calendarPending === true,
    notesOpen: value.notesOpen === true,
    editing: value.editing === false ? false : value.editing === true,
  };
}

function parseList(value: unknown): List | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  if (typeof value.slug !== "string" || typeof value.name !== "string") return null;
  if (!Array.isArray(value.tasks)) return null;
  const tasks = value.tasks.map(parseTask).filter((item): item is Task => item !== null);
  return {
    id: value.id,
    slug: value.slug,
    name: value.name,
    inviteToken: typeof value.inviteToken === "string" ? value.inviteToken : value.id,
    shared: value.shared === true,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : STAMP,
    day: typeof value.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.day) ? value.day : null,
    system: value.system === true || value.slug === "daily",
    tasks,
  };
}

export function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") {
    emit();
    return;
  }
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) {
      snapshot = {
        ...SERVER_SNAPSHOT,
        lists: SERVER_SNAPSHOT.lists.map((item) => ({ ...item, tasks: item.tasks.map((t) => ({ ...t })) })),
      };
      writeLocal(snapshot);
      applyTheme(snapshot.theme);
      emit();
      return;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.lists)) throw new Error("bad snapshot");
    const lists = withDaily(parsed.lists.map(parseList).filter((item): item is List => item !== null));
    const theme = parseTheme(typeof parsed.theme === "string" ? parsed.theme : "") ?? "dark";
    const activeId = typeof parsed.activeId === "string" ? parsed.activeId : (lists[0]?.id ?? null);
    snapshot = {
      ...baseSnapshot(lists, lists.some((item) => item.id === activeId) ? activeId : (lists[0]?.id ?? null), theme),
      dailyEnabled: parsed.dailyEnabled === true,
    };
    applyTheme(theme);
  } catch {
    snapshot = {
      ...SERVER_SNAPSHOT,
      lists: SERVER_SNAPSHOT.lists.map((item) => ({ ...item, tasks: item.tasks.map((t) => ({ ...t })) })),
    };
    applyTheme("dark");
  }
  emit();
}

export function setStatus(partial: Partial<Pick<Snapshot, "message" | "sync" | "syncDetail" | "calendar">>): void {
  snapshot = { ...snapshot, ...partial };
  emit();
}

export function activeList(): List | null {
  return snapshot.lists.find((list) => list.id === snapshot.activeId) ?? null;
}

function mapList(listId: string, fn: (list: List) => List, sync: boolean): void {
  const lists = snapshot.lists.map((list) => (list.id === listId ? fn(list) : list));
  commit({ ...snapshot, lists }, { sync });
}

function mapTask(listId: string, taskId: string, fn: (task: Task) => Task, touch: boolean): void {
  mapList(
    listId,
    (list) => ({
      ...list,
      updatedAt: touch ? new Date().toISOString() : list.updatedAt,
      tasks: list.tasks.map((task) => (task.id === taskId ? fn(task) : task)),
    }),
    touch,
  );
}

export function replaceSnapshot(next: Snapshot, sync: boolean): void {
  commit(next, { sync });
}

export function setTheme(theme: Theme): void {
  applyTheme(theme);
  commit({ ...snapshot, theme }, { sync: false });
}

export function setActive(listId: string): void {
  if (!snapshot.lists.some((list) => list.id === listId)) return;
  commit({ ...snapshot, activeId: listId }, { sync: false });
}

export function insertList(list: List): void {
  commit({ ...snapshot, lists: [...snapshot.lists, list], activeId: list.id }, { sync: list.shared });
}

export function setLists(lists: List[]): void {
  const next = withDaily(lists.filter((list) => !isDaily(list)));
  const activeId = next.some((list) => list.id === snapshot.activeId)
    ? snapshot.activeId
    : (next.find((list) => !isDaily(list))?.id ?? next[0]?.id ?? null);
  commit({ ...snapshot, lists: next, activeId }, { sync: false });
}

export function renameList(listId: string, name: string, slug: string): void {
  mapList(listId, (list) => ({ ...list, name, slug, updatedAt: new Date().toISOString() }), true);
}

export function removeList(listId: string): void {
  const existing = snapshot.lists.find((list) => list.id === listId);
  const lists = snapshot.lists.filter((list) => list.id !== listId);
  const activeId = snapshot.activeId === listId ? (lists[0]?.id ?? null) : snapshot.activeId;
  commit({ ...snapshot, lists, activeId }, { sync: true });
  if (existing?.shared) onSharedRemove?.(existing.inviteToken);
}

export function markShared(listId: string, inviteToken: string): void {
  mapList(
    listId,
    (list) => ({ ...list, shared: true, inviteToken, updatedAt: new Date().toISOString() }),
    true,
  );
}

export function addTask(listId: string, task: Task): void {
  mapList(
    listId,
    (list) => ({ ...list, updatedAt: new Date().toISOString(), tasks: [...list.tasks, task] }),
    true,
  );
}

export function editTitle(listId: string, taskId: string, title: string): void {
  mapTask(listId, taskId, (task) => ({ ...task, title, calendarPending: task.calendarPending || Boolean(task.due || task.calendarEventId) }), true);
}

export function toggleDone(listId: string, taskId: string, done?: boolean): void {
  mapTask(listId, taskId, (task) => ({ ...task, done: done ?? !task.done }), true);
}

export function setNotesDraft(listId: string, taskId: string, notesDraft: string): void {
  mapTask(listId, taskId, (task) => ({ ...task, notesDraft }), false);
}

export function saveNotes(listId: string, taskId: string, notes?: string): void {
  mapTask(
    listId,
    taskId,
    (task) => {
      const committed = notes ?? task.notesDraft;
      const changed = committed !== task.notes;
      return {
        ...task,
        notes: committed,
        notesDraft: committed,
        calendarPending: task.calendarPending || (changed && Boolean(task.due || task.calendarEventId)),
      };
    },
    true,
  );
}

export function setNotesOpen(listId: string, taskId: string, notesOpen: boolean): void {
  const lists = snapshot.lists.map((list) => ({
    ...list,
    tasks: list.tasks.map((task) => ({
      ...task,
      notesOpen: list.id === listId && task.id === taskId ? notesOpen : false,
    })),
  }));
  commit({ ...snapshot, lists }, { sync: false });
}

export function setEditing(listId: string, taskId: string, editing: boolean): void {
  const lists = snapshot.lists.map((list) => ({
    ...list,
    tasks: list.tasks.map((task) => ({
      ...task,
      editing: list.id === listId && task.id === taskId ? editing : false,
    })),
  }));
  commit({ ...snapshot, lists }, { sync: false });
}

export function setDue(listId: string, taskId: string, due: string | null): void {
  mapTask(
    listId,
    taskId,
    (task) => ({
      ...task,
      due,
      calendarPending: true,
    }),
    true,
  );
}

export function setCalendarResult(listId: string, taskId: string, calendarEventId: string | null, pending: boolean): void {
  mapTask(
    listId,
    taskId,
    (task) => ({ ...task, calendarEventId, calendarPending: pending }),
    true,
  );
}

export function mergeRemote(remote: RemoteList): void {
  const byKey = snapshot.lists.find((list) => list.id === remote.id || list.inviteToken === remote.inviteToken);
  const local = byKey ?? (remote.slug === "daily" ? snapshot.lists.find((list) => isDaily(list)) : undefined);
  const tasks: Task[] = remote.tasks.map((remoteTask) => {
    const previous = local?.tasks.find((task) => task.id === remoteTask.id);
    const notesDirty = previous ? previous.notesDraft !== previous.notes : false;
    return {
      id: remoteTask.id,
      title: remoteTask.title,
      done: remoteTask.done,
      notes: remoteTask.notes,
      notesDraft: notesDirty && previous ? previous.notesDraft : remoteTask.notes,
      due: remoteTask.due,
      calendarEventId: remoteTask.calendarEventId,
      calendarPending: previous?.calendarPending ?? false,
      notesOpen: previous?.notesOpen ?? false,
      editing: previous?.editing ?? false,
    };
  });
  const daily = local ? isDaily(local) : remote.slug === "daily" || remote.id === DAILY_LIST_ID;
  const nextList: List = {
    id: daily ? DAILY_LIST_ID : remote.id,
    slug: daily ? "daily" : remote.slug,
    name: daily ? "Daily" : remote.name,
    inviteToken: remote.inviteToken,
    shared: true,
    updatedAt: remote.updatedAt,
    day: local?.day ?? null,
    system: daily,
    tasks,
  };
  const lists = local
    ? snapshot.lists.map((list) => (list.id === local.id ? nextList : list))
    : [...snapshot.lists, nextList];
  const activeId = snapshot.activeId ?? nextList.id;
  commit({ ...snapshot, lists, activeId }, { sync: false });
}

export function stampSync(sync: SyncState, syncDetail = ""): void {
  if (snapshot.sync === sync && snapshot.syncDetail === syncDetail) return;
  setStatus({ sync, syncDetail });
}

export function stampCalendar(calendar: CalendarState): void {
  if (snapshot.calendar === calendar) return;
  setStatus({ calendar });
}

export function setDailyEnabled(dailyEnabled: boolean): void {
  commit({ ...snapshot, dailyEnabled, dailyError: dailyEnabled ? snapshot.dailyError : "" }, { sync: false });
}

export function setDailyError(dailyError: string): void {
  if (snapshot.dailyError === dailyError) return;
  snapshot = { ...snapshot, dailyError };
  emit();
}

export function dropStaleDaily(today: string): void {
  const daily = snapshot.lists.find((item) => isDaily(item));
  if (!daily?.day || daily.day === today) return;
  const lists = snapshot.lists.map((item) =>
    isDaily(item) ? { ...item, tasks: [], day: today, updatedAt: new Date().toISOString() } : item,
  );
  commit({ ...snapshot, lists }, { sync: daily.shared });
}

export function installDailyTasks(day: string, incoming: Task[]): void {
  const lists = withDaily(snapshot.lists).map((item) => {
    if (!isDaily(item)) return item;
    const same = item.day === day;
    const tasks = incoming.map((task) => {
      const previous = same ? item.tasks.find((row) => row.id === task.id) : undefined;
      if (!previous) return task;
      const notesDirty = previous.notesDraft !== previous.notes;
      return {
        ...task,
        done: previous.done,
        notes: previous.notes,
        notesDraft: notesDirty ? previous.notesDraft : previous.notes,
        notesOpen: previous.notesOpen,
        editing: previous.editing,
      };
    });
    return { ...item, tasks, day, system: true, slug: "daily", name: "Daily", updatedAt: new Date().toISOString() };
  });
  const shared = lists.some((item) => isDaily(item) && item.shared);
  commit({ ...snapshot, lists, dailyError: "" }, { sync: shared });
}
