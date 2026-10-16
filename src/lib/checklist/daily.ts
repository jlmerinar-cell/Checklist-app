/**
 * Morning Daily tab. Reads today's primary-calendar events with the same
 * Google token calendar.ts stores, then replaces that list's rows.
 * Yesterday's rows are dropped as soon as the local date changes.
 * A failed read sets dailyError and does not throw.
 */

import { listTodayEvents } from "./calendar";
import * as db from "./storage";
import type { ActionResult, Task } from "./types";

export function localDayKey(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function msUntilNextMorning(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0, 0);
  return Math.max(next.getTime() - now.getTime(), 1000);
}

function taskFromEvent(id: string, title: string): Task {
  const safe = id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "event";
  return {
    id: `daily-${safe}`,
    title,
    done: false,
    notes: "",
    notesDraft: "",
    due: null,
    calendarEventId: null,
    calendarPending: false,
    notesOpen: false,
    editing: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function runDaily(force: boolean): Promise<ActionResult> {
  const snap = db.getSnapshot();
  if (!snap.dailyEnabled && !force) {
    return { ok: true, message: "Daily is off." };
  }
  const today = localDayKey();
  const daily = snap.lists.find((list) => db.isDaily(list));
  if (!force && daily?.day === today && !snap.dailyError) {
    return { ok: true, message: "Daily is already set for today." };
  }
  db.dropStaleDaily(today);
  const result = await listTodayEvents();
  if (!result.ok) {
    db.setDailyError(result.message);
    if (force) db.setStatus({ message: result.message });
    return { ok: false, message: result.message };
  }
  db.installDailyTasks(
    result.day,
    result.events.map((event) => taskFromEvent(event.id, event.title)),
  );
  const message = result.events.length
    ? `Daily filled with ${result.events.length} from the calendar.`
    : "No events on the calendar today.";
  if (force) db.setStatus({ message });
  return { ok: true, message };
}

export function startDaily(): () => void {
  if (typeof window === "undefined") return () => {};
  const tick = () => {
    void runDaily(false);
  };
  tick();
  const interval = window.setInterval(tick, 60_000);
  let midnight = window.setTimeout(function fire() {
    void runDaily(false);
    midnight = window.setTimeout(fire, msUntilNextMorning());
  }, msUntilNextMorning());
  const onVisible = () => {
    if (document.visibilityState === "visible") tick();
  };
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(interval);
    window.clearTimeout(midnight);
    window.removeEventListener("focus", tick);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
