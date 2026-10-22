import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { packTheme } from "./theme.ts";
import { mergeRemote, onData, setSyncStatus, snapshot, type RemoteList, type RemoteSettings, type RemoteTask } from "./store.ts";

type SyncConfig = { url: string; key: string; space: string };

export function syncConfig(): SyncConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
  const space = import.meta.env.VITE_SYNC_SPACE_ID?.trim() ?? "";
  if (!url || !key || !space) return null;
  return { url, key, space };
}

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient | null {
  const config = syncConfig();
  if (!config) return null;
  if (!client) {
    client = createClient(config.url, config.key, {
      global: { headers: { "x-sync-space": config.space } },
    });
  }
  return client;
}

function explain(error: { message?: string; code?: string } | null): string {
  const message = error?.message ?? "";
  if (/schema cache|does not exist|checklist|PGRST|42P01/i.test(message)) {
    return "Supabase is connected but the checklist SQL hasn’t been run yet.";
  }
  return "Couldn’t reach Supabase. Lists stay on this phone.";
}

let pushing = false;
let pushTimer: number | null = null;

async function push(): Promise<void> {
  const db = supabase();
  const config = syncConfig();
  if (!db || !config || pushing) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setSyncStatus("offline", "Changes stay on this phone until you’re back online.");
    return;
  }
  pushing = true;
  setSyncStatus("syncing", "");
  try {
    const data = snapshot();
    const lists = data.lists.map((list) => ({
      id: list.id,
      space_id: config.space,
      name: list.name,
      slug: list.slug,
      kind: list.kind,
      position: list.position,
      columns: list.columns,
      theme: list.theme,
      last_shift: list.lastShift,
      shift_history: list.shiftHistory,
      updated_at: list.updatedAt,
      deleted_at: list.deletedAt,
    }));
    const tasks = data.lists.flatMap((list) =>
      list.tasks.map((task) => ({
        id: task.id,
        space_id: config.space,
        list_id: list.id,
        column_id: task.columnId,
        title: task.title,
        done: task.done,
        notes: task.notes,
        position: task.position,
        due_at: task.dueAt,
        lead_minutes: task.leadMinutes,
        done_at: task.doneAt,
        on_time: task.onTime,
        calendar_event_id: task.calendarEventId,
        updated_at: task.updatedAt,
        deleted_at: task.deletedAt,
      })),
    );
    const settings = {
      space_id: config.space,
      default_theme: packTheme(data.settings),
      calendar_id: data.settings.calendarId,
      shift_match: data.settings.shiftMatch,
      fd_last_reset_day: data.settings.fdLastResetDay,
      updated_at: data.settings.updatedAt,
    };
    const listResult = await db.from("lists").upsert(lists, { onConflict: "id" });
    if (listResult.error) {
      setSyncStatus("reconnecting", explain(listResult.error));
      return;
    }
    if (tasks.length) {
      const taskResult = await db.from("tasks").upsert(tasks, { onConflict: "id" });
      if (taskResult.error) {
        setSyncStatus("reconnecting", explain(taskResult.error));
        return;
      }
    }
    const settingsResult = await db.from("settings").upsert(settings, { onConflict: "space_id" });
    if (settingsResult.error) {
      setSyncStatus("reconnecting", explain(settingsResult.error));
      return;
    }
    setSyncStatus("live", "");
  } catch (error) {
    setSyncStatus("reconnecting", explain(error instanceof Error ? { message: error.message } : null));
  } finally {
    pushing = false;
  }
}

export function scheduleSyncPush(): void {
  if (!syncConfig()) return;
  if (typeof window === "undefined") {
    void push();
    return;
  }
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    void push();
  }, 1000);
}

export async function pull(): Promise<void> {
  const db = supabase();
  const config = syncConfig();
  if (!db || !config) {
    setSyncStatus("local", "");
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setSyncStatus("offline", "Changes stay on this phone until you’re back online.");
    return;
  }
  setSyncStatus("syncing", "");
  try {
    const [listsResult, tasksResult, settingsResult] = await Promise.all([
      db.from("lists").select("*").eq("space_id", config.space),
      db.from("tasks").select("*").eq("space_id", config.space),
      db.from("settings").select("*").eq("space_id", config.space).maybeSingle(),
    ]);
    if (listsResult.error || tasksResult.error || settingsResult.error) {
      setSyncStatus("reconnecting", explain(listsResult.error ?? tasksResult.error ?? settingsResult.error));
      return;
    }
    mergeRemote(
      (listsResult.data ?? []) as RemoteList[],
      (tasksResult.data ?? []) as RemoteTask[],
      (settingsResult.data as RemoteSettings | null) ?? null,
    );
    setSyncStatus("live", "");
  } catch (error) {
    setSyncStatus("reconnecting", explain(error instanceof Error ? { message: error.message } : null));
  }
}

export function startSync(): () => void {
  if (!syncConfig()) {
    setSyncStatus("local", "");
    return () => {};
  }
  const stopData = onData(() => scheduleSyncPush());
  void pull();
  const onOnline = () => {
    setSyncStatus("reconnecting", "");
    void pull();
  };
  const onOffline = () => setSyncStatus("offline", "Changes stay on this phone until you’re back online.");
  const onVisible = () => {
    if (document.visibilityState === "visible") void pull();
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  window.addEventListener("focus", onOnline);
  document.addEventListener("visibilitychange", onVisible);
  const interval = window.setInterval(() => void pull(), 30_000);
  return () => {
    stopData();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("focus", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(interval);
    if (pushTimer) window.clearTimeout(pushTimer);
  };
}
