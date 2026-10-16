/**
 * POST a calendar event to the owner's Apps Script web app.
 *
 * The Android WebView cannot complete Google OAuth, so this request never
 * opens accounts.google.com. Apps Script creates the event as the owner.
 *
 * CORS: send text/plain and follow redirects. application/json triggers a
 * preflight that Apps Script does not answer. See apps-script/Code.gs.
 */

import { setStatus } from "./storage";
import type { CalendarDraft } from "./calendar-phrase";
import type { ActionResult } from "./types";

export const CALENDAR_HOOK_MISSING =
  "Calendar isn’t set up yet. Add the Apps Script URL and token (VITE_CALENDAR_HOOK_URL and VITE_CALENDAR_HOOK_TOKEN), then rebuild.";

export type CalendarHook = { url: string; token: string };

function readEnv(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Null when either Vite variable is missing. Node tests have no import.meta.env. */
export function readCalendarHook(): CalendarHook | null {
  let url = "";
  let token = "";
  try {
    url = readEnv(import.meta.env.VITE_CALENDAR_HOOK_URL);
    token = readEnv(import.meta.env.VITE_CALENDAR_HOOK_TOKEN);
  } catch {
    return null;
  }
  if (!url || !token) return null;
  return { url, token };
}

function fail(message: string): ActionResult {
  setStatus({ message });
  return { ok: false, message };
}

export async function postCalendarEvent(
  draft: CalendarDraft,
  hook?: CalendarHook | null,
): Promise<ActionResult> {
  const target = hook === undefined ? readCalendarHook() : hook;
  if (!target) return fail(CALENDAR_HOOK_MISSING);

  setStatus({ message: `Adding “${draft.title}” to Google Calendar…` });
  try {
    const response = await fetch(target.url, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        token: target.token,
        title: draft.title,
        start: draft.start.toISOString(),
        end: draft.end.toISOString(),
      }),
      signal:
        typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
          ? AbortSignal.timeout(12000)
          : undefined,
    });
    const text = await response.text();
    let payload: { ok?: boolean; message?: string; eventId?: string } | null = null;
    try {
      payload = JSON.parse(text) as { ok?: boolean; message?: string; eventId?: string };
    } catch {
      payload = null;
    }
    if (!payload || typeof payload.ok !== "boolean") {
      return fail("Calendar didn’t answer. Check the Apps Script web app.");
    }
    const message =
      (typeof payload.message === "string" && payload.message.trim()) ||
      (payload.ok
        ? `Added “${draft.title}” to Google Calendar.`
        : "Calendar didn’t save that event.");
    setStatus({ message });
    return { ok: payload.ok, message };
  } catch {
    return fail("Couldn’t reach Google Calendar. Check the connection and try again.");
  }
}
