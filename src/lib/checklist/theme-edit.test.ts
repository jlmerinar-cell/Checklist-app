import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { migrateV1toV2 } from "./migrate.ts";
import {
  applyEditedTheme,
  applyTexture,
  getState,
  reviveStored,
  saveNamedTheme,
  selectSavedTheme,
  setTheme,
  snapshot,
} from "./store.ts";
import { appearanceFor, appAppearance, packTheme, PRESETS, unpackTheme } from "./theme.ts";
import type { List, TextureId, ThemeColors } from "./types.ts";

const EXTRA: TextureId[] = ["brushed", "carbon", "wood", "leather", "hexagon", "chevron"];

function colors(canvas: string): ThemeColors {
  return { ...PRESETS.dark.colors, canvas };
}

function reload() {
  const raw = JSON.parse(JSON.stringify(snapshot()));
  const migrated = migrateV1toV2(raw);
  const revived = reviveStored(raw);
  return { migrated, revived };
}

describe("theme editing and textures", { concurrency: 1 }, () => {
  it("creates a theme, edits it, and keeps both the new theme and the edit after a reload", () => {
    const draftColors = colors("#112233");
    applyEditedTheme("app", draftColors, "brushed", null);
    assert.equal(getState().settings.activeCustomId, "custom-draft");

    const created = saveNamedTheme("Night shift", draftColors, "brushed", "app", null);
    assert.notEqual(created, "custom-draft");
    assert.equal(getState().settings.customThemes.some((theme) => theme.id === "custom-draft"), false);
    const first = getState().settings.customThemes.find((theme) => theme.id === created);
    assert.equal(first?.name, "Night shift");
    assert.equal(first?.colors.canvas, "#112233");
    assert.equal(first?.texture, "brushed");
    assert.equal(getState().settings.activeCustomId, created);
    assert.equal(getState().settings.texture, "brushed");

    let stored = reload();
    for (const copy of [stored.migrated, stored.revived]) {
      assert.equal(copy.settings.customThemes.find((theme) => theme.id === created)?.name, "Night shift");
      assert.equal(copy.settings.customThemes.find((theme) => theme.id === created)?.colors.canvas, "#112233");
      assert.equal(copy.settings.texture, "brushed");
      assert.equal(copy.settings.activeCustomId, created);
    }
    const synced = unpackTheme(packTheme(getState().settings));
    assert.equal(synced.customThemes.find((theme) => theme.id === created)?.name, "Night shift");
    assert.equal(synced.texture, "brushed");

    const edited = colors("#abcdef");
    selectSavedTheme("app", created);
    applyEditedTheme("app", edited, "leather", created);
    const touched = getState().settings.customThemes.find((theme) => theme.id === created);
    assert.equal(touched?.colors.canvas, "#abcdef");
    assert.equal(touched?.texture, "leather");
    assert.equal(touched?.name, "Night shift");

    const again = saveNamedTheme("Night watch", edited, "leather", "app", created);
    assert.equal(again, created);
    assert.equal(getState().settings.customThemes.filter((theme) => theme.name === "Night shift").length, 0);
    const renamed = getState().settings.customThemes.find((theme) => theme.id === created);
    assert.equal(renamed?.name, "Night watch");
    assert.equal(renamed?.colors.canvas, "#abcdef");
    assert.equal(renamed?.texture, "leather");

    stored = reload();
    for (const copy of [stored.migrated, stored.revived]) {
      const kept = copy.settings.customThemes.find((theme) => theme.id === created);
      assert.equal(kept?.name, "Night watch");
      assert.equal(kept?.colors.canvas, "#abcdef");
      assert.equal(kept?.texture, "leather");
      assert.equal(copy.settings.activeCustomId, created);
      assert.equal(copy.settings.texture, "leather");
    }

    setTheme("rugged");
    assert.equal(getState().settings.activeCustomId, null);
    assert.equal(getState().settings.customThemes.some((theme) => theme.id === created), true);
    assert.equal(PRESETS.rugged.colors.canvas, "#1c1a17");
  });

  it("applies each extra texture from a tap and keeps it after a reload", () => {
    const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
    assert.match(css, /body\[data-texture\]:not\(\[data-texture="none"\]\)::before/);
    assert.equal(css.includes("background-attachment: fixed"), false);
    assert.match(css, /background-attachment:\s*scroll/);
    const list = getState().lists.find((item) => item.id === getState().activeId);
    assert.equal(list?.theme, null);

    for (const texture of EXTRA) {
      setTheme("dark");
      applyTexture("app", texture);
      assert.equal(getState().settings.texture, texture);
      assert.equal(getState().settings.activeCustomId, null);
      assert.equal(appAppearance(getState().settings).texture, texture);
      assert.equal(appearanceFor(list ?? null, getState().settings).texture, texture);
      const stored = reload();
      assert.equal(stored.migrated.settings.texture, texture);
      assert.equal(stored.revived.settings.texture, texture);
      assert.match(css, new RegExp(`data-texture="${texture}"`));
      assert.match(css, new RegExp(`/textures/${texture}\\.svg`));
      assert.match(css, new RegExp(`data-texture-sample="${texture}"`));
      const file = readFileSync(new URL(`../../../public/textures/${texture}.svg`, import.meta.url), "utf8");
      assert.match(file, /<svg/);
      assert.match(file, /fill=/);
    }
  });

  it("saves a list texture and an edited list theme across a reload", () => {
    const listId = getState().activeId;
    assert.ok(listId);
    const created = saveNamedTheme("Bay", colors("#223344"), "carbon", listId, null);
    const list = getState().lists.find((item) => item.id === listId);
    assert.equal(list?.theme?.texture, "carbon");
    assert.equal(list?.theme?.canvas, "#223344");
    assert.equal(list?.theme?.name, "Bay");
    const edited = saveNamedTheme("Bay door", colors("#445566"), "wood", listId, created);
    assert.equal(edited, created);
    const after = getState().lists.find((item) => item.id === listId);
    assert.equal(after?.theme?.texture, "wood");
    assert.equal(after?.theme?.canvas, "#445566");
    assert.equal(after?.theme?.name, "Bay door");
    const stored = reload();
    for (const copy of [stored.migrated, stored.revived]) {
      const kept: List | undefined = copy.lists.find((item) => item.id === listId);
      assert.equal(kept?.theme?.texture, "wood");
      assert.equal(kept?.theme?.name, "Bay door");
      assert.equal(kept?.theme?.canvas, "#445566");
      assert.equal(copy.settings.customThemes.find((theme) => theme.id === created)?.name, "Bay door");
    }
  });
});
