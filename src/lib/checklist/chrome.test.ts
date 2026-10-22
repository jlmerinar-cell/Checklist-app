import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyListCopy, listsForSwitcher, showListSwitcher } from "./chrome.ts";
import { shareBlurb } from "./commands.ts";
import { destinationColumn } from "./store.ts";

describe("lists on the switcher", () => {
  const lists = [
    { kind: "daily", name: "Daily" },
    { kind: "fire-dept", name: "Fire department" },
  ];

  it("hides Daily until Morning daily is on", () => {
    assert.equal(showListSwitcher(2), true);
    assert.deepEqual(
      listsForSwitcher(lists, false).map((list) => list.name),
      ["Fire department"],
    );
    assert.deepEqual(
      listsForSwitcher(lists, true).map((list) => list.name),
      ["Daily", "Fire department"],
    );
  });

  it("tells an empty Daily list that it needs the calendar", () => {
    assert.match(emptyListCopy("daily", true), /needs the calendar/);
    assert.match(emptyListCopy("daily", false), /isn't available on this phone/);
    assert.equal(emptyListCopy("fire-dept", true), "Nothing on this list yet.");
  });
});

describe("share copy", () => {
  it("says the link is local when sync is off", () => {
    assert.match(shareBlurb("Fire department", false), /on this phone only/);
    assert.match(shareBlurb("Fire department", false), /no sync/);
    assert.match(shareBlurb("Fire department", true), /With sync on/);
  });
});

describe("column removal", () => {
  const columns = [
    { id: "morning", name: "Morning" },
    { id: "afternoon", name: "Afternoon" },
    { id: "evening", name: "Evening" },
  ];

  it("names the next column, or the previous one when this is last", () => {
    assert.equal(destinationColumn(columns, "morning")?.name, "Afternoon");
    assert.equal(destinationColumn(columns, "afternoon")?.name, "Evening");
    assert.equal(destinationColumn(columns, "evening")?.name, "Afternoon");
    assert.equal(destinationColumn([{ id: "only", name: "Only" }], "only"), null);
  });
});
