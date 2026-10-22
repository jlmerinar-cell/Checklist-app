import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayHasShift,
  isAtOrAfterNineEastern,
  isFireList,
  resetShiftList,
  shouldResetShift,
} from "./shift.ts";
import { nineAmEasternIso } from "./time.ts";
import type { List, Task } from "./types.ts";

function task(partial: Partial<Task> & Pick<Task, "id" | "title">): Task {
  return {
    done: false,
    notes: "",
    notesDraft: "",
    notesOpen: false,
    editing: false,
    position: 0,
    columnId: "col-morning",
    dueAt: null,
    leadMinutes: null,
    notificationIds: [],
    calendarEventId: null,
    calendarPending: false,
    doneAt: null,
    onTime: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...partial,
  };
}

function fireList(tasks: Task[], extra: Partial<List> = {}): List {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    slug: "fire-dept",
    name: "Fire department",
    position: 2,
    kind: "fire-dept",
    columns: [],
    theme: null,
    lastShift: null,
    shiftHistory: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    inviteToken: "seed-fire-dept",
    shared: false,
    day: null,
    system: false,
    tasks,
    ...extra,
  };
}

describe("shift day detection", () => {
  it("matches the Goldie event title, ignoring case and extra words", () => {
    const events = [{ title: "Goldie: Fire department" }, { title: "Barbershop" }];
    assert.equal(dayHasShift(events, "Fire department"), true);
    assert.equal(dayHasShift([{ title: "FIRE DEPARTMENT" }], "  fire department "), true);
    assert.equal(dayHasShift([{ title: "Barbershop" }], "Fire department"), false);
    assert.equal(dayHasShift([{ title: "Fire department" }], "   "), false);
    assert.equal(dayHasShift([], "Fire department"), false);
  });

  it("only treats a live fire-department list as the shift list", () => {
    assert.equal(isFireList({ kind: "fire-dept", deletedAt: null }), true);
    assert.equal(isFireList({ kind: "fire-dept", deletedAt: "2026-10-18T13:00:00.000Z" }), false);
    assert.equal(isFireList({ kind: "normal", deletedAt: null }), false);
    assert.equal(isFireList({ kind: "daily", deletedAt: null }), false);
  });
});

describe("9:00 AM Eastern boundary", () => {
  it("starts at 9:00 in both daylight and standard time", () => {
    assert.equal(isAtOrAfterNineEastern(new Date("2026-10-18T12:59:00.000Z")), false);
    assert.equal(isAtOrAfterNineEastern(new Date("2026-10-18T13:00:00.000Z")), true);
    assert.equal(isAtOrAfterNineEastern(new Date("2026-01-15T13:59:00.000Z")), false);
    assert.equal(isAtOrAfterNineEastern(new Date("2026-01-15T14:00:00.000Z")), true);

    const summer = new Date(nineAmEasternIso("2026-10-18"));
    const winter = new Date(nineAmEasternIso("2026-01-15"));
    assert.equal(isAtOrAfterNineEastern(new Date(summer.getTime() - 1)), false);
    assert.equal(isAtOrAfterNineEastern(summer), true);
    assert.equal(isAtOrAfterNineEastern(new Date(winter.getTime() - 1)), false);
    assert.equal(isAtOrAfterNineEastern(winter), true);
  });
});

describe("once per day", () => {
  const afterNine = new Date("2026-10-18T13:30:00.000Z");
  const beforeNine = new Date("2026-10-18T12:30:00.000Z");

  it("resets a shift day after 9 AM until fdLastResetDay is today", () => {
    assert.equal(shouldResetShift({ now: afterNine, fdLastResetDay: null, shiftDay: true }), true);
    assert.equal(shouldResetShift({ now: afterNine, fdLastResetDay: "2026-10-17", shiftDay: true }), true);
    assert.equal(shouldResetShift({ now: afterNine, fdLastResetDay: "2026-10-18", shiftDay: true }), false);
  });

  it("waits until 9 AM and skips days with no shift event", () => {
    assert.equal(shouldResetShift({ now: beforeNine, fdLastResetDay: null, shiftDay: true }), false);
    assert.equal(shouldResetShift({ now: afterNine, fdLastResetDay: null, shiftDay: false }), false);
    assert.equal(shouldResetShift({ now: beforeNine, fdLastResetDay: null, shiftDay: false }), false);
  });
});

describe("resetShiftList", () => {
  it("snapshots the finished shift, then unchecks tasks and keeps the list", () => {
    const when = new Date("2026-10-18T13:30:00.000Z");
    const source = fireList([
      task({
        id: "done",
        title: "Check hydrant map",
        done: true,
        notes: "Quincy Hill",
        notesDraft: "Quincy Hill",
        dueAt: "2026-10-18T13:00:00.000Z",
        doneAt: "2026-10-18T12:00:00.000Z",
        onTime: true,
        notificationIds: [4],
      }),
      task({ id: "open", title: "Engine check", notes: "keep me" }),
      task({
        id: "gone",
        title: "Old item",
        done: true,
        deletedAt: "2026-10-01T00:00:00.000Z",
        onTime: true,
      }),
    ]);
    const next = resetShiftList(source, when);
    assert.equal(next.name, "Fire department");
    assert.equal(next.kind, "fire-dept");
    assert.deepEqual(next.lastShift, { day: "2026-10-18", done: 1, total: 2 });
    assert.equal(next.shiftHistory.length, 1);
    assert.equal(next.shiftHistory[0]?.onTime, 1);
    assert.equal(next.tasks[0]?.done, false);
    assert.equal(next.tasks[0]?.doneAt, null);
    assert.equal(next.tasks[0]?.onTime, null);
    assert.equal(next.tasks[0]?.notes, "Quincy Hill");
    assert.equal(next.tasks[0]?.dueAt, "2026-10-18T13:00:00.000Z");
    assert.deepEqual(next.tasks[0]?.notificationIds, [4]);
    assert.equal(next.tasks[1]?.done, false);
    assert.equal(next.tasks[1]?.notes, "keep me");
    assert.equal(next.tasks[1]?.updatedAt, "2026-01-01T00:00:00.000Z");
    assert.equal(next.tasks[2]?.done, true);
    assert.equal(next.tasks[2]?.deletedAt, "2026-10-01T00:00:00.000Z");

    const again = resetShiftList(next, when);
    assert.equal(again.shiftHistory.filter((entry) => entry.day === "2026-10-18").length, 1);
    assert.equal(again.lastShift?.done, 0);
  });
});
