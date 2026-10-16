import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { exec } from "./commands.ts";
import { CALENDAR_HOOK_MISSING, postCalendarEvent } from "./calendar-hook.ts";
import { parseCalendarPhrase } from "./calendar-phrase.ts";
import { getSnapshot } from "./storage.ts";

const HOUR = 60 * 60 * 1000;
const WEDNESDAY = new Date(2026, 9, 14, 10, 0, 0);
const FRIDAY_MORNING = new Date(2026, 9, 16, 9, 0, 0);

function assertWall(
  actual: Date,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
) {
  assert.equal(actual.getFullYear(), year);
  assert.equal(actual.getMonth(), month - 1);
  assert.equal(actual.getDate(), day);
  assert.equal(actual.getHours(), hour);
  assert.equal(actual.getMinutes(), minute);
}

describe("parseCalendarPhrase", () => {
  it("reads add dentist appointment Friday 2pm as a one-hour Friday event", () => {
    const parsed = parseCalendarPhrase("add dentist appointment Friday 2pm", WEDNESDAY);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.title, "dentist appointment");
    assertWall(parsed.start, 2026, 10, 16, 14);
    assert.equal(parsed.end.getTime() - parsed.start.getTime(), HOUR);
  });

  it("keeps Friday 2pm on the same Friday when that time is still ahead", () => {
    const parsed = parseCalendarPhrase("add dentist appointment Friday 2pm", FRIDAY_MORNING);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.title, "dentist appointment");
    assertWall(parsed.start, 2026, 10, 16, 14);
  });

  it("reads schedule tomorrow 9am as the next morning", () => {
    const parsed = parseCalendarPhrase("schedule tomorrow 9am standup", FRIDAY_MORNING);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.title, "standup");
    assertWall(parsed.start, 2026, 10, 17, 9);
    assert.equal(parsed.end.getTime() - parsed.start.getTime(), HOUR);
  });

  it("accepts a checklist prefix and the calendar verb", () => {
    const scheduled = parseCalendarPhrase("checklist schedule tomorrow 9am dentist", WEDNESDAY);
    assert.equal(scheduled.ok, true);
    if (!scheduled.ok) return;
    assert.equal(scheduled.title, "dentist");
    assertWall(scheduled.start, 2026, 10, 15, 9);

    const named = parseCalendarPhrase("calendar lunch Friday 12pm", WEDNESDAY);
    assert.equal(named.ok, true);
    if (!named.ok) return;
    assert.equal(named.title, "lunch");
    assertWall(named.start, 2026, 10, 16, 12);
  });

  it("ignores capitalization and filler words around the time", () => {
    const parsed = parseCalendarPhrase("ADD Dentist Appointment on FRIDAY at 2PM", WEDNESDAY);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.title, "Dentist Appointment");
    assertWall(parsed.start, 2026, 10, 16, 14);
  });

  it("uses an explicit end when the phrase has a range", () => {
    const parsed = parseCalendarPhrase("schedule dentist Friday 2pm to 4pm", WEDNESDAY);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.title, "dentist");
    assertWall(parsed.start, 2026, 10, 16, 14);
    assertWall(parsed.end, 2026, 10, 16, 16);
  });

  it("joins a separated weekday and clock time", () => {
    const parsed = parseCalendarPhrase("add Friday dentist 2pm", WEDNESDAY);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.title, "dentist");
    assertWall(parsed.start, 2026, 10, 16, 14);
    assert.equal(parsed.end.getTime() - parsed.start.getTime(), HOUR);
  });

  it("does not treat checklist commands or dateless lines as events", () => {
    assert.deepEqual(parseCalendarPhrase("checklist add fire-dept check hydrant map", WEDNESDAY), {
      ok: false,
      reason: "no-time",
    });
    assert.deepEqual(parseCalendarPhrase("checklist check personal EMT", WEDNESDAY), {
      ok: false,
      reason: "not-calendar",
    });
    assert.deepEqual(parseCalendarPhrase("add dentist Friday", WEDNESDAY), {
      ok: false,
      reason: "no-time",
    });
    assert.deepEqual(parseCalendarPhrase("schedule Friday 2pm", WEDNESDAY), {
      ok: false,
      reason: "no-title",
    });
  });
});

