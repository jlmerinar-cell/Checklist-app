import {
  THEME_IDS,
  type CustomTheme,
  type List,
  type ListTheme,
  type Settings,
  type TextureId,
  type ThemeColors,
  type ThemeId,
} from "./types.ts";

export const COLOR_KEYS = [
  "canvas",
  "surface",
  "ink",
  "muted",
  "accent",
  "onAccent",
  "line",
  "checked",
  "button",
  "morning",
  "afternoon",
  "evening",
] as const satisfies readonly (keyof ThemeColors)[];

export const COLOR_FIELDS: { key: keyof ThemeColors; label: string }[] = [
  { key: "canvas", label: "App background" },
  { key: "surface", label: "List background" },
  { key: "morning", label: "Morning column" },
  { key: "afternoon", label: "Afternoon column" },
  { key: "evening", label: "Evening column" },
  { key: "ink", label: "Text" },
  { key: "muted", label: "Muted text" },
  { key: "accent", label: "Accent" },
  { key: "button", label: "Buttons" },
  { key: "onAccent", label: "Button label" },
  { key: "line", label: "Borders and dividers" },
  { key: "checked", label: "Checked item" },
];

export const TEXTURE_IDS: TextureId[] = [
  "none",
  "diamond",
  "floral",
  "brushed",
  "carbon",
  "wood",
  "leather",
  "hexagon",
  "chevron",
  "linen",
  "dots",
];

export const TEXTURES: { id: TextureId; label: string }[] = [
  { id: "none", label: "None" },
  { id: "diamond", label: "Diamond plate" },
  { id: "floral", label: "Floral" },
  { id: "brushed", label: "Brushed metal" },
  { id: "carbon", label: "Carbon fiber" },
  { id: "wood", label: "Wood grain" },
  { id: "leather", label: "Leather" },
  { id: "hexagon", label: "Hexagon" },
  { id: "chevron", label: "Chevron" },
  { id: "linen", label: "Linen" },
  { id: "dots", label: "Dots" },
];

export const PRESET_LABELS: { id: ThemeId; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "contrast", label: "Contrast" },
  { id: "pink", label: "Pink" },
  { id: "rugged", label: "Rugged" },
];

const CSS_VARS: Record<keyof ThemeColors, string> = {
  canvas: "--color-canvas",
  surface: "--color-surface",
  ink: "--color-ink",
  muted: "--color-muted",
  accent: "--color-accent",
  onAccent: "--color-on-accent",
  line: "--color-line",
  checked: "--color-checked",
  button: "--color-button",
  morning: "--color-morning",
  afternoon: "--color-afternoon",
  evening: "--color-evening",
};

export type Preset = { label: string; texture: TextureId; colors: ThemeColors };

export const PRESETS: Record<ThemeId, Preset> = {
  light: {
    label: "Light",
    texture: "none",
    colors: {
      canvas: "#f3efe4",
      surface: "#fffdf8",
      ink: "#1a1814",
      muted: "#5c564c",
      accent: "#8a5a00",
      onAccent: "#fffdf8",
      line: "#8a8070",
      checked: "#1f7a3a",
      button: "#8a5a00",
      morning: "#b9d4f5",
      afternoon: "#f6c98a",
      evening: "#e3c0f0",
    },
  },
  dark: {
    label: "Dark",
    texture: "none",
    colors: {
      canvas: "#14120e",
      surface: "#1e1c16",
      ink: "#f6f1e6",
      muted: "#a39b8c",
      accent: "#e2a31a",
      onAccent: "#14120e",
      line: "#6a6254",
      checked: "#3d8f4a",
      button: "#c4840e",
      morning: "#1d4e89",
      afternoon: "#8a4b12",
      evening: "#5b2d6e",
    },
  },
  contrast: {
    label: "Contrast",
    texture: "none",
    colors: {
      canvas: "#000000",
      surface: "#000000",
      ink: "#ffffff",
      muted: "#ffffff",
      accent: "#ffe500",
      onAccent: "#000000",
      line: "#ffffff",
      checked: "#00e05a",
      button: "#ffe500",
      morning: "#1a4fff",
      afternoon: "#ff7a00",
      evening: "#c400e0",
    },
  },
  pink: {
    label: "Pink",
    texture: "floral",
    colors: {
      canvas: "#fff1f5",
      surface: "#ffe4ee",
      ink: "#4a1030",
      muted: "#6e2a46",
      accent: "#9d1848",
      onAccent: "#fff7f9",
      line: "#c47a96",
      checked: "#0f7a45",
      button: "#9d1848",
      morning: "#f7c1d6",
      afternoon: "#f3a0c0",
      evening: "#e7b6ea",
    },
  },
  rugged: {
    label: "Rugged",
    texture: "diamond",
    colors: {
      canvas: "#1c1a17",
      surface: "#2a2622",
      ink: "#f4efe6",
      muted: "#c8bba6",
      accent: "#1f6b38",
      onAccent: "#f4efe6",
      line: "#6b6256",
      checked: "#d4a017",
      button: "#1f6b38",
      morning: "#3d5c3a",
      afternoon: "#6a4428",
      evening: "#3a3f55",
    },
  },
};

