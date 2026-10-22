import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrateV1toV2 } from "./migrate.ts";
import { seedPersisted } from "./store.ts";
import {
  appearanceFor,
  appAppearance,
  COLOR_KEYS,
  columnSlotFor,
  listSelection,
  packTheme,
  PRESETS,
  presetTexture,
  TEXTURE_IDS,
  TEXTURES,
  themeBoot,
  unpackTheme,
} from "./theme.ts";
import { THEME_IDS, type List, type Settings, type ThemeId } from "./types.ts";

function listWith(theme: List["theme"]): List {
  const list = seedPersisted().lists.find((item) => item.kind === "fire-dept");
  if (!list) throw new Error("missing fire list");
  return { ...list, theme };
}

describe("theme model", () => {
  it("keeps five presets and gives each day-part its own color", () => {
    assert.deepEqual(Object.keys(PRESETS).sort(), [...THEME_IDS].sort());
    for (const id of THEME_IDS) {
      const colors = PRESETS[id].colors;
      for (const key of COLOR_KEYS) assert.match(colors[key], /^#[0-9a-fA-F]{6}$/);
      assert.notEqual(colors.morning, colors.afternoon);
      assert.notEqual(colors.afternoon, colors.evening);
      assert.notEqual(colors.morning, colors.evening);
    }
  });

  it("pairs a texture with a theme and still allows none", () => {
    assert.equal(presetTexture("pink"), "floral");
    assert.equal(presetTexture("rugged"), "diamond");
    assert.equal(presetTexture("dark"), "none");
    assert.ok(TEXTURE_IDS.includes("none"));
    assert.ok(TEXTURE_IDS.includes("diamond"));
    assert.ok(TEXTURE_IDS.includes("floral"));
  });

  it("uses the app theme when a list says use app default", () => {
    const settings = seedPersisted().settings;
    const app = appAppearance(settings);
    const list = appearanceFor(listWith(null), settings);
    assert.equal(listSelection(null), "default");
    assert.deepEqual(list.colors, app.colors);
    assert.equal(list.texture, app.texture);
  });

  it("lets a list preset override the app theme", () => {
    const settings = seedPersisted().settings;
    const look = appearanceFor(listWith({ id: "pink" }), settings);
    assert.equal(look.source, "pink");
    assert.equal(look.colors.canvas, PRESETS.pink.colors.canvas);
    assert.equal(look.texture, "floral");
    assert.notEqual(look.colors.canvas, appAppearance(settings).colors.canvas);
  });

  it("keeps a custom color snapshot on the list", () => {
    const settings: Settings = {
      ...seedPersisted().settings,
      texture: "dots",
      activeCustomId: "custom-1",
      customThemes: [
        {
          id: "custom-1",
          name: "Night shift",
          texture: "diamond",
          colors: { ...PRESETS.dark.colors, canvas: "#102030", morning: "#224466" },
        },
      ],
    };
    const app = appAppearance(settings);
    assert.equal(app.label, "Night shift");
    assert.equal(app.texture, "diamond");
    assert.equal(app.colors.canvas, "#102030");
    const overridden = appearanceFor(
      listWith({ id: "custom-1", name: "Night shift", texture: "linen", canvas: "#abcdef", morning: "#111111" }),
      settings,
    );
    assert.equal(overridden.colors.canvas, "#abcdef");
    assert.equal(overridden.colors.morning, "#111111");
    assert.equal(overridden.texture, "linen");
    assert.equal(overridden.colors.ink, PRESETS.dark.colors.ink);
  });

  it("round-trips saved themes through the synced theme document and still reads an old string", () => {
    const settings: Settings = {
      ...seedPersisted().settings,
      defaultTheme: "light",
      texture: "floral",
      activeCustomId: "custom-2",
      customThemes: [
        {
          id: "custom-2",
          name: "Shop",
          texture: "floral",
          colors: PRESETS.light.colors,
        },
      ],
    };
    const packed = packTheme(settings);
    const again = unpackTheme(packed);
    assert.equal(again.defaultTheme, "light");
    assert.equal(again.texture, "floral");
    assert.equal(again.activeCustomId, "custom-2");
    assert.equal(again.customThemes[0]?.name, "Shop");
    const legacy = unpackTheme("rugged", { customThemes: settings.customThemes });
    assert.equal(legacy.defaultTheme, "rugged");
    assert.equal(legacy.texture, "diamond");
    assert.equal(legacy.activeCustomId, null);
    assert.equal(legacy.customThemes[0]?.id, "custom-2");
  });

  it("keeps task notes out of settings", () => {
    const settings = seedPersisted().settings;
    const task = seedPersisted().lists[2]?.tasks[0];
    assert.equal("notes" in settings, false);
    assert.equal("notesDraft" in settings, false);
    assert.equal(typeof settings.calendarId, "string");
    assert.equal(typeof settings.shiftMatch, "string");
    assert.equal(typeof settings.dailyEnabled, "boolean");
    assert.equal(typeof settings.texture, "string");
    assert.ok(Array.isArray(settings.customThemes));
    assert.equal(typeof task?.notes, "string");
    assert.equal(typeof task?.title, "string");
    const migrated = migrateV1toV2({
      lists: [{ name: "Fire department", tasks: [{ title: "Hose", notes: "50 foot" }] }],
      theme: "rugged",
    });
    assert.equal(migrated.settings.defaultTheme, "rugged");
    assert.equal(migrated.settings.texture, "diamond");
    assert.equal(migrated.lists.find((item) => item.kind === "fire-dept")?.tasks[0]?.notes, "50 foot");
    assert.equal("notes" in migrated.settings, false);
  });

  it("maps the day-part columns and keeps a divider style", () => {
    assert.equal(columnSlotFor("col-morning", 0), "morning");
    assert.equal(columnSlotFor("col-afternoon", 1), "afternoon");
    assert.equal(columnSlotFor("col-evening", 2), "evening");
    assert.equal(columnSlotFor("col-night", 3), "morning");
    const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    assert.match(css, /\.columns/);
    assert.match(css, /\.column-block/);
    assert.match(css, /button:active/);
    assert.match(css, /button:focus-visible/);
    assert.match(css, /min-height:\s*44px/);
    assert.match(css, /data-texture="diamond"/);
    assert.match(css, /data-texture="floral"/);
    for (const texture of TEXTURES) {
      if (texture.id === "none") continue;
      const file = new URL(`../../../public/textures/${texture.id}.svg`, import.meta.url);
      assert.equal(existsSync(file), true, texture.label);
      assert.match(readFileSync(file, "utf8"), /<svg/);
      assert.match(css, new RegExp(`data-texture="${texture.id}"`));
      assert.ok(TEXTURE_IDS.includes(texture.id));
    }
    assert.match(themeBoot, /"brushed"/);
    assert.match(themeBoot, /"chevron"/);
    assert.match(themeBoot, /P\.textures\.indexOf/);
    assert.match(css, /--color-morning/);
    assert.match(css, /--color-checked/);
  });
});
