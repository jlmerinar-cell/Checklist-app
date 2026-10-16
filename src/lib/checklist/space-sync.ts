/**
 * Owner sync. Every list, task, and saved note in one Supabase space.
 * Invite sharing (sharing.ts) is separate and still only sends one list.
 *
 * Config is three public env vars. If any of the URL, anon key, or space id
 * is missing, this module does nothing and the phone stays on local storage.
 *
 * The space id is sent as the x-sync-space header. Row level security only
 * returns rows for that id. Both secrets are compiled into the app.
 */

import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import {
  keepSystemLists,
  mergeOwnerState,
  type OwnerList,
  type OwnerState,
  type OwnerTask,
  type OwnerTombstone,
  type RemoteOwnerList,
  type RemoteOwnerTask,
} from "./space-sync-merge";
import { holdIdleSyncStatus, supabaseConfigured, supabaseKey, supabaseUrl } from "./sharing";
import {
  addSyncNotifier,
  getSnapshot,
  getTombstones,
  replaceOwnerData,
  stampSync,
} from "./storage";
import type { List, Task } from "./types";

const PUSH_DELAY_MS = 800;
const POLL_MS = 30_000;
const REALTIME_DELAY_MS = 400;

export function syncSpaceId(): string {
  return import.meta.env.VITE_SYNC_SPACE_ID?.trim() ?? "";
}

export function spaceSyncConfigured(): boolean {
  return supabaseConfigured() && syncSpaceId().length > 0;
}

type ListRow = {
  id?: unknown;
  slug?: unknown;
  name?: unknown;
  invite_token?: unknown;
  shared?: unknown;
  day?: unknown;
  system?: unknown;
  updated_at?: unknown;
  deleted_at?: unknown;
};

