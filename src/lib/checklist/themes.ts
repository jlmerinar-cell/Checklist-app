/** Theme switcher. Applies a body class and stores the choice locally. */

import type { Theme } from "./types";

export const THEME_KEY = "checklist.theme";

export const THEMES: Theme[] = ["light", "dark", "contrast", "pink", "rugged"];

const CLASSES = THEMES.map((theme) => `theme-${theme}`);

export function parseTheme(value: string): Theme | null {
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (normalized === "light") return "light";
  if (normalized === "dark") return "dark";
  if (normalized === "contrast" || normalized === "high-contrast" || normalized === "highcontrast") {
    return "contrast";
  }
  if (normalized === "pink" || normalized === "floral" || normalized === "girly" || normalized === "flower") {
    return "pink";
  }
  if (
    normalized === "rugged" ||
    normalized === "masculine" ||
    normalized === "leather" ||
    normalized === "forest"
  ) {
    return "rugged";
  }
  return null;
}

export function themeClass(theme: Theme): string {
  return `theme-${theme}`;
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.body.classList.remove(...CLASSES);
  document.body.classList.add(themeClass(theme));
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
}
