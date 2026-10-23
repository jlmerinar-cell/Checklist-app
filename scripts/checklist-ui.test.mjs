import assert from "node:assert/strict";
import { createJiti } from "jiti";
import { test } from "node:test";

const jiti = createJiti(import.meta.url, {
  jsx: { runtime: "automatic" },
  tsconfigPaths: true,
});

const { renderScreens, renderListEdit } = await jiti.import("../src/components/checklist/ui-render.tsx");
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
  assert.equal(list.includes('aria-label="Expand Check hydrant map"'), false);
  assert.match(list, /Quincy Hill: black bonnets/);
  assert.match(list, /aria-label="Has notes"/);
  assert.match(list, /data-due-chip=/);
  assert.match(list, /2 of 6/);
  assert.match(list, /id="add-task"/);
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
  assert.equal(list.includes(">Daily<"), false);
  assert.equal(list.includes("Saturday open until 5"), false);
  assert.equal(list.includes("EMT patient assessment"), false);
  assert.equal(list.includes('href="/settings"'), false);
  assert.equal(list.includes("Start list"), false);
  assert.equal(list.includes("Score "), false);
  assert.equal(list.includes("Theme editor"), false);
  assert.equal(list.includes("Diamond plate"), false);
  assert.equal(list.includes("Brushed metal"), false);
  assert.match(list, /Add list/);
  assert.match(list, /aria-label="New list name"/);
  assert.match(list, /aria-label="Edit lists"/);
  assert.match(list, /aria-label="Edit list Fire department"/);
  assert.match(list, /href="\/list\/22222222-2222-4222-8222-222222222222\/edit"/);
  assert.match(list, /href="\/list\/11111111-1111-4111-8111-111111111111\/edit"/);
  assert.match(list, /href="\/list\/33333333-3333-4333-8333-333333333333\/edit"/);
  assert.equal(list.includes("/list/00000000-0000-4000-8000-0000000000da/edit"), false);
  assert.equal((list.match(/data-edit-list="/g) || []).length, 3);
  assert.match(list, /progressbar/);
  assert.match(list, /New task/);
  assert.equal(list.includes("Shift calendar"), false);
  assert.equal(list.includes('id="checklist-command"'), false);
  assert.equal(list.includes("Sync setup"), false);
});

test("a task starts collapsed, expands, collapses, and a check does not expand it", () => {
  assert.equal(list.includes('aria-label="Expand Check hydrant map"'), false);
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
  assert.match(open, /Manual start/);
  assert.match(open, /Save a backup/);
  assert.match(open, /Open a backup/);
  assert.match(open, />Theme</);
  assert.ok(open.indexOf(">Theme<") > open.indexOf("Notifications"));
  assert.ok(open.indexOf(">Theme<") > open.indexOf("Shift calendar"));
  assert.equal(open.includes("<details open"), false);
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

test("each list edit page is only that list, including delete and theme", () => {
  const fire = "22222222-2222-4222-8222-222222222222";
  const personal = "33333333-3333-4333-8333-333333333333";
  const daily = "00000000-0000-4000-8000-0000000000da";
  const firePage = renderListEdit(fire);
  assert.match(firePage, /data-screen="list-edit"/);
  assert.match(firePage, new RegExp(`data-list-id="${fire}"`));
  assert.match(firePage, /Check hydrant map/);
  assert.equal(firePage.includes("Saturday open until 5"), false);
  assert.equal(firePage.includes("EMT patient assessment"), false);
  assert.match(firePage, /aria-label="Rename Fire department"/);
  assert.match(firePage, /id="add-task"/);
  assert.match(firePage, /Delete list/);
  assert.match(firePage, /Theme for Fire department/);
  assert.match(firePage, /Preset themes for Fire department/);
  assert.match(firePage, /Pink/);
  assert.match(firePage, /Use app default/);
  assert.match(firePage, /href="\/"/);
  assert.equal(firePage.includes('aria-label="Theme target"'), false);
  assert.equal(firePage.includes('href="/settings"'), false);

  const personalPage = renderListEdit(personal);
  assert.match(personalPage, /EMT patient assessment/);
  assert.equal(personalPage.includes("Check hydrant map"), false);
  assert.match(personalPage, /Theme for Personal/);
  assert.notEqual(firePage, personalPage);

  const dailyPage = renderListEdit(daily);
  assert.match(dailyPage, /can(?:'|&#x27;)t be deleted/);
  assert.equal(dailyPage.includes("Delete list"), false);
  assert.equal(dailyPage.includes("Delete this list"), false);

  const missing = renderListEdit("missing-list");
  assert.match(missing, /That list isn(?:'|&#x27;)t here/);
  assert.match(missing, /href="\/"/);
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
  assert.match(settings, /Save a backup/);
  assert.match(settings, /Open a backup/);
  assert.match(settings, />Theme</);
  assert.ok(settings.indexOf(">Theme<") > settings.indexOf("Notifications"));
  assert.ok(settings.indexOf(">Theme<") > settings.indexOf("Shift calendar"));
  assert.equal(settings.includes(">Download<"), false);
  assert.match(settings, /Sync setup/);
  assert.equal(settings.includes("bot access"), false);
  assert.equal(settings.includes("curl "), false);
  assert.match(settings, /id="checklist-command"/);
  assert.match(settings, /href="\/"/);
  assert.equal(settings.includes("Notes for Check hydrant map"), false);
  assert.equal(settings.includes("data-task-id"), false);
  assert.equal(settings.includes(">Start list<"), false);
});