export type Appearance = {
  source: string;
  label: string;
  texture: TextureId;
  colors: ThemeColors;
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function isHex(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as string[]).includes(value);
}

export function isTextureId(value: unknown): value is TextureId {
  return typeof value === "string" && (TEXTURE_IDS as string[]).includes(value);
}

export function normalizeTheme(value: unknown): ThemeId {
  if (typeof value !== "string") return "dark";
  const token = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (token === "light") return "light";
  if (token === "dark") return "dark";
  if (token === "contrast" || token === "high-contrast" || token === "highcontrast") return "contrast";
  if (token === "pink" || token === "floral" || token === "girly" || token === "flower") return "pink";
  if (token === "rugged" || token === "masculine" || token === "leather" || token === "forest") return "rugged";
  return "dark";
}

/** A list theme overrides the app theme. Null means use the app default. */
export function themeIdOf(theme: { id?: string } | null): ThemeId | null {
  if (!theme || typeof theme.id !== "string" || !isThemeId(theme.id)) return null;
  return theme.id;
}

export function presetTexture(theme: ThemeId): TextureId {
  return PRESETS[theme].texture;
}

export function inkFor(hex: string): string {
  if (!isHex(hex)) return "#14120e";
  const n = Number.parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luma > 0.62 ? "#14120e" : "#f6f1e6";
}

export function columnSlotFor(columnId: string, index: number): "morning" | "afternoon" | "evening" {
  if (columnId === "col-morning") return "morning";
  if (columnId === "col-afternoon") return "afternoon";
  if (columnId === "col-evening") return "evening";
  const slots = ["morning", "afternoon", "evening"] as const;
  return slots[index % 3] ?? "morning";
}

function cloneColors(colors: ThemeColors): ThemeColors {
  return { ...colors };
}

function colorsFrom(record: Record<string, unknown>, base: ThemeColors): ThemeColors {
  const colors = cloneColors(base);
  for (const key of COLOR_KEYS) {
    if (isHex(record[key])) colors[key] = record[key];
  }
  return colors;
}

function hasOwnColors(record: Record<string, unknown>): boolean {
  return COLOR_KEYS.some((key) => isHex(record[key]));
}

export function sanitizeColors(value: unknown, base: ThemeColors = PRESETS.dark.colors): ThemeColors {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return colorsFrom(record, base);
}

export function sanitizeCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return [];
  const themes: CustomTheme[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || !record.id.trim()) continue;
    const colors = record.colors && typeof record.colors === "object" ? (record.colors as Record<string, unknown>) : record;
    themes.push({
      id: record.id.slice(0, 80),
      name: typeof record.name === "string" && record.name.trim() ? record.name.trim().slice(0, 40) : "Custom",
      texture: isTextureId(record.texture) ? record.texture : "none",
      colors: sanitizeColors(colors),
    });
    if (themes.length >= 12) break;
  }
  return themes;
}

export type StoredTheme = Pick<Settings, "defaultTheme" | "texture" | "customThemes" | "activeCustomId">;

