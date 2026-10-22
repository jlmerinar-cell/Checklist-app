import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { migrateV1toV2 } from "./migrate.ts";
import { reviveStored } from "./store.ts";

const stock = {
  lists: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      slug: "barbershop",
      name: "Barbershop",
      inviteToken: "seed-barbershop",
      tasks: [
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", title: "Saturday open until 5", done: false, notes: "" },
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", title: "Check tomorrow's bookings", done: true, notes: "" },
      ],
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      slug: "fire-dept",
      name: "Fire department",
      inviteToken: "seed-fire-dept",
      tasks: [
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", title: "Check hydrant map", done: false, notes: "" },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", title: "Quincy Hill relay", done: true, notes: "" },
      ],
    },
    {
      id: "33333333-3333-4333-8333-333333333333",
      slug: "personal",
      name: "Personal",
      inviteToken: "seed-personal",
      tasks: [{ id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1", title: "EMT skill sheets", done: false, notes: "" }],
    },
  ],
  activeId: "22222222-2222-4222-8222-222222222222",
  theme: "pink",
};

describe("reviveStored", () => {
  it("replaces the untouched pre-1.4.1 sample and keeps the saved theme", () => {
    const revived = reviveStored(migrateV1toV2(stock));
    const titles = revived.lists.flatMap((list) => list.tasks.map((task) => task.title));
    assert.equal(titles.includes("Engine check and medical bag"), true);
    assert.equal(revived.settings.defaultTheme, "pink");
    assert.equal(revived.settings.texture, "floral");
  });

  it("keeps a check, a note, or a due time on the original five tasks", () => {
    const checked = migrateV1toV2(stock);
    const hydrant = checked.lists
      .flatMap((list) => list.tasks)
      .find((task) => task.id === "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1");
    assert.ok(hydrant);
    hydrant.done = true;
    hydrant.notes = "map book";
    const revived = reviveStored(checked);
    const kept = revived.lists.flatMap((list) => list.tasks).find((task) => task.id === hydrant.id);
    assert.equal(kept?.done, true);
    assert.equal(kept?.notes, "map book");
    assert.equal(
      revived.lists.flatMap((list) => list.tasks).some((task) => task.title === "Engine check and medical bag"),
      false,
    );
    assert.equal(revived.settings.defaultTheme, "pink");
  });
});
