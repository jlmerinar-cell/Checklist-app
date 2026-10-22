import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { test } from "node:test";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { renderScreens } = await jiti.import("../src/components/checklist/ui-render.tsx");
const { showListSwitcher } = await jiti.import("../src/lib/checklist/chrome.ts");
const { foldAfterTap } = await jiti.import("../src/lib/checklist/task-fold.ts");
const { handleVoiceTap } = await jiti.import("../src/lib/checklist/voice.ts");
const { setTheme, getState } = await jiti.import("../src/lib/checklist/store.ts");
const { list, open, expanded, settings } = renderScreens();
const HYDRANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

test("main screen is the checklist, the switcher, the mic, and the gear", () => {
  assert.equal(showListSwitcher(1), false);
  assert.equal(showListSwitcher(2), true);
  assert.match(list, /Check hydrant map/);
  assert.match(list, new RegExp(`data-task-id="${HYDRANT}"[^>]*data-expanded="false"`));
  assert.match(list, /aria-label="Edit Check hydrant map"/);
  assert.match(list, /aria-label="Rename Fire department"/);
  assert.match(list, /aria-label="Edit due time for Check hydrant map"/);
  assert.match(list, /aria-label="Expand Check hydrant map"/);
  assert.match(list, /aria-label="Has notes"/);
  assert.match(list, /data-due-chip=/);
  assert.equal(list.includes('aria-label="Notes for Check hydrant map"'), false);
  assert.equal(list.includes('aria-label="Due time for Check hydrant map"'), false);
  assert.equal(list.includes("Drag to reorder"), false);
  assert.equal((list.match(/role="tabpanel"/g) || []).length, 1);
  assert.match(list, /aria-label="Switch list"/);
  assert.match(list, /aria-label="Voice command"/);
  assert.match(list, /aria-label="Settings"/);
  assert.match(list, /aria-expanded="false"/);
  assert.match(list, /data-screen="list"/);
  assert.match(list, /data-column="morning"/);
  assert.match(list, /data-column="afternoon"/);
  assert.match(list, /data-column="evening"/);
  assert.match(list, /class="col-band"/);
  assert.match(list, /role="checkbox"/);
  assert.equal(list.includes("Saturday open until 5"), false);
  assert.equal(list.includes("EMT patient assessment"), false);
  assert.equal(list.includes('href="/settings"'), false);
  assert.equal(list.includes("Start list"), false);
  assert.equal(list.includes("Score "), false);
  assert.equal(list.includes("Theme editor"), false);
  assert.equal(list.includes("Diamond plate"), false);
  assert.equal(list.includes("Brushed metal"), false);
  assert.equal(list.includes("Add list"), false);
  assert.equal(list.includes("progressbar"), false);
  assert.equal(list.includes("New task"), false);
  assert.equal(list.includes("Shift calendar"), false);
  assert.equal(list.includes('id="checklist-command"'), false);
  assert.equal(list.includes("Sync setup"), false);
});

test("a task starts collapsed, expands, collapses, and a check does not expand it", () => {
  assert.match(list, /aria-label="Expand Check hydrant map"/);
  assert.equal(list.includes('aria-label="Notes for Check hydrant map"'), false);
  assert.match(expanded, /aria-label="Collapse Check hydrant map"/);
  assert.match(expanded, new RegExp(`data-task-id="${HYDRANT}"[^>]*data-expanded="true"`));
  assert.match(expanded, /aria-label="Notes for Check hydrant map"/);
  assert.match(expanded, /aria-label="Due time for Check hydrant map"/);
  assert.match(expanded, /Drag to reorder Check hydrant map/);
  const id = HYDRANT;
  let openIds = foldAfterTap(new Set(), id, "toggle");
  assert.equal(openIds.has(id), true);
  openIds = foldAfterTap(openIds, id, "toggle");
  assert.equal(openIds.has(id), false);
  openIds = foldAfterTap(openIds, id, "toggle");
  const afterCheck = foldAfterTap(openIds, id, "check");
  assert.equal(afterCheck.has(id), true);
  assert.equal(afterCheck.size, openIds.size);
});

test("the gear opens every setting and a theme change sticks", () => {
  assert.match(open, /aria-expanded="true"/);
  assert.match(open, /aria-label="Close settings"/);
  assert.match(open, /Theme editor/);
  assert.match(open, /Diamond plate/);
  assert.match(open, /Floral/);
  assert.match(open, /Brushed metal/);
  assert.match(open, /Carbon fiber/);
  assert.match(open, /Wood grain/);
  assert.match(open, /Leather/);
  assert.match(open, /Hexagon/);
  assert.match(open, /Chevron/);
  assert.match(open, /data-texture-preview=/);
  assert.match(open, /data-texture-sample="brushed"/);
  assert.match(open, /data-texture-sample="carbon"/);
  assert.match(open, /data-texture-sample="wood"/);
  assert.match(open, /data-texture-sample="leather"/);
  assert.match(open, /data-texture-sample="hexagon"/);
  assert.match(open, /data-texture-sample="chevron"/);
  assert.match(open, /Save theme/);
  assert.match(open, /New theme/);
  assert.match(open, /Start list/);
  assert.match(open, /Score /);
  assert.match(open, /Add list/);
  assert.match(open, /role="progressbar"/);
  assert.match(open, /New task/);
  assert.match(open, /Use app default/);
  setTheme("pink");
  assert.equal(getState().settings.defaultTheme, "pink");
  assert.equal(getState().settings.texture, "floral");
  setTheme("dark");
});

test("the mic runs a mocked recognizer", async () => {
  assert.match(list, /aria-label="Voice command"/);
  assert.equal(await handleVoiceTap(async () => null), "Didn't catch that.");
  assert.match(await handleVoiceTap(async () => "add turnout coat"), /Added turnout coat/);
  assert.match(await handleVoiceTap(async () => "check off turnout"), /Checked off turnout coat/);
});

test("settings keeps app controls off the task card", () => {
  assert.match(settings, /Theme editor/);
  assert.match(settings, /Diamond plate/);
  assert.match(settings, /Floral/);
  assert.match(settings, /Brushed metal/);
  assert.match(settings, /App background/);
  assert.match(settings, /Morning column/);
  assert.match(settings, /Checked item/);
  assert.match(settings, /Shift calendar/);
  assert.match(settings, /Shift day title/);
  assert.match(settings, /Notifications/);
  assert.match(settings, /Morning daily/);
  assert.match(settings, /Sync setup/);
  assert.equal(settings.includes("bot access"), false);
  assert.equal(settings.includes("curl "), false);
  assert.match(settings, /id="checklist-command"/);
  assert.match(settings, /href="\/"/);
  assert.equal(settings.includes("Notes for Check hydrant map"), false);
  assert.equal(settings.includes("data-task-id"), false);
  assert.equal(settings.includes(">Start list<"), false);
});
