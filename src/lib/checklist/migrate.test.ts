import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migrateV1toV2 } from "./migrate.ts";
import { moveToIndex, placeInColumn } from "./order.ts";
import { completion } from "./score.ts";
import { nineAmEasternIso } from "./time.ts";
import type { Task } from "./types.ts";

const v1 = {
  lists: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "barbershop",
      name: "Barbershop",
      inviteToken: "seed-barbershop",
      shared: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
      tasks: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", title: "Saturday open until 5", done: false, notes: "late", due: "2026-10-20" },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", title: "Check tomorrow's bookings", done: true, notes: "" },
      ],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "fire-dept",
      name: "Fire department",
      inviteToken: "seed-fire-dept",
      tasks: [
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", title: "Check hydrant map", done: false, notes: "map book", calendarEventId: "evt1" },
      ],
    },
  ],
  activeId: "22222222-2222-4222-8222-222222222222",
  theme: "rugged",
  dailyEnabled: true,
};

describe("migrateV1toV2", () => {
  it("keeps lists, checks, notes, and turns a date into 9:00 AM Eastern", () => {
    const next = migrateV1toV2(v1);
    assert.equal(next.version, 2);
    assert.equal(next.settings.defaultTheme, "rugged");
    assert.equal(next.settings.dailyEnabled, true);
    assert.equal(next.settings.calendarId, "primary");
    assert.equal(next.settings.shiftMatch, "Fire department");
    assert.equal(next.activeId, "22222222-2222-4222-8222-222222222222");
    const names = next.lists.filter((list) => !list.deletedAt).map((list) => list.name);
    assert.deepEqual(names, ["Daily", "Barbershop", "Fire department"]);
    const shop = next.lists.find((list) => list.slug === "barbershop");
    assert.ok(shop);
    assert.equal(shop.kind, "normal");
    assert.equal(shop.tasks[0]?.notes, "late");
    assert.equal(shop.tasks[0]?.done, false);
    assert.equal(shop.tasks[0]?.columnId, "col-morning");
    assert.equal(shop.tasks[0]?.dueAt, nineAmEasternIso("2026-10-20"));
    assert.equal(shop.tasks[1]?.done, true);
    const fire = next.lists.find((list) => list.kind === "fire-dept");
    assert.ok(fire);
    assert.equal(fire.tasks[0]?.notes, "map book");
    assert.equal(fire.tasks[0]?.calendarEventId, "evt1");
    assert.equal(fire.columns.map((column) => column.name).join(","), "Morning,Afternoon,Evening");
  });

  it("throws on a broken snapshot instead of dropping data", () => {
    assert.throws(() => migrateV1toV2(null), /bad snapshot/);
    assert.throws(() => migrateV1toV2({ theme: "dark" }), /bad snapshot/);
  });

  it("keeps a renamed fire list kind on a second pass", () => {
    const once = migrateV1toV2(v1);
    const fire = once.lists.find((list) => list.kind === "fire-dept");
    assert.ok(fire);
    fire.name = "Station 2";
    fire.slug = "station-2";
    const twice = migrateV1toV2({ ...once, version: 2 });
    assert.equal(twice.lists.find((list) => list.id === fire.id)?.kind, "fire-dept");
    assert.equal(twice.lists.find((list) => list.id === fire.id)?.position, fire.position);
  });
});

describe("completion", () => {
  it("never returns NaN for an empty list", () => {
    const stats = completion([]);
    assert.equal(stats.label, "0 of 0");
    assert.equal(stats.pct, 0);
    assert.equal(stats.points, 0);
    assert.equal(Number.isNaN(stats.pct), false);
  });

  it("counts a point per check plus an on-time bonus", () => {
    const tasks = [
      { done: true, onTime: true, deletedAt: null },
      { done: true, onTime: false, deletedAt: null },
      { done: false, onTime: null, deletedAt: null },
    ] as Task[];
    const stats = completion(tasks);
    assert.equal(stats.label, "2 of 3, 67%");
    assert.equal(stats.points, 3);
  });
});

describe("order", () => {
  it("moves an item to a 1-based slot and can place it in another column", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.deepEqual(moveToIndex(items, "c", 0)?.map((item) => item.id), ["c", "a", "b"]);
    assert.deepEqual(placeInColumn(["a", "b"], "c", "b"), ["a", "c", "b"]);
    assert.deepEqual(placeInColumn(["a", "b"], "a", "drop:col-evening"), ["b", "a"]);
  });
});