type TaskRow = {
  id?: unknown;
  list_id?: unknown;
  title?: unknown;
  done?: unknown;
  notes?: unknown;
  due?: unknown;
  calendar_event_id?: unknown;
  updated_at?: unknown;
  deleted_at?: unknown;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function asRemoteList(value: unknown): RemoteOwnerList | null {
  if (!value || typeof value !== "object") return null;
  const row = value as ListRow;
  const id = text(row.id);
  const updatedAt = text(row.updated_at);
  if (!id || !updatedAt) return null;
  const day = text(row.day);
  return {
    id,
    slug: text(row.slug) ?? id,
    name: text(row.name) ?? "List",
    inviteToken: text(row.invite_token) ?? id,
    shared: row.shared === true,
    day: day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null,
    system: row.system === true,
    updatedAt,
    deletedAt: text(row.deleted_at),
  };
}

function asRemoteTask(value: unknown): RemoteOwnerTask | null {
  if (!value || typeof value !== "object") return null;
  const row = value as TaskRow;
  const id = text(row.id);
  const listId = text(row.list_id);
  const updatedAt = text(row.updated_at);
  if (!id || !listId || !updatedAt) return null;
  return {
    id,
    listId,
    title: typeof row.title === "string" ? row.title : "",
    done: row.done === true,
    notes: typeof row.notes === "string" ? row.notes : "",
    due: text(row.due),
    calendarEventId: text(row.calendar_event_id),
    updatedAt,
    deletedAt: text(row.deleted_at),
  };
}

function parseRows<T>(body: unknown, parse: (row: unknown) => T | null): T[] {
  if (!Array.isArray(body)) throw new Error("Supabase returned an unexpected payload.");
  const parsed: T[] = [];
  for (const row of body) {
    const item = parse(row);
    if (item) parsed.push(item);
  }
  if (body.length > 0 && parsed.length === 0)
    throw new Error("Supabase returned an unexpected payload.");
  return parsed;
}

async function rest(
  path: string,
  init?: { method?: string; body?: string; prefer?: string },
): Promise<unknown> {
  const headers: Record<string, string> = {
    apikey: supabaseKey(),
    Authorization: `Bearer ${supabaseKey()}`,
    "Content-Type": "application/json",
    "x-sync-space": syncSpaceId(),
  };
  if (init?.prefer) headers.Prefer = init.prefer;
  const response = await fetch(`${supabaseUrl()}/rest/v1/${path}`, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body,
    signal: AbortSignal.timeout(8000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(raw.slice(0, 180) || `Supabase ${response.status}`);
  return raw ? (JSON.parse(raw) as unknown) : null;
}

function spaceQuery(): string {
  return `space_id=eq.${encodeURIComponent(syncSpaceId())}&limit=10000`;
}

function localState(lists: List[], tombstones: OwnerTombstone[]): OwnerState {
  const ownerLists: OwnerList[] = lists.map((list) => ({
    id: list.id,
    slug: list.slug,
    name: list.name,
    inviteToken: list.inviteToken,
    shared: list.shared,
    day: list.day,
    system: list.system,
    updatedAt: list.updatedAt,
  }));
  const tasks: OwnerTask[] = lists.flatMap((list) =>
    list.tasks.map((task) => ({
      id: task.id,
      listId: list.id,
      title: task.title,
      done: task.done,
      notes: task.notes,
      notesDraft: task.notesDraft,
      due: task.due,
      calendarEventId: task.calendarEventId,
      updatedAt: task.updatedAt,
    })),
  );
  return { lists: ownerLists, tasks, tombstones };
}

function toTask(previous: Task | undefined, row: OwnerTask): Task {
  return {
    id: row.id,
    title: row.title,
    done: row.done,
    notes: row.notes,
    notesDraft: row.notesDraft,
    due: row.due,
    calendarEventId: row.calendarEventId,
    calendarPending:
      previous?.updatedAt === row.updatedAt ? (previous.calendarPending ?? false) : false,
    notesOpen: previous?.notesOpen ?? false,
    editing: previous?.editing ?? false,
    updatedAt: row.updatedAt,
  };
}

function projectLists(previous: List[], merged: OwnerState): List[] {
  const previousById = new Map(previous.map((list) => [list.id, list]));
  return merged.lists.map((row) => {
    const prior = previousById.get(row.id);
    const priorTasks = prior?.tasks ?? [];
    const rows = merged.tasks.filter((task) => task.listId === row.id);
    const byId = new Map(rows.map((task) => [task.id, task]));
    const tasks: Task[] = [];
    for (const task of priorTasks) {
      const next = byId.get(task.id);
      if (!next) continue;
      tasks.push(toTask(task, next));
      byId.delete(task.id);
    }
    for (const next of byId.values()) tasks.push(toTask(undefined, next));
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      inviteToken: row.inviteToken,
      shared: row.shared,
      updatedAt: row.updatedAt,
      day: row.day,
      system: row.system || prior?.system === true,
      tasks,
    };
  });
}

function applyRemote(remoteLists: RemoteOwnerList[], remoteTasks: RemoteOwnerTask[]): void {
  const snap = getSnapshot();
  const local = localState(snap.lists, getTombstones());
  const merged = keepSystemLists(
    local.lists,
    mergeOwnerState(local, { lists: remoteLists, tasks: remoteTasks }),
  );
  replaceOwnerData(projectLists(snap.lists, merged), merged.tombstones);
}

function listPayload(state: OwnerState, space: string): Record<string, unknown>[] {
  const live = state.lists.map((list) => ({
    space_id: space,
    id: list.id,
    slug: list.slug,
    name: list.name,
    invite_token: list.inviteToken,
    shared: list.shared,
    day: list.day,
    system: list.system,
    updated_at: list.updatedAt,
    deleted_at: null,
  }));
  const liveIds = new Set(state.lists.map((list) => list.id));
  const dead = state.tombstones
    .filter((tomb) => tomb.kind === "list" && !liveIds.has(tomb.id))
    .map((tomb) => ({
      space_id: space,
      id: tomb.id,
      slug: "deleted",
      name: "Deleted",
      invite_token: tomb.id,
      shared: false,
      day: null,
      system: false,
      updated_at: tomb.updatedAt,
      deleted_at: tomb.updatedAt,
    }));
  return [...live, ...dead];
}

function taskPayload(state: OwnerState, space: string): Record<string, unknown>[] {
  const live = state.tasks.map((task) => ({
    space_id: space,
    id: task.id,
    list_id: task.listId,
    title: task.title,
    done: task.done,
    notes: task.notes,
    due: task.due,
    calendar_event_id: task.calendarEventId,
    updated_at: task.updatedAt,
    deleted_at: null,
  }));
  const liveIds = new Set(state.tasks.map((task) => task.id));
  const dead = state.tombstones
    .filter((tomb) => tomb.kind === "task" && tomb.listId && !liveIds.has(tomb.id))
    .map((tomb) => ({
      space_id: space,
      id: tomb.id,
      list_id: tomb.listId,
      title: "",
      done: false,
      notes: "",
      due: null,
      calendar_event_id: null,
      updated_at: tomb.updatedAt,
      deleted_at: tomb.updatedAt,
    }));
  return [...live, ...dead];
}

async function pullRemote(): Promise<{ lists: RemoteOwnerList[]; tasks: RemoteOwnerTask[] }> {
  const query = spaceQuery();
  const [listsBody, tasksBody] = await Promise.all([
    rest(
      `sync_lists?select=id,slug,name,invite_token,shared,day,system,updated_at,deleted_at&${query}`,
    ),
    rest(
      `sync_tasks?select=id,list_id,title,done,notes,due,calendar_event_id,updated_at,deleted_at&${query}`,
    ),
  ]);
  return {
    lists: parseRows(listsBody, asRemoteList),
    tasks: parseRows(tasksBody, asRemoteTask),
  };
}

async function pushLocal(): Promise<void> {
  const snap = getSnapshot();
  const state = localState(snap.lists, getTombstones());
  const space = syncSpaceId();
  const prefer = "resolution=merge-duplicates,return=minimal";
  const lists = listPayload(state, space);
  const tasks = taskPayload(state, space);
  if (lists.length) {
    await rest("sync_lists?on_conflict=space_id,id", {
      method: "POST",
      prefer,
      body: JSON.stringify(lists),
    });
  }
  if (tasks.length) {
    await rest("sync_tasks?on_conflict=space_id,id", {
      method: "POST",
      prefer,
      body: JSON.stringify(tasks),
    });
  }
}

function failMessage(error: unknown): string {
  const detail = error instanceof Error ? error.message : "";
  const missingTable =
    detail.includes("sync_lists") ||
    detail.includes("sync_tasks") ||
    detail.includes("schema cache") ||
    detail.includes("PGRST205");
  if (missingTable) return "Supabase is connected but the owner-sync SQL hasn’t been run yet.";
  return "Couldn’t reach Supabase. Lists stay on this phone.";
}

let running = false;
let again = false;
let debounceTimer = 0;
let pollTimer = 0;
let client: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;

async function reconcile(quiet: boolean): Promise<void> {
  if (!spaceSyncConfigured()) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    stampSync("offline", "Changes stay on this phone until you’re back online.");
    return;
  }
  if (running) {
    again = true;
    return;
  }
  running = true;
  if (!quiet) stampSync("syncing", "");
  try {
    const remote = await pullRemote();
    applyRemote(remote.lists, remote.tasks);
    await pushLocal();
    stampSync("live", "");
  } catch (error) {
    stampSync("reconnecting", failMessage(error));
  } finally {
    running = false;
    if (again) {
      again = false;
      void reconcile(true);
    }
  }
}

function schedule(delay: number): void {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    void reconcile(true);
  }, delay);
}

