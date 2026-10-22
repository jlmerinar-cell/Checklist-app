import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyReminders, EXACT_ALARM_HINT, planReminders, type ReminderPlugin, type ReminderTask } from "./notify.ts";

const now = new Date(2026, 9, 20, 12, 0, 0);
const due = new Date(2026, 9, 20, 18, 0, 0);

function task(patch: Partial<ReminderTask> = {}): ReminderTask {
  return {
    key: "list:milk",
    title: "Milk",
    dueAt: due.toISOString(),
    done: false,
    deleted: false,
    notificationIds: [],
    ...patch,
  };
}

function mockPlugin(exact: string | null = "granted"): ReminderPlugin & {
  scheduled: { id: number; body: string; at: string }[];
  cancelled: number[];
} {
  const scheduled: { id: number; body: string; at: string }[] = [];
  const cancelled: number[] = [];
  return {
    scheduled,
    cancelled,
    schedule: async ({ notifications }) => {
      for (const note of notifications) {
        scheduled.push({ id: note.id, body: note.body, at: note.schedule.at.toISOString() });
      }
    },
    cancel: async ({ notifications }) => {
      cancelled.push(...notifications.map((note) => note.id));
    },
    checkExactNotificationSetting: exact
      ? async () => ({ exact_alarm: exact })
      : undefined,
  };
}

describe("planReminders", () => {
  it("plans a lead and the due alert, and skips done or past tasks", () => {
    const planned = planReminders(task(), now);
    assert.equal(planned.length, 2);
    assert.equal(planned[0]?.body, "Milk is due in 10 minutes");
    assert.match(planned[1]?.body ?? "", /Checklist: Milk is due at 6:00\sPM/);
    assert.equal(Date.parse(planned[1]!.at) - Date.parse(planned[0]!.at), 10 * 60 * 1000);
    assert.deepEqual(planReminders(task({ done: true }), now), []);
    assert.deepEqual(planReminders(task({ deleted: true }), now), []);
    assert.deepEqual(planReminders(task({ dueAt: null }), now), []);
    const soon = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    assert.equal(planReminders(task({ dueAt: soon }), now).length, 1);
  });
});

describe("applyReminders", () => {
  it("schedules both alerts, then cancels them when the task is checked, deleted, or retimed", async () => {
    const plugin = mockPlugin();
    let next = 1;
    const armed = new Map();
    const first = await applyReminders({
      tasks: [task()],
      now,
      plugin,
      armed,
      hintShown: false,
      native: true,
      allow: true,
      nextId: () => next++,
    });
    assert.deepEqual(
      first.scheduled.map((note) => note.body),
      ["Milk is due in 10 minutes", "Checklist: Milk is due at 6:00 PM"],
    );
    assert.deepEqual(first.writes[0]?.ids, [1, 2]);
    assert.equal(first.hint, null);

    const checked = await applyReminders({
      tasks: [task({ done: true, notificationIds: [1, 2] })],
      now,
      plugin,
      armed,
      hintShown: false,
      native: true,
      allow: true,
      nextId: () => next++,
    });
    assert.deepEqual(checked.cancelled, [1, 2]);
    assert.deepEqual(checked.writes[0]?.ids, []);
    assert.equal(checked.scheduled.length, 0);

    const again = await applyReminders({
      tasks: [task({ notificationIds: [] })],
      now,
      plugin,
      armed,
      hintShown: false,
      native: true,
      allow: true,
      nextId: () => next++,
    });
    assert.equal(again.scheduled.length, 2);
    const liveIds = again.writes[0]?.ids ?? [];
    const removed = await applyReminders({
      tasks: [task({ deleted: true, notificationIds: liveIds })],
      now,
      plugin,
      armed,
      hintShown: false,
      native: true,
      allow: true,
      nextId: () => next++,
    });
    assert.deepEqual(removed.cancelled, liveIds);

    const retimedDue = new Date(2026, 9, 20, 19, 0, 0).toISOString();
    const scheduledBefore = plugin.scheduled.length;
    const armedFresh = new Map();
    const original = await applyReminders({
      tasks: [task()],
      now,
      plugin,
      armed: armedFresh,
      hintShown: false,
      native: true,
      allow: true,
      nextId: () => next++,
    });
    const moved = await applyReminders({
      tasks: [task({ dueAt: retimedDue, notificationIds: original.writes[0]?.ids ?? [] })],
      now,
      plugin,
      armed: armedFresh,
      hintShown: false,
      native: true,
      allow: true,
      nextId: () => next++,
    });
    assert.deepEqual(moved.cancelled, original.writes[0]?.ids);
    assert.equal(plugin.scheduled.length, scheduledBefore + 4);
    assert.match(moved.scheduled[1]?.body ?? "", /due at 7:00\sPM/);
  });

  it("reschedules ids that were saved before a restart", async () => {
    const plugin = mockPlugin();
    const result = await applyReminders({
      tasks: [task({ notificationIds: [9, 8] })],
      now,
      plugin,
      armed: new Map(),
      hintShown: false,
      native: true,
      allow: true,
      nextId: (() => {
        let id = 40;
        return () => id++;
      })(),
    });
    assert.deepEqual(result.cancelled, [9, 8]);
    assert.equal(result.scheduled.length, 2);
    assert.deepEqual(result.writes[0]?.ids, [40, 41]);
  });

  it("still schedules when exact alarms are denied and hints once", async () => {
    const plugin = mockPlugin("denied");
    const armed = new Map();
    const first = await applyReminders({
      tasks: [task()],
      now,
      plugin,
      armed,
      hintShown: false,
      native: true,
      allow: true,
      nextId: () => 7,
    });
    assert.equal(first.hint, EXACT_ALARM_HINT);
    assert.equal(first.scheduled.length, 2);
    const second = await applyReminders({
      tasks: [task({ notificationIds: first.writes[0]?.ids ?? [] })],
      now,
      plugin,
      armed,
      hintShown: first.hintShown,
      native: true,
      allow: true,
      nextId: () => 8,
    });
    assert.equal(second.hint, null);
    assert.equal(second.scheduled.length, 0);
  });
});
