/** List and task lookup shared by the screen's actions and the text parser. */

import type { List, Task } from "./types";

export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "list";
}

export function uniqueSlug(name: string, lists: List[]): string {
  const base = slugify(name);
  if (!lists.some((list) => list.slug === base)) return base;
  let n = 2;
  while (lists.some((list) => list.slug === `${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function findList(lists: List[], query: string): { list: List | null; ambiguous: boolean } {
  const q = query.trim().toLowerCase();
  if (!q) return { list: null, ambiguous: false };
  const exact = lists.filter((list) => list.slug.toLowerCase() === q || list.name.toLowerCase() === q);
  if (exact.length === 1) return { list: exact[0], ambiguous: false };
  if (exact.length > 1) return { list: null, ambiguous: true };
  const partial = lists.filter(
    (list) => list.slug.toLowerCase().startsWith(q) || list.name.toLowerCase().startsWith(q),
  );
  if (partial.length === 1) return { list: partial[0], ambiguous: false };
  if (partial.length > 1) return { list: null, ambiguous: true };
  return { list: null, ambiguous: false };
}

export function findTask(tasks: Task[], query: string): { task: Task | null; ambiguous: boolean } {
  const q = query.trim().toLowerCase();
  if (!q) return { task: null, ambiguous: false };
  const exact = tasks.filter((task) => task.title.toLowerCase() === q);
  if (exact.length === 1) return { task: exact[0], ambiguous: false };
  if (exact.length > 1) return { task: null, ambiguous: true };
  const starts = tasks.filter((task) => task.title.toLowerCase().startsWith(q));
  if (starts.length === 1) return { task: starts[0], ambiguous: false };
  if (starts.length > 1) return { task: null, ambiguous: true };
  const includes = tasks.filter((task) => task.title.toLowerCase().includes(q));
  if (includes.length === 1) return { task: includes[0], ambiguous: false };
  if (includes.length > 1) return { task: null, ambiguous: true };
  return { task: null, ambiguous: false };
}

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () =>
    Math.floor(Math.random() * 16).toString(16),
  );
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const TITLE_MAX = 200;
const NOTES_MAX = 5000;

export function clampTitle(value: string): string {
  return value.slice(0, TITLE_MAX);
}

export function clampNotes(value: string): string {
  return value.slice(0, NOTES_MAX);
}
