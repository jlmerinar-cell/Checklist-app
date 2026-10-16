/**
 * Natural-language calendar phrases for the Command box.
 * chrono-node runs on the phone. No network, no paid API.
 *
 * "add dentist appointment Friday 2pm" → title + a one-hour slot.
 * Checklist commands such as "checklist add <list> <task>" are decided in
 * exec() before this result is used.
 */

import { parse, type ParsedResult } from "chrono-node";

const HOUR_MS = 60 * 60 * 1000;
const LEAD = /^(?:checklist\s+)?(add|schedule|calendar)\b\s*([\s\S]*)$/i;

export type CalendarDraft = {
  title: string;
  start: Date;
  end: Date;
};

export type CalendarPhrase =
  ({ ok: true } & CalendarDraft) | { ok: false; reason: "not-calendar" | "no-time" | "no-title" };

type Span = { index: number; length: number };

export function parseCalendarPhrase(input: string, now = new Date()): CalendarPhrase {
  const trimmed = input.trim().replace(/\s+/g, " ");
  const lead = trimmed.match(LEAD);
  if (!lead) return { ok: false, reason: "not-calendar" };

  const rest = lead[2].trim();
  if (!rest) return { ok: false, reason: "no-time" };

  const results = parse(rest, now, { forwardDate: true });
  const chosen = choose(results, now);
  if (!chosen) return { ok: false, reason: "no-time" };

  const title = tidy(removeSpans(rest, chosen.spans)).slice(0, 200).trim();
  if (!title) return { ok: false, reason: "no-title" };
  return { ok: true, title, start: chosen.start, end: chosen.end };
}

function choose(
  results: ParsedResult[],
  now: Date,
): { start: Date; end: Date; spans: Span[] } | null {
  const timedAndDated = results.find(
    (result) =>
      result.start.isCertain("hour") &&
      (result.start.isCertain("day") || result.start.isCertain("weekday")),
  );
  if (timedAndDated) {
    const start = timedAndDated.start.date();
    return {
      start,
      end: explicitEnd(timedAndDated, start),
      spans: [{ index: timedAndDated.index, length: timedAndDated.text.length }],
    };
  }

  const timed = results.find((result) => result.start.isCertain("hour"));
  const dated = results.find(
    (result) =>
      result !== timed &&
      !result.start.isCertain("hour") &&
      (result.start.isCertain("day") || result.start.isCertain("weekday")),
  );
  if (timed && dated) {
    const day = dated.start.date();
    const clock = timed.start.date();
    const start = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      clock.getHours(),
      clock.getMinutes(),
      0,
      0,
    );
    if (start.getTime() <= now.getTime()) start.setDate(start.getDate() + 7);
    return {
      start,
      end: new Date(start.getTime() + HOUR_MS),
      spans: [
        { index: timed.index, length: timed.text.length },
        { index: dated.index, length: dated.text.length },
      ],
    };
  }

  if (timed) {
    const start = timed.start.date();
    return {
      start,
      end: explicitEnd(timed, start),
      spans: [{ index: timed.index, length: timed.text.length }],
    };
  }
  return null;
}

/** Use a parsed range when the phrase has one. Otherwise the slot is one hour. */
function explicitEnd(result: ParsedResult, start: Date): Date {
  if (result.end) {
    const end = result.end.date();
    if (end.getTime() > start.getTime()) return end;
  }
  return new Date(start.getTime() + HOUR_MS);
}

function removeSpans(text: string, spans: Span[]): string {
  const chars = Array.from(text);
  for (const span of spans) {
    const end = Math.min(chars.length, span.index + span.length);
    for (let i = Math.max(0, span.index); i < end; i += 1) chars[i] = " ";
  }
  return chars.join("");
}

function tidy(text: string): string {
  return text
    .replace(/[@#|]+/g, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:on|at|around|by|from|to)\b[\s,:-]*/i, "")
    .replace(/[\s,:-]*\b(?:on|at|around|by|from|to)$/i, "")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
