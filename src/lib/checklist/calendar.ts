/**
 * Google Calendar. One-time browser login, token stored locally.
 *
 * CALENDAR OAUTH — FREE / UNVERIFIED CONSENT
 * The Google Cloud OAuth client stays in Testing until Google verifies the
 * app. calendar.events is a sensitive scope. While Testing, only Google
 * accounts added as Test users on the consent screen can connect.
 *
 * VERIFIED_CONSENT — upgrade path for a public App Store / Play build:
 * 1. Move the consent screen from Testing to In production.
 * 2. Submit verification for https://www.googleapis.com/auth/calendar.events
 *    (privacy policy, homepage, scope justification, demo video).
 * 3. After approval, any Google account can connect. Remove the testing-mode
 *    copy in StatusBar (search: testing mode).
 * 4. Optional: exchange the auth code on a server you control for a refresh
 *    token. This file uses the browser token client on purpose — no client
 *    secret ships in the app. A refresh token needs that server.
 *
 * The same calendar.events token reads today's events for the Daily tab
 * (events.list) and writes due-date events. Testing mode still limits both
 * to the Google accounts you added as test users.
 */

import { getSnapshot, setCalendarResult, stampCalendar } from "./storage";

const TOKEN_KEY = "checklist.google.token";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const SCRIPT = "https://accounts.google.com/gsi/client";

type StoredToken = { accessToken: string; expiresAt: number };

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

type TokenClient = {
  requestAccessToken: (override?: { prompt?: string }) => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

export function clientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
}

export function calendarConfigured(): boolean {
  return clientId().length > 0;
}

function readToken(): StoredToken | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredToken;
    if (!parsed.accessToken || typeof parsed.expiresAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToken(token: StoredToken | null): void {
  if (typeof localStorage === "undefined") return;
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function initCalendar(): void {
  if (!calendarConfigured()) {
    stampCalendar("off");
    return;
  }
  const token = readToken();
  if (!token) {
    stampCalendar("ready");
    return;
  }
  if (token.expiresAt <= Date.now()) {
    stampCalendar("expired");
    return;
  }
  stampCalendar("connected");
  flushCalendarNow();
}

function loadScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google sign-in failed to load")), {
        once: true,
      });
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

export function connectCalendar(): Promise<{ ok: boolean; message: string }> {
  if (!calendarConfigured()) {
    stampCalendar("off");
    return Promise.resolve({
      ok: false,
      message: "Calendar isn’t set up yet. Add a Google OAuth client to connect due dates.",
    });
  }
  return loadScript().then(
    () =>
      new Promise((resolve) => {
        const google = window.google;
        if (!google?.accounts?.oauth2) {
          resolve({ ok: false, message: "Google sign-in didn’t load." });
          return;
        }
        const client = google.accounts.oauth2.initTokenClient({
          client_id: clientId(),
          scope: SCOPE,
          callback: (response) => {
            if (!response.access_token) {
              const refused = response.error === "access_denied" || response.error === "interaction_required";
              resolve({
                ok: false,
                message: refused
                  ? "Google refused the connection. In testing mode only test users you added can connect."
                  : "Calendar connection was cancelled.",
              });
              return;
            }
            writeToken({
              accessToken: response.access_token,
              expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
            });
            stampCalendar("connected");
            flushCalendarNow();
            resolve({ ok: true, message: "Calendar connected on this phone." });
          },
        });
        client.requestAccessToken({ prompt: "consent" });
      }),
    () => ({ ok: false, message: "Google sign-in failed to load." }),
  );
}

function nextDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
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
    stampCalendar("expired");
  }
  return response;
}

let flushing = false;
let flushTimer: number | null = null;

