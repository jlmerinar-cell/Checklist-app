import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { listsForSwitcher } from "./chrome.ts";
import { canDeleteList, editTargets, listEditPath, nextDeletePhase } from "./list-edit.ts";
import { migrateV1toV2 } from "./migrate.ts";
import {
  addColumn,
  addTask,
  applyTexture,
  createList,
  deleteList,
  deleteTask,
  getState,
  moveTaskByDir,
  renameList,
  reviveStored,
  saveNotes,
  setDone,
  setDueAt,
  setListTheme,
  setTitle,
  snapshot,
} from "./store.ts";
import { appearanceFor, themeIdOf } from "./theme.ts";

function reloaded() {
  const raw = JSON.parse(JSON.stringify(snapshot())) as unknown;
  return { migrated: migrateV1toV2(raw), revived: reviveStored(raw) };
}

describe("user lists", { concurrency: 1 }, () => {
  it("edits a user-created list the same way as a built-in list and keeps it after reload", () => {
    const list = createList("Shift notes");
    assert.equal(list.system, false);
    assert.equal(list.kind, "normal");
    assert.equal(renameList(list.id, "Station notes"), null);
    const boots = addTask(list.id, "Boots");
    const helmet = addTask(list.id, "Helmet");
    assert.ok(boots);
    assert.ok(helmet);
    setTitle(list.id, boots.id, "Turnout boots");
    setDone(list.id, helmet.id, true);
    moveTaskByDir(list.id, helmet.id, -1);
    setDueAt(list.id, boots.id, "2026-10-22T13:00:00.000Z");
    saveNotes(list.id, boots.id, "By the bay door");
    assert.equal(addColumn(list.id, "Night"), null);
    const edited = getState().lists.find((item) => item.id === list.id);
    const morning = edited?.tasks.filter((item) => !item.deletedAt) ?? [];
    morning.sort((a, b) => a.position - b.position);
    assert.deepEqual(
      morning.map((item) => item.title),
      ["Helmet", "Turnout boots"],
    );
    assert.equal(morning.find((item) => item.title === "Helmet")?.done, true);
    deleteTask(list.id, helmet.id);

    for (const copy of [reloaded().migrated, reloaded().revived]) {
      const kept = copy.lists.find((item) => item.id === list.id);
      assert.ok(kept);
      assert.equal(kept.deletedAt, null);
      assert.equal(kept.name, "Station notes");
      assert.equal(kept.system, false);
      assert.ok(kept.columns.some((column) => column.name === "Night"));
      const live = kept.tasks.filter((item) => !item.deletedAt);
      assert.deepEqual(
        live.map((item) => item.title),
        ["Turnout boots"],
      );
      assert.equal(live[0]?.notes, "By the bay door");
      assert.equal(live[0]?.dueAt, "2026-10-22T13:00:00.000Z");
      assert.equal(live[0]?.done, false);
      const removed = kept.tasks.find((item) => item.id === helmet.id);
      assert.ok(removed?.deletedAt);
    }
  });

  it("deletes a user list and its items, then lands on a remaining list", () => {
    const list = createList("Errands");
    const task = addTask(list.id, "Tape");
    assert.ok(task);
    assert.equal(getState().activeId, list.id);
    assert.equal(canDeleteList(list), true);
    assert.equal(nextDeletePhase("idle"), "confirm");
    assert.equal(nextDeletePhase("confirm"), "commit");
    assert.equal(deleteList(list.id), null);

    const state = getState();
    assert.notEqual(state.activeId, list.id);
    const shown = listsForSwitcher(
      state.lists.filter((item) => !item.deletedAt),
      state.settings.dailyEnabled,
    );
    assert.equal(
      shown.some((item) => item.id === state.activeId),
      true,
    );
    assert.equal(
      shown.some((item) => item.kind === "daily"),
      false,
    );
    const removed = state.lists.find((item) => item.id === list.id);
    assert.ok(removed?.deletedAt);
    assert.ok(removed.tasks.every((item) => item.deletedAt));

    for (const copy of [reloaded().migrated, reloaded().revived]) {
      const gone = copy.lists.find((item) => item.id === list.id);
      assert.ok(gone?.deletedAt);
      assert.ok(gone.tasks.every((item) => item.deletedAt));
      assert.equal(copy.activeId, state.activeId);
      assert.equal(
        copy.lists.some((item) => item.id === copy.activeId && !item.deletedAt),
        true,
      );
    }

    const daily = state.lists.find((item) => item.system);
    assert.ok(daily);
    assert.equal(canDeleteList(daily), false);
    assert.equal(deleteList(daily.id), "Daily can't be deleted.");
  });

  it("adds a named list that is selectable and still there after reload", () => {
    const first = createList("Groceries");
    const second = createList("  Groceries  ");
    assert.equal(first.name, "Groceries");
    assert.equal(second.name, "Groceries");
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.slug, second.slug);
    assert.equal(getState().activeId, second.id);
    const shown = listsForSwitcher(
      getState().lists.filter((item) => !item.deletedAt),
      getState().settings.dailyEnabled,
    );
    assert.equal(
      shown.filter((item) => item.name === "Groceries").length,
      2,
    );
    const blank = createList("   ");
    assert.equal(blank.name, "New list");

    for (const copy of [reloaded().migrated, reloaded().revived]) {
      const names = copy.lists.filter((item) => !item.deletedAt).map((item) => item.id);
      assert.equal(names.includes(first.id), true);
      assert.equal(names.includes(second.id), true);
      assert.equal(names.includes(blank.id), true);
      assert.equal(copy.activeId, blank.id);
    }
  });

  it("points each list at its own edit page", () => {
    const targets = editTargets([
      { id: "list-a", name: "Alpha" },
      { id: "list-b", name: "Beta" },
    ]);
    assert.deepEqual(
      targets.map((item) => item.href),
      [listEditPath("list-a"), listEditPath("list-b")],
    );
    assert.equal(targets[0]?.href, "/list/list-a/edit");
    assert.equal(targets[1]?.href, "/list/list-b/edit");
    assert.notEqual(targets[0]?.href, targets[1]?.href);
    const shown = listsForSwitcher(
      getState().lists.filter((item) => !item.deletedAt),
      false,
    );
    const links = editTargets(shown);
    assert.equal(links.length, shown.length);
    assert.equal(new Set(links.map((item) => item.href)).size, links.length);
    assert.equal(
      links.some((item) => item.href.includes("/settings")),
      false,
    );
  });

  it("changes one list theme without changing another list or the app theme", () => {
    const alpha = createList("Alpha theme");
    const beta = createList("Beta theme");
    const appTheme = getState().settings.defaultTheme;
    setListTheme(alpha.id, "pink");
    applyTexture(beta.id, "linen");

    const state = getState();
    const listA = state.lists.find((item) => item.id === alpha.id);
    const listB = state.lists.find((item) => item.id === beta.id);
    assert.equal(themeIdOf(listA?.theme ?? null), "pink");
    assert.equal(listB?.theme?.texture, "linen");
    assert.notEqual(themeIdOf(listB?.theme ?? null), "pink");
    assert.equal(appearanceFor(listA ?? null, state.settings).source, "pink");
    assert.notEqual(appearanceFor(listB ?? null, state.settings).source, "pink");
    assert.equal(state.settings.defaultTheme, appTheme);
    assert.notEqual(
      appearanceFor(listA ?? null, state.settings).colors.canvas,
      appearanceFor(listB ?? null, state.settings).colors.canvas,
    );

    for (const copy of [reloaded().migrated, reloaded().revived]) {
      const keptA = copy.lists.find((item) => item.id === alpha.id);
      const keptB = copy.lists.find((item) => item.id === beta.id);
      assert.equal(themeIdOf(keptA?.theme ?? null), "pink");
      assert.equal(keptB?.theme?.texture, "linen");
      assert.equal(copy.settings.defaultTheme, appTheme);
      assert.notEqual(
        appearanceFor(keptA ?? null, copy.settings).colors.canvas,
        appearanceFor(keptB ?? null, copy.settings).colors.canvas,
      );
    }
  });
});
