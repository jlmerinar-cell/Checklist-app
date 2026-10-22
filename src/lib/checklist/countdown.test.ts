import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dueTone, formatCountdown, tasksCrossingDue } from "./countdown.ts";
import { dueAtFromLocalClock, formatByTime } from "./time.ts";

const now = new Date("2026-10-18T15:00:00.000Z");

describe("formatCountdown", () => {
  it("formats a future due time in hours and minutes", () => {
    const due = new Date(now.getTime() + (60 + 12) * 60_000).toISOString();
    assert.equal(formatCountdown(due, now), "Due in 1h 12m");
  });

  it("formats an overdue task in minutes", () => {
    const due = new Date(now.getTime() - 5 * 60_000).toISOString();
    assert.equal(formatCountdown(due, now), "Overdue 5m");
  });

  it("omits zero units and rounds up partial minutes", () => {
    assert.equal(formatCountdown(new Date(now.getTime() + 2 * 60 * 60_000).toISOString(), now), "Due in 2h");
    assert.equal(formatCountdown(new Date(now.getTime() + 45 * 60_000).toISOString(), now), "Due in 45m");
    assert.equal(formatCountdown(new Date(now.getTime() + 30_000).toISOString(), now), "Due in 1m");
    assert.equal(formatCountdown(new Date(now.getTime() - 1).toISOString(), now), "Overdue 1m");
    assert.equal(formatCountdown(now.toISOString(), now), "Due now");
    const dayAndChange = new Date(now.getTime() + (1_440 + 120 + 3) * 60_000).toISOString();
    assert.equal(formatCountdown(dayAndChange, now), "Due in 1d 2h 3m");
  });

  it("returns nothing when there is no due time", () => {
    assert.equal(formatCountdown(null, now), "");
    assert.equal(formatCountdown("not-a-date", now), "");
  });
});

describe("dueTone", () => {
  const clock = new Date(2026, 9, 20, 18, 0, 0);

  it("marks under an hour as due soon and a passed time as overdue", () => {
    const soon = new Date(clock.getTime() + 30 * 60_000).toISOString();
    const later = new Date(clock.getTime() + 2 * 60 * 60_000).toISOString();
    const overdue = new Date(clock.getTime() - 5 * 60_000).toISOString();
    assert.equal(dueTone(soon, false, clock), "soon");
    assert.equal(dueTone(later, false, clock), "later");
    assert.equal(dueTone(overdue, false, clock), "overdue");
    assert.equal(dueTone(overdue, true, clock), "none");
    assert.equal(dueTone(null, false, clock), "none");
  });

  it("sets a local time today and formats it as by 6:00 PM", () => {
    const due = dueAtFromLocalClock(18, 0, clock);
    assert.equal(new Date(due).getHours(), 18);
    assert.match(formatByTime(due), /^by 6:00\sPM$/);
  });
});

describe("tasksCrossingDue", () => {
  it("alerts only unchecked tasks that became due in the window", () => {
    const start = now.getTime();
    const lists = [
      {
        deletedAt: null,
        tasks: [
          { id: "a", title: "Hydrant map", done: false, deletedAt: null, dueAt: new Date(start + 1000).toISOString() },
          { id: "b", title: "Already done", done: true, deletedAt: null, dueAt: new Date(start + 1000).toISOString() },
          { id: "c", title: "Later", done: false, deletedAt: null, dueAt: new Date(start + 10_000).toISOString() },
        ],
      },
      {
        deletedAt: "2026-10-01T00:00:00.000Z",
        tasks: [{ id: "d", title: "Deleted list", done: false, deletedAt: null, dueAt: new Date(start + 1000).toISOString() }],
      },
    ];
    const hits = tasksCrossingDue(lists, start, start + 5000);
    assert.deepEqual(hits.map((hit) => hit.id), ["a"]);
  });
});