function listen(): void {
  if (channel) return;
  const space = syncSpaceId();
  client = createClient(supabaseUrl(), supabaseKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  channel = client
    .channel(`sync:${space}`, { config: { private: false, broadcast: { self: false } } })
    .on("broadcast", { event: "changed" }, () => {
      schedule(REALTIME_DELAY_MS);
    })
    .subscribe();
}

export function startSpaceSync(): () => void {
  if (typeof window === "undefined" || !spaceSyncConfigured()) return () => {};
  holdIdleSyncStatus(true);
  void reconcile(false);
  listen();
  const stopNotify = addSyncNotifier(() => schedule(PUSH_DELAY_MS));
  // Realtime is the fast path. The poll still runs so a missed broadcast lands.
  pollTimer = window.setInterval(() => {
    void reconcile(true);
  }, POLL_MS);
  const onOnline = () => {
    void reconcile(false);
  };
  const onOffline = () =>
    stampSync("offline", "Changes stay on this phone until you’re back online.");
  const onFocus = () => {
    void reconcile(true);
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void reconcile(true);
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    holdIdleSyncStatus(false);
    stopNotify();
    window.clearInterval(pollTimer);
    window.clearTimeout(debounceTimer);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
    if (client && channel) void client.removeChannel(channel);
    client = null;
    channel = null;
  };
}
