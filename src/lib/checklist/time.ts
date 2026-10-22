const EASTERN = "America/New_York";

export function nowIso(): string {
  return new Date().toISOString();
}

export function easternDay(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** 9:00 AM America/New_York on a calendar date, as an ISO timestamp. */
export function nineAmEasternIso(date: string): string {
  for (const hour of [13, 14, 12, 15]) {
    const stamp = `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`;
    const when = new Date(stamp);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: EASTERN,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(when);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    if (day === date && get("hour") === "09" && get("minute") === "00") return when.toISOString();
  }
  return `${date}T13:00:00.000Z`;
}

export function isDateOnly(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function dueToDueAt(due: unknown): { dueAt: string | null; raw: string | null } {
  if (typeof due !== "string") return { dueAt: null, raw: null };
  const trimmed = due.trim();
  if (!trimmed) return { dueAt: null, raw: null };
  if (isDateOnly(trimmed)) return { dueAt: nineAmEasternIso(trimmed), raw: null };
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) return { dueAt: parsed.toISOString(), raw: null };
  return { dueAt: null, raw: trimmed };
}

export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function formatDue(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The next time this local clock comes up.
 * A bare time that is already past today rolls forward to tomorrow.
 * A time that is exactly now stays today.
 */
export function dueAtFromLocalClock(hours: number, minutes: number, now = new Date()): string {
  const date = new Date(now);
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() < now.getTime()) date.setDate(date.getDate() + 1);
  return date.toISOString();
}

export function clockFromIso(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "by 6:00 PM" in the local clock. */
export function formatByTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const clock = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `by ${clock}`;
}

export function parseClock(value: string): { hours: number; minutes: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/** Combine a date-only day with a clock in America/New_York. */
export function dueAtFromParts(date: string, clock?: string | null): string | null {
  if (!isDateOnly(date)) return null;
  if (!clock) return nineAmEasternIso(date);
  const parsed = parseClock(clock);
  if (!parsed) return null;
  for (let hour = 0; hour < 28; hour += 1) {
    const dayOffset = Math.floor(hour / 24);
    const utcHour = hour % 24;
    const base = new Date(`${date}T00:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() + dayOffset);
    base.setUTCHours(utcHour, parsed.minutes, 0, 0);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: EASTERN,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(base);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    if (day === date && Number(get("hour")) === parsed.hours && Number(get("minute")) === parsed.minutes) {
      return base.toISOString();
    }
  }
  return null;
}