async function runFlush(): Promise<void> {
  if (flushing) return;
  const token = readToken();
  if (!calendarConfigured() || !token || token.expiresAt <= Date.now()) return;
  flushing = true;
  try {
    const lists = getSnapshot().lists;
    for (const list of lists) {
      for (const task of list.tasks) {
        if (!task.calendarPending) continue;
        if (!task.due && task.calendarEventId) {
          const deleted = await googleFetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.calendarEventId)}`,
            token.accessToken,
            { method: "DELETE" },
          );
          if (deleted.status === 401) return;
          if (deleted.ok || deleted.status === 404 || deleted.status === 410) {
            setCalendarResult(list.id, task.id, null, false);
          }
          continue;
        }
        if (!task.due) {
          setCalendarResult(list.id, task.id, null, false);
          continue;
        }
        const body = {
          summary: task.title || "Checklist",
          description: [`Checklist: ${list.name}`, task.notes].filter(Boolean).join("\n\n"),
          start: { date: task.due },
          end: { date: nextDate(task.due) },
        };
        const endpoint = task.calendarEventId
          ? `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(task.calendarEventId)}`
          : "https://www.googleapis.com/calendar/v3/calendars/primary/events";
        const saved = await googleFetch(endpoint, token.accessToken, {
          method: task.calendarEventId ? "PATCH" : "POST",
          body: JSON.stringify(body),
        });
        if (saved.status === 401) return;
        if (!saved.ok) continue;
        const payload = (await saved.json()) as { id?: string };
        if (payload.id) setCalendarResult(list.id, task.id, payload.id, false);
      }
    }
  } catch {
    /* due date stays on the phone; the next flush retries */
  } finally {
    flushing = false;
  }
}

export function flushCalendar(): void {
  if (typeof window === "undefined") {
    void runFlush();
    return;
  }
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void runFlush();
  }, 500);
}

export function flushCalendarNow(): void {
  if (typeof window === "undefined") {
    void runFlush();
    return;
  }
  if (flushTimer) window.clearTimeout(flushTimer);
  flushTimer = null;
  void runFlush();
}

export type TodayEvent = { id: string; title: string };

function localDayBounds(now = new Date()): { day: string; timeMin: string; timeMax: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const month = String(start.getMonth() + 1).padStart(2, "0");
  const date = String(start.getDate()).padStart(2, "0");
  return { day: `${start.getFullYear()}-${month}-${date}`, timeMin: start.toISOString(), timeMax: end.toISOString() };
}

/** Today's primary-calendar events. Failures return a message; they do not throw. */
export async function listTodayEvents(): Promise<
  { ok: true; day: string; events: TodayEvent[] } | { ok: false; day: string; message: string }
> {
  const bounds = localDayBounds();
  if (!calendarConfigured()) {
    return { ok: false, day: bounds.day, message: "Daily needs a Google calendar connection." };
  }
  const token = readToken();
  if (!token || token.expiresAt <= Date.now()) {
    if (token) stampCalendar("expired");
    return { ok: false, day: bounds.day, message: "Reconnect the calendar so Daily can read today." };
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, day: bounds.day, message: "Offline. Daily will try again when you're back." };
  }
  try {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", bounds.timeMin);
    url.searchParams.set("timeMax", bounds.timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "40");
    const response = await googleFetch(url.toString(), token.accessToken);
    if (response.status === 401) {
      return { ok: false, day: bounds.day, message: "Calendar session expired. Reconnect, then Daily can read today." };
    }
    if (!response.ok) {
      return { ok: false, day: bounds.day, message: "Couldn't read today's calendar." };
    }
    const payload = (await response.json()) as { items?: Array<{ id?: string; summary?: string; status?: string }> };
    const events = (payload.items ?? [])
      .filter((item) => item.status !== "cancelled" && typeof item.id === "string")
      .map((item) => ({ id: item.id as string, title: (item.summary || "Busy").slice(0, 200) }));
    return { ok: true, day: bounds.day, events };
  } catch {
    return { ok: false, day: bounds.day, message: "Couldn't read today's calendar." };
  }
}