describe("exec calendar routing", () => {
  it("still adds a checklist task for checklist add, even when a time is in the title", async () => {
    const before = getSnapshot().lists.find((list) => list.slug === "personal");
    const result = await exec("checklist add personal dentist Friday 2pm");
    assert.equal(result.ok, true);
    assert.match(result.message, /Added “dentist Friday 2pm” to Personal/);
    const after = getSnapshot().lists.find((list) => list.slug === "personal");
    assert.equal(after && before ? after.tasks.length : 0, (before?.tasks.length ?? 0) + 1);
  });

  it("still adds checklist add fire-dept tasks", async () => {
    const result = await exec("checklist add fire-dept oil the ladder");
    assert.equal(result.ok, true);
    assert.match(result.message, /Added “oil the ladder” to Fire department/);
  });

  it("shows the missing-hook message for a calendar phrase and does not add a task", async () => {
    const before = getSnapshot().lists.map((list) => list.tasks.length);
    const result = await exec("add dentist appointment Friday 2pm");
    assert.equal(result.ok, false);
    assert.equal(result.message, CALENDAR_HOOK_MISSING);
    assert.equal(getSnapshot().message, CALENDAR_HOOK_MISSING);
    const after = getSnapshot().lists.map((list) => list.tasks.length);
    assert.deepEqual(after, before);
  });

  it("asks for a time when schedule has no clock time", async () => {
    const result = await exec("schedule dentist");
    assert.equal(result.ok, false);
    assert.match(result.message, /Add a time/);
  });

  it("leaves unknown commands alone", async () => {
    const result = await exec("flip the ladder");
    assert.equal(result.ok, false);
    assert.match(result.message, /Unknown command/);
  });
});

describe("postCalendarEvent", () => {
  it("posts text/plain JSON and follows redirects", async () => {
    const original = globalThis.fetch;
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(
        JSON.stringify({
          ok: true,
          message: 'Added "Dentist" to Google Calendar.',
          eventId: "evt-1",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch;
    try {
      const start = new Date("2026-10-16T18:00:00.000Z");
      const end = new Date("2026-10-16T19:00:00.000Z");
      const result = await postCalendarEvent(
        { title: "Dentist", start, end },
        { url: "https://script.google.com/macros/s/TEST/exec", token: "secret" },
      );
      assert.equal(result.ok, true);
      assert.match(result.message, /Dentist/);
      assert.equal(getSnapshot().message, result.message);
      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.url, "https://script.google.com/macros/s/TEST/exec");
      assert.equal(calls[0]?.init.method, "POST");
      assert.equal(calls[0]?.init.redirect, "follow");
      const headers = new Headers(calls[0]?.init.headers);
      assert.match(headers.get("content-type") ?? "", /^text\/plain/i);
      const body = JSON.parse(String(calls[0]?.init.body));
      assert.deepEqual(body, {
        token: "secret",
        title: "Dentist",
        start: "2026-10-16T18:00:00.000Z",
        end: "2026-10-16T19:00:00.000Z",
      });
    } finally {
      globalThis.fetch = original;
    }
  });

  it("shows the script error and a network failure on the status line", async () => {
    const original = globalThis.fetch;
    const hook = { url: "https://script.google.com/macros/s/TEST/exec", token: "secret" };
    const draft = {
      title: "Dentist",
      start: new Date("2026-10-16T18:00:00.000Z"),
      end: new Date("2026-10-16T19:00:00.000Z"),
    };
    try {
      globalThis.fetch = (async () =>
        new Response(
          JSON.stringify({
            ok: false,
            message: "The calendar token does not match CAL_TOKEN.",
            eventId: "",
          }),
          {
            status: 200,
          },
        )) as typeof fetch;
      const refused = await postCalendarEvent(draft, hook);
      assert.equal(refused.ok, false);
      assert.equal(refused.message, "The calendar token does not match CAL_TOKEN.");
      assert.equal(getSnapshot().message, refused.message);

      globalThis.fetch = (async () => {
        throw new Error("offline");
      }) as typeof fetch;
      const offline = await postCalendarEvent(draft, hook);
      assert.equal(offline.ok, false);
      assert.match(offline.message, /Couldn’t reach Google Calendar/);
      assert.equal(getSnapshot().message, offline.message);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("explains a missing hook without calling the network", async () => {
    let called = false;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("should not fetch");
    }) as typeof fetch;
    try {
      const result = await postCalendarEvent(
        {
          title: "Dentist",
          start: new Date("2026-10-16T18:00:00.000Z"),
          end: new Date("2026-10-16T19:00:00.000Z"),
        },
        null,
      );
      assert.equal(called, false);
      assert.equal(result.ok, false);
      assert.equal(result.message, CALENDAR_HOOK_MISSING);
    } finally {
      globalThis.fetch = original;
    }
  });
});
