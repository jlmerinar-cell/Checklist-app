import type { CmdResult } from "./commands.ts";
import { getState, setCalendarLink, setCalendarStatus, snapshot } from "./store.ts";
import { dueAtFromParts, isDateOnly } from "./time.ts";
import { KEY_TOKEN } from "./types.ts";

export const DEFAULT_GOOGLE_CLIENT_ID =
  "84319457158-nr9sm2i9v3l9plrbabbe2okod8c771be.apps.googleusercontent.com";

const SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly";
const SCRIPT = "https://accounts.google.com/gsi/client";

export type GoogleToken = { accessToken: string; expiresAt: number };

export function googleClientId(): string {
  const fromEnv = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  return fromEnv || DEFAULT_GOOGLE_CLIENT_ID;
}

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  if (window.Capacitor?.isNativePlatform?.()) return true;
  if (window.Capacitor) return true;
  return /capacitor/i.test(navigator.userAgent);
}

function readToken(): GoogleToken | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY_TOKEN);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GoogleToken>;
    if (!parsed.accessToken || typeof parsed.expiresAt !== "number") return null;
    return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function writeToken(token: GoogleToken | null): void {
  if (typeof localStorage === "undefined") return;
  if (token) localStorage.setItem(KEY_TOKEN, JSON.stringify(token));
  else localStorage.removeItem(KEY_TOKEN);
}

export function currentToken(): GoogleToken | null {
  const token = readToken();
  if (!token) return null;
  if (token.expiresAt <= Date.now()) return null;
  return token;
}

export function refreshCalendarStatus(): void {
  if (isNativeShell()) {
    setCalendarStatus("native", "Calendar sign-in works in the browser version");
    return;
  }
  const token = readToken();
  if (!token) setCalendarStatus("ready", "");
  else if (token.expiresAt <= Date.now()) setCalendarStatus("expired", "");
  else setCalendarStatus("connected", "");
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google sign-in failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google sign-in failed to load"));
    document.head.appendChild(script);
  });
}

export async function connectCalendar(): Promise<CmdResult> {
  if (isNativeShell()) {
    const message = "Calendar sign-in works in the browser version";
    setCalendarStatus("native", message);
    return { ok: false, message };
  }
  try {
    await loadScript();
  } catch {
    return { ok: false, message: "Google sign-in failed to load." };
  }
  const oauth = window.google?.accounts?.oauth2;
  if (!oauth) return { ok: false, message: "Google sign-in didn’t load." };
  return new Promise((resolve) => {
    oauth
      .initTokenClient({
        client_id: googleClientId(),
        scope: SCOPE,
        callback: (response) => {
          if (response.access_token) {
            writeToken({
              accessToken: response.access_token,
              expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
            });
            setCalendarStatus("connected", "");
            void flushCalendar();
            resolve({ ok: true, message: "Calendar connected on this phone." });
            return;
          }
          const message =
            response.error === "access_denied"
              ? "Only approved test accounts can connect right now."
              : "Calendar connection was cancelled.";
          setCalendarStatus(readToken() ? "expired" : "ready", message);
          resolve({ ok: false, message });
        },
      })
      .requestAccessToken({ prompt: "consent" });
  });
}

async function googleFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (response.status === 401) {
    writeToken(null);
    setCalendarStatus("expired", "");
  }
  return response;
}

let flushing = false;
let flushTimer: number | null = null;

export function scheduleCalendarFlush(): void {
  if (typeof window === "undefined") {
    void flushCalendar();
    return;
  }
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushCalendar();
  }, 500);
}

