import { stampScore } from "./migrate.ts";
import { easternDay } from "./time.ts";
import type { List, Task } from "./types.ts";

const EASTERN = "America/New_York";

/** Goldie titles the shift event with settings.shiftMatch, default "Fire department". */
export function matchesShiftTitle(title: string, shiftMatch: string): boolean {
  const needle = shiftMatch.trim().toLowerCase();
  if (!needle) return false;
  return title.trim().toLowerCase().includes(needle);
}

export function dayHasShift(events: { title: string }[], shiftMatch: string): boolean {
  return events.some((event) => matchesShiftTitle(event.title, shiftMatch));
}

export function isFireList(list: { kind: string; deletedAt: string | null }): boolean {
  return list.kind === "fire-dept" && !list.deletedAt;
}

/** True from 9:00 AM America/New_York onward. 8:59 is still the previous shift. */
export function isAtOrAfterNineEastern(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const hour = read("hour");
  const minute = read("minute");
  return hour > 9 || (hour === 9 && minute >= 0);
}

/**
 * Automatic reset runs only on a shift day, at or after 9:00 AM Eastern,
 * and at most once per Eastern calendar day.
 */
export function shouldResetShift(input: { now: Date; fdLastResetDay: string | null; shiftDay: boolean }): boolean {
  if (!input.shiftDay) return false;
  if (!isAtOrAfterNineEastern(input.now)) return false;
  return input.fdLastResetDay !== easternDay(input.now);
}

function clearChecked(task: Task, stamp: string): Task {
  if (task.deletedAt || !task.done) return task;
  return { ...task, done: false, doneAt: null, onTime: null, updatedAt: stamp };
}

/** Snapshot the list into lastShift / shiftHistory, then uncheck its tasks. */
export function resetShiftList(list: List, when = new Date()): List {
  const stamped = stampScore(list, when);
  const stamp = when.toISOString();
  return {
    ...stamped,
    updatedAt: stamp,
    tasks: stamped.tasks.map((task) => clearChecked(task, stamp)),
  };
}
