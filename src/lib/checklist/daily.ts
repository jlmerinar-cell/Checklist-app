import type { CmdResult } from "./commands.ts";
import { eventsToday } from "./calendar.ts";
import { clearDailyDay, columnsOf, getState, setDailyEnabled, setDailyError, setDailyTasks, setMessage } from "./store.ts";
import { nowIso } from "./time.ts";
import type { Task } from "./types.ts";

function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function untilNextMorning(date = new Date()): number {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 5, 0, 0);
  return Math.max(next.getTime() - date.getTime(), 1000);
}

export async function refreshDaily(force: boolean): Promise<CmdResult> {
  const current = getState();
  if (!current.settings.dailyEnabled && !force) return { ok: true, message: "Daily is off." };
  const day = localDay();
  const daily = current.lists.find((list) => list.kind === "daily");
  if (!force && daily?.day === day && !current.dailyError) return { ok: true, message: "Daily is already set for today." };
  clearDailyDay(day);
  const read = await eventsToday(current.settings.calendarId || "primary");
  if (!read.ok) {
    setDailyError(read.message);
    if (force) setMessage(read.message);
    return { ok: false, message: read.message };
  }
  const list = getState().lists.find((item) => item.kind === "daily");
  const columnId = list ? (columnsOf(list)[0]?.id ?? "col-morning") : "col-morning";
  const tasks: Task[] = read.events.map((event, index) => ({
    id: `daily-${event.id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "event"}`,
    title: event.title,
    done: false,
    notes: "",
    notesDraft: "",
    notesOpen: false,
    editing: false,
    position: index,
    columnId,
    dueAt: null,
    leadMinutes: null,
    notificationIds: [],
    calendarEventId: null,
    calendarPending: false,
    doneAt: null,
    onTime: null,
    updatedAt: nowIso(),
    deletedAt: null,
  }));
  setDailyTasks(day, tasks, true);
  setDailyError("");
  const message = tasks.length ? `Daily filled with ${tasks.length} from the calendar.` : "No events on the calendar today.";
  if (force) setMessage(message);
  return { ok: true, message };
}

export function setDaily(enabled: boolean): CmdResult {
  setDailyEnabled(enabled);
  if (enabled) void refreshDaily(true);
  const message = enabled ? "Daily will fill each morning from the calendar." : "Daily is off.";
  setMessage(message);
  return { ok: true, message };
}

export function startDaily(): () => void {
  if (typeof window === "undefined") return () => {};
  const tick = () => {
    void refreshDaily(false);
  };
  tick();
  const interval = window.setInterval(tick, 60_000);
  let midnight = window.setTimeout(function next() {
    void refreshDaily(false);
    midnight = window.setTimeout(next, untilNextMorning());
  }, untilNextMorning());
  const onFocus = () => {
    if (document.visibilityState === "visible") tick();
  };
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", onFocus);
  return () => {
    window.clearInterval(interval);
    window.clearTimeout(midnight);
    window.removeEventListener("focus", tick);
    document.removeEventListener("visibilitychange", onFocus);
  };
}