/** Read a theme saved as a preset name or as the jsonb object sync stores. */
export function unpackTheme(value: unknown, keep?: { customThemes?: CustomTheme[] }): StoredTheme {
  if (typeof value === "string" || value == null) {
    const defaultTheme = normalizeTheme(value);
    return {
      defaultTheme,
      texture: presetTexture(defaultTheme),
      customThemes: keep?.customThemes ?? [],
      activeCustomId: null,
    };
  }
  if (typeof value !== "object") return unpackTheme(null, keep);
  const record = value as Record<string, unknown>;
  const preset = normalizeTheme(record.preset ?? record.id ?? record.defaultTheme);
  const customThemes = sanitizeCustomThemes(record.customThemes);
  const activeRaw = record.activeCustomId;
  const activeCustomId = typeof activeRaw === "string" && customThemes.some((theme) => theme.id === activeRaw) ? activeRaw : null;
  const texture = isTextureId(record.texture)
    ? record.texture
    : activeCustomId
      ? (customThemes.find((theme) => theme.id === activeCustomId)?.texture ?? presetTexture(preset))
      : presetTexture(preset);
  return { defaultTheme: preset, texture, customThemes, activeCustomId };
}

export function readStoredTheme(settings: unknown, legacyTheme: unknown): StoredTheme {
  const record = settings && typeof settings === "object" ? (settings as Record<string, unknown>) : null;
  const packed = unpackTheme(record?.defaultTheme ?? legacyTheme);
  if (!record) return packed;
  const customThemes = Array.isArray(record.customThemes) ? sanitizeCustomThemes(record.customThemes) : packed.customThemes;
  const defaultTheme = typeof record.defaultTheme === "string" ? normalizeTheme(record.defaultTheme) : packed.defaultTheme;
  const activeCustomId =
    record.activeCustomId === null
      ? null
      : typeof record.activeCustomId === "string" && customThemes.some((theme) => theme.id === record.activeCustomId)
        ? record.activeCustomId
        : packed.activeCustomId;
  const texture = isTextureId(record.texture) ? record.texture : activeCustomId ? packed.texture : presetTexture(defaultTheme);
  const fromActive = activeCustomId ? customThemes.find((theme) => theme.id === activeCustomId) : undefined;
  return {
    defaultTheme,
    texture: fromActive && !isTextureId(record.texture) ? fromActive.texture : texture,
    customThemes,
    activeCustomId,
  };
}

export function packTheme(settings: Settings): Record<string, unknown> {
  return {
    id: settings.activeCustomId ?? settings.defaultTheme,
    preset: settings.defaultTheme,
    texture: settings.texture,
    activeCustomId: settings.activeCustomId,
    customThemes: settings.customThemes,
  };
}

export function sanitizeListTheme(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== "string") continue;
    if (key === "id") out.id = entry.slice(0, 80);
    else if (key === "name") out.name = entry.slice(0, 40);
    else if (key === "texture" && isTextureId(entry)) out.texture = entry;
    else if ((COLOR_KEYS as readonly string[]).includes(key) && isHex(entry)) out[key] = entry;
  }
  return Object.keys(out).length ? out : null;
}

export function themeRecordFromCustom(custom: CustomTheme): Record<string, string> {
  return {
    id: custom.id,
    name: custom.name,
    texture: custom.texture,
    ...custom.colors,
  };
}

export function appAppearance(settings: Settings): Appearance {
  if (settings.activeCustomId) {
    const custom = settings.customThemes.find((theme) => theme.id === settings.activeCustomId);
    if (custom) {
      return { source: custom.id, label: custom.name, texture: custom.texture, colors: cloneColors(custom.colors) };
    }
  }
  const preset = PRESETS[settings.defaultTheme] ?? PRESETS.dark;
  const texture = isTextureId(settings.texture) ? settings.texture : preset.texture;
  return { source: settings.defaultTheme, label: preset.label, texture, colors: cloneColors(preset.colors) };
}

function appearanceFromRecord(record: Record<string, string>, settings: Settings): Appearance {
  const id = record.id ?? "";
  const preset = isThemeId(id) ? PRESETS[id] : null;
  if (preset && !hasOwnColors(record)) {
    return {
      source: id,
      label: preset.label,
      texture: isTextureId(record.texture) ? record.texture : preset.texture,
      colors: cloneColors(preset.colors),
    };
  }
  const base = preset ? preset.colors : appAppearance({ ...settings, activeCustomId: null }).colors;
  return {
    source: id || "custom",
    label: record.name || preset?.label || "Custom",
    texture: isTextureId(record.texture) ? record.texture : preset?.texture || appAppearance(settings).texture,
    colors: colorsFrom(record, base),
  };
}

/** List theme wins. A null list theme uses the app default, colors and texture included. */
export function appearanceFor(list: List | null, settings: Settings): Appearance {
  if (list?.theme && Object.keys(list.theme).length) return appearanceFromRecord(list.theme, settings);
  return appAppearance(settings);
}