export async function flushCalendar(): Promise<void> {
  if (flushing) return;
  const token = currentToken();
  if (!token) {
    refreshCalendarStatus();
    return;
  }
  flushing = true;
  try {
    const calendarId = encodeURIComponent(getState().settings.calendarId || "primary");
    for (const list of snapshot().lists) {
      for (const task of list.tasks) {
        if (!task.calendarPending || task.deletedAt) continue;
        if (!task.dueAt && task.calendarEventId) {
          const response = await googleFetch(
            `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(task.calendarEventId)}`,
            token.accessToken,
            { method: "DELETE" },
          );
          if (response.status === 401) return;
          if (response.ok || response.status === 404 || response.status === 410) {
            setCalendarLink(list.id, task.id, null, false);
          }
          continue;
        }
        if (!task.dueAt) {
          setCalendarLink(list.id, task.id, null, false);
          continue;
        }
        const body = {
          summary: task.title || "Checklist",
          description: [`Checklist: ${list.name}`, task.notes].filter(Boolean).join("\n\n"),
          start: { dateTime: task.dueAt },
          end: { dateTime: new Date(Date.parse(task.dueAt) + 30 * 60 * 1000).toISOString() },
        };
        const response = await googleFetch(
          task.calendarEventId
            ? `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(task.calendarEventId)}`
            : `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
          token.accessToken,
          { method: task.calendarEventId ? "PATCH" : "POST", body: JSON.stringify(body) },
        );
        if (response.status === 401) return;
        if (!response.ok) continue;
        const created = (await response.json()) as { id?: string };
        if (created.id) setCalendarLink(list.id, task.id, created.id, false);
      }
    }
  } catch {
    /* stay quiet; the due date is still saved on the phone */
  } finally {
    flushing = false;
  }
}

export async function listCalendars(): Promise<{ id: string; summary: string }[]> {
  const token = currentToken();
  if (!token) return [];
  const response = await googleFetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=50",
    token.accessToken,
  );
  if (!response.ok) return [];
  const body = (await response.json()) as { items?: { id?: string; summary?: string }[] };
  return (body.items ?? [])
    .filter((item) => item.id)
    .map((item) => ({ id: item.id as string, summary: item.summary || item.id || "Calendar" }));
}

function nextCalendarDay(day: string): string | null {
  if (!isDateOnly(day)) return null;
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) return null;
  return new Date(Date.UTC(year, month - 1, date + 1)).toISOString().slice(0, 10);
}

async function readEvents(
  calendarId: string,
  timeMin: string,
  timeMax: string,
  copy: { reconnect: string; offline: string; expired: string; failed: string },
): Promise<{ ok: true; events: { id: string; title: string }[] } | { ok: false; message: string }> {
  const token = currentToken();
  if (!token) return { ok: false, message: copy.reconnect };
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, message: copy.offline };
  try {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "40");
    const response = await googleFetch(url.toString(), token.accessToken);
    if (response.status === 401) return { ok: false, message: copy.expired };
    if (!response.ok) return { ok: false, message: copy.failed };
    const body = (await response.json()) as { items?: { id?: string; summary?: string; status?: string }[] };
    const events = (body.items ?? [])
      .filter((item) => item.status !== "cancelled" && typeof item.id === "string")
      .map((item) => ({ id: item.id as string, title: (item.summary || "Busy").slice(0, 200) }));
    return { ok: true, events };
  } catch {
    return { ok: false, message: copy.failed };
  }
}

const DAILY_COPY = {
  reconnect: "Reconnect the calendar so Daily can read today.",
  offline: "Offline. Daily will try again when you're back.",
  expired: "Calendar session expired. Reconnect, then Daily can read today.",
  failed: "Couldn't read today's calendar.",
};

const SHIFT_COPY = {
  reconnect: "Reconnect the calendar so shift days can be read.",
  offline: "Offline. Shift reset will try again when you're back.",
  expired: "Calendar session expired. Reconnect, then the shift list can start.",
  failed: "Couldn't read the shift calendar.",
};

/** Events on one America/New_York calendar day, including all-day shift events from Goldie. */
export async function eventsForEasternDay(
  calendarId: string,
  day: string,
): Promise<{ ok: true; events: { id: string; title: string }[] } | { ok: false; message: string }> {
  const start = dueAtFromParts(day, "00:00");
  const endDay = nextCalendarDay(day);
  const end = endDay ? dueAtFromParts(endDay, "00:00") : null;
  if (!start || !end) return { ok: false, message: SHIFT_COPY.failed };
  return readEvents(calendarId, start, end, SHIFT_COPY);
}

export async function eventsToday(
  calendarId: string,
): Promise<{ ok: true; events: { id: string; title: string }[] } | { ok: false; message: string }> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return readEvents(calendarId, start.toISOString(), end.toISOString(), DAILY_COPY);
}
