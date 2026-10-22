import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activeList } from "./store.ts";
import { closestTask, handleVoiceTap, parseSpokenClock, parseVoice, runVoice } from "./voice.ts";

const tasks = [
  { id: "1", title: "Check hydrant map" },
  { id: "2", title: "Restock the medical kit" },
  { id: "3", title: "Parkland Place standpipe" },
  { id: "4", title: "Check oil" },
];

describe("parseVoice", () => {
  it("parses add, check, and uncheck", () => {
    assert.deepEqual(parseVoice("add gloves"), { kind: "add", title: "gloves", clock: null });
    assert.deepEqual(parseVoice("Add Milk."), { kind: "add", title: "Milk", clock: null });
    assert.deepEqual(parseVoice("check off hydrant map"), { kind: "check", query: "hydrant map" });
    assert.deepEqual(parseVoice("check hydrant"), { kind: "check", query: "hydrant" });
    assert.deepEqual(parseVoice("uncheck medical kit"), { kind: "uncheck", query: "medical kit" });
    assert.deepEqual(parseVoice("hello"), { kind: "none" });
  });

  it("splits a spoken due time off an add command", () => {
    assert.deepEqual(parseVoice("add milk by 6 pm"), { kind: "add", title: "milk", clock: "6 pm" });
    assert.deepEqual(parseVoice("add milk by 6:30 p.m."), { kind: "add", title: "milk", clock: "6:30 p.m." });
    assert.deepEqual(parseVoice("add milk by 18:00"), { kind: "add", title: "milk", clock: "18:00" });
    assert.deepEqual(parseSpokenClock("6 pm"), { hours: 18, minutes: 0 });
    assert.deepEqual(parseSpokenClock("6:30 p.m."), { hours: 18, minutes: 30 });
    assert.deepEqual(parseSpokenClock("12 am"), { hours: 0, minutes: 0 });
    assert.deepEqual(parseSpokenClock("18:00"), { hours: 18, minutes: 0 });
  });
});

describe("closestTask", () => {
  it("fuzzy-matches the closest title and rejects a miss or a tie", () => {
    assert.equal(closestTask(tasks, "hydrant")?.id, "1");
    assert.equal(closestTask(tasks, "chek hydrant")?.id, "1");
    assert.equal(closestTask(tasks, "standpipe")?.id, "3");
    assert.equal(closestTask(tasks, "zzzzqqqq"), null);
    assert.equal(closestTask(tasks, "check"), null);
  });
});

describe("runVoice", () => {
  it("adds a task and sets today at the spoken time", () => {
    const now = new Date(2026, 9, 20, 12, 0, 0);
    const message = runVoice("add milk by 6 pm", now);
    assert.match(message, /Heard “add milk by 6 pm”/);
    assert.match(message, /Added milk/);
    assert.match(message, /by 6:00\sPM/);
    const task = activeList()?.tasks.find((item) => item.title === "milk");
    assert.ok(task?.dueAt);
    assert.equal(new Date(task.dueAt).getHours(), 18);
    assert.equal(new Date(task.dueAt).getMinutes(), 0);
  });

  it("checks and unchecks the closest task", () => {
    const checked = runVoice("check off hydrant");
    assert.match(checked, /Checked off Check hydrant map/);
    const task = activeList()?.tasks.find((item) => item.title === "Check hydrant map");
    assert.equal(task?.done, true);
    const cleared = runVoice("uncheck hydrant");
    assert.match(cleared, /Marked Check hydrant map not done/);
    assert.equal(activeList()?.tasks.find((item) => item.title === "Check hydrant map")?.done, false);
  });

  it("says it missed when nothing matches", async () => {
    assert.match(runVoice("check zebra stripes"), /Didn't catch that/);
    assert.equal(await handleVoiceTap(async () => null), "Didn't catch that.");
    assert.match(await handleVoiceTap(async () => "add radio"), /Added radio/);
  });
});