export function listSelection(theme: ListTheme): string {
  if (!theme) return "default";
  if (theme.id && isThemeId(theme.id) && !hasOwnColors(theme)) return theme.id;
  return theme.id || "custom";
}

export function applyAppearance(appearance: Appearance): void {
  if (typeof document === "undefined") return;
  const body = document.body;
  if (!body) return;
  for (const id of THEME_IDS) body.classList.remove(`theme-${id}`);
  body.classList.remove("theme-custom", "scheme-light");
  if (isThemeId(appearance.source)) body.classList.add(`theme-${appearance.source}`);
  else body.classList.add("theme-custom");
  if (inkFor(appearance.colors.canvas) === "#14120e") body.classList.add("scheme-light");
  for (const key of COLOR_KEYS) body.style.setProperty(CSS_VARS[key], appearance.colors[key]);
  body.dataset.texture = appearance.texture;
}

function bootScript(): string {
  const payload = JSON.stringify({ presets: PRESETS, vars: CSS_VARS, textures: TEXTURE_IDS });
  return `(function(){var P=${payload};function hex(v){return typeof v==="string"&&/^#[0-9a-fA-F]{6}$/.test(v);}function light(c){if(!hex(c))return false;var n=parseInt(c.slice(1),16);var r=(n>>16)&255,g=(n>>8)&255,b=n&255;return (0.2126*r+0.7152*g+0.0722*b)/255>0.62;}function own(t){var keys=["canvas","surface","ink","muted","accent","onAccent","line","checked","button","morning","afternoon","evening"];for(var i=0;i<keys.length;i++){if(hex(t[keys[i]]))return true;}return false;}try{var raw=localStorage.getItem("checklist.state.v2");var parsed=raw?JSON.parse(raw):null;var settings=parsed&&parsed.settings||{};var lists=parsed&&parsed.lists||[];var active=null;if(parsed){for(var i=0;i<lists.length;i++){if(lists[i]&&lists[i].id===parsed.activeId&&!lists[i].deletedAt)active=lists[i];}}var baseId=typeof settings.defaultTheme==="string"&&P.presets[settings.defaultTheme]?settings.defaultTheme:"dark";if(!parsed){var saved=localStorage.getItem("checklist.theme");if(saved&&P.presets[saved])baseId=saved;}var base=P.presets[baseId];var colors={};for(var k in base.colors)colors[k]=base.colors[k];var texture=typeof settings.texture==="string"?settings.texture:base.texture;var customs=Array.isArray(settings.customThemes)?settings.customThemes:[];var custom=null;if(typeof settings.activeCustomId==="string"){for(var c=0;c<customs.length;c++){if(customs[c]&&customs[c].id===settings.activeCustomId)custom=customs[c];}}if(custom&&custom.colors){colors={};for(var ck in custom.colors)colors[ck]=custom.colors[ck];if(custom.texture)texture=custom.texture;}var theme=active&&active.theme;var klass=custom?"custom":baseId;if(theme&&typeof theme==="object"){if(theme.id&&P.presets[theme.id]&&!own(theme)){var preset=P.presets[theme.id];colors={};for(var pk in preset.colors)colors[pk]=preset.colors[pk];texture=theme.texture||preset.texture;klass=theme.id;}else{var start=theme.id&&P.presets[theme.id]?P.presets[theme.id].colors:colors;var next={};for(var sk in start)next[sk]=start[sk];var slots=["canvas","surface","ink","muted","accent","onAccent","line","checked","button","morning","afternoon","evening"];for(var s=0;s<slots.length;s++){if(hex(theme[slots[s]]))next[slots[s]]=theme[slots[s]];}colors=next;if(theme.texture)texture=theme.texture;klass="custom";}}if(P.textures.indexOf(texture)<0)texture="none";var body=document.body;["light","dark","contrast","pink","rugged"].forEach(function(id){body.classList.remove("theme-"+id);});body.classList.remove("theme-custom","scheme-light");if(klass==="custom")body.classList.add("theme-custom");else body.classList.add("theme-"+klass);if(light(colors.canvas))body.classList.add("scheme-light");Object.keys(P.vars).forEach(function(key){if(colors[key])body.style.setProperty(P.vars[key],colors[key]);});body.dataset.texture=texture;}catch(e){document.body.classList.add("theme-dark");}})();`;
}

export const themeBoot: string = bootScript();
