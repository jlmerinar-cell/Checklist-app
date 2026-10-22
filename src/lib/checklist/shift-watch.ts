import type { CmdResult } from "./commands.ts";
import { eventsForEasternDay } from "./calendar.ts";
import { dayHasShift, isAtOrAfterNineEastern, isFireList } from "./shift.ts";
import { getState, startFireList } from "./store.ts";
import { easternDay } from "./time.ts";

const RETRY_MS = 5 * 60 * 1000;

let lastMissDay = "";
let lastMissAt = 0;
let inflight: Promise<CmdResult> | null = null;

export async function maybeAutoResetShift(now = new Date(), force = false): Promise<CmdResult> {
  if (inflight) return inflight;
  inflight = runAutoReset(now, force).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function runAutoReset(now: Date, force: boolean): Promise<CmdResult> {
  const current = getState();
  if (!current.lists.some((list) => isFireList(list))) {
    return { ok: true, message: "No fire department list to start." };
  }
  const day = easternDay(now);
  if (!isAtOrAfterNineEastern(now)) return { ok: true, message: "Shift reset waits until 9:00 AM Eastern." };
  if (current.settings.fdLastResetDay === day) return { ok: true, message: "Shift list already started today." };
  if (!force && lastMissDay === day && Date.now() - lastMissAt < RETRY_MS) {
    return { ok: true, message: "No shift on the calendar today." };
  }
  const read = await eventsForEasternDay(current.settings.calendarId || "primary", day);
  if (!read.ok) {
    lastMissDay = day;
    lastMissAt = Date.now();
    return { ok: false, message: read.message };
  }
  if (!dayHasShift(read.events, current.settings.shiftMatch || "Fire department")) {
    lastMissDay = day;
    lastMissAt = Date.now();
    return { ok: true, message: "No shift on the calendar today." };
  }
  if (getState().settings.fdLastResetDay === day) return { ok: true, message: "Shift list already started today." };
  return startFireList(now);
}

export function startShiftWatch(): () => void {
  if (typeof window === "undefined") return () => {};
  const tick = (force: boolean) => {
    void maybeAutoResetShift(new Date(), force);
  };
  tick(true);
  const interval = window.setInterval(() => tick(false), 60_000);
  const onFocus = () => tick(true);
  const onVisible = () => {
    if (document.visibilityState === "visible") tick(true);
  };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
