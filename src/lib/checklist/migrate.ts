import { completion } from "./score.ts";
import { presetTexture, readStoredTheme, sanitizeListTheme } from "./theme.ts";
import { dueToDueAt, easternDay, nowIso } from "./time.ts";
import {
  DAILY_ID,
  type Column,
  type List,
  type ListKind,
  type PersistedV2,
  type Settings,
  type Task,
  type ThemeId,
} from "./types.ts";

export { isThemeId, normalizeTheme, themeIdOf } from "./theme.ts";

export const EPOCH = "2026-01-01T00:00:00.000Z";

export function defaultColumns(): Column[] {
  return [
    { id: "col-morning", name: "Morning", order: 0 },
    { id: "col-afternoon", name: "Afternoon", order: 1 },
    { id: "col-evening", name: "Evening", order: 2 },
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "list"
  );
}

function isDaily(raw: Record<string, unknown>): boolean {
  return raw.system === true || raw.slug === "daily" || raw.id === DAILY_ID;
}

function kindOf(raw: Record<string, unknown>, name: string, slug: string): ListKind {
  if (isDaily(raw) || slug === "daily" || raw.kind === "daily") return "daily";
  if (raw.kind === "fire-dept" || raw.kind === "normal") return raw.kind;
  if (slug === "fire-dept" || /^fire\s*department$/i.test(name.trim())) return "fire-dept";
  return "normal";
}

function readColumns(raw: unknown): Column[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const columns: Column[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") continue;
    columns.push({
      id: entry.id,
      name: entry.name,
      order: typeof entry.order === "number" ? entry.order : columns.length,
    });
  }
  if (!columns.length) return null;
  return columns
    .sort((a, b) => a.order - b.order)
    .map((column, index) => ({ ...column, order: index }));
}

function migrateTask(raw: unknown, index: number, columnId: string, listUpdated: string): Task {
  const record = isRecord(raw) ? raw : {};
  const title = text(record.title, "Untitled").slice(0, 200) || "Untitled";
  const notes = text(record.notes);
  const due = dueToDueAt(record.dueAt ?? record.due);
  const notesWithDue =
    due.raw && !notes.includes(due.raw) ? (notes ? `${notes}\n(due: ${due.raw})` : `(due: ${due.raw})`) : notes;
  const id = text(record.id, `task-${index}-${slugify(title)}-${columnId}`);
  return {
    id,
    title,
    done: record.done === true,
    notes: notesWithDue,
    notesDraft: typeof record.notesDraft === "string" ? record.notesDraft : notesWithDue,
    notesOpen: record.notesOpen === true,
    editing: record.editing === true,
    position: typeof record.position === "number" ? record.position : index,
    columnId: text(record.columnId, columnId) || columnId,
    dueAt: due.dueAt,
    leadMinutes: typeof record.leadMinutes === "number" ? record.leadMinutes : null,
    notificationIds: Array.isArray(record.notificationIds)
      ? record.notificationIds.filter((item): item is number => typeof item === "number")
      : [],
    calendarEventId: typeof record.calendarEventId === "string" ? record.calendarEventId : null,
    calendarPending: record.calendarPending === true,
    doneAt: typeof record.doneAt === "string" ? record.doneAt : null,
    onTime: typeof record.onTime === "boolean" ? record.onTime : null,
    updatedAt: text(record.updatedAt, listUpdated),
    deletedAt: typeof record.deletedAt === "string" ? record.deletedAt : null,
  };
}

function migrateList(raw: unknown, index: number): List {
  const record = isRecord(raw) ? raw : {};
  const name = text(record.name, "Untitled").slice(0, 200) || "Untitled";
  const slug = text(record.slug, slugify(name)) || slugify(name);
  const updatedAt = text(record.updatedAt, EPOCH);
  const columns = readColumns(record.columns) ?? defaultColumns();
  const firstColumn = columns[0]?.id ?? "col-morning";
  const tasks = Array.isArray(record.tasks)
    ? record.tasks.map((task, taskIndex) => migrateTask(task, taskIndex, firstColumn, updatedAt))
    : [];
  const columnIds = new Set(columns.map((column) => column.id));
  const repaired = tasks.map((task) =>
    columnIds.has(task.columnId) ? task : { ...task, columnId: firstColumn },
  );
  const kind = kindOf(record, name, slug);
  const daily = kind === "daily";
  return {
    id: daily ? DAILY_ID : text(record.id, `list-${index}-${slug}`),
    slug: daily ? "daily" : slug,
    name: daily ? "Daily" : name,
    position: typeof record.position === "number" ? record.position : index,
    kind,
    columns,
    theme: sanitizeListTheme(record.theme),
    lastShift:
      isRecord(record.lastShift) &&
      typeof record.lastShift.day === "string" &&
      typeof record.lastShift.done === "number" &&
      typeof record.lastShift.total === "number"
        ? { day: record.lastShift.day, done: record.lastShift.done, total: record.lastShift.total }
        : null,
    shiftHistory: Array.isArray(record.shiftHistory)
      ? record.shiftHistory
          .filter(
            (entry): entry is { day: string; done: number; total: number; onTime: number } =>
              isRecord(entry) &&
              typeof entry.day === "string" &&
              typeof entry.done === "number" &&
              typeof entry.total === "number" &&
              typeof entry.onTime === "number",
          )
          .slice(-60)
      : [],
    updatedAt,
    deletedAt: typeof record.deletedAt === "string" ? record.deletedAt : null,
    inviteToken: text(record.inviteToken, text(record.id, `invite-${slug}`)),
    shared: record.shared === true,
    day: typeof record.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.day) ? record.day : null,
    system: daily,
    tasks: repaired,
  };
}

function defaultSettings(theme: ThemeId, dailyEnabled: boolean, updatedAt: string): Settings {
  return {
    defaultTheme: theme,
    texture: presetTexture(theme),
    customThemes: [],
    activeCustomId: null,
    calendarId: "primary",
    shiftMatch: "Fire department",
    fdLastResetDay: null,
    dailyEnabled,
    updatedAt,
  };
}

function pinDaily(lists: List[]): List[] {
  const index = lists.findIndex((list) => list.kind === "daily" || list.system || list.slug === "daily");
  if (index === -1) {
    const daily = migrateList(
      {
        id: DAILY_ID,
        slug: "daily",
        name: "Daily",
        inviteToken: "seed-daily-list",
        system: true,
        tasks: [],
        updatedAt: EPOCH,
      },
      0,
    );
    return [daily, ...lists];
  }
  const daily = lists[index];
  if (!daily) return lists;
  const pinned: List = {
    ...daily,
    id: DAILY_ID,
    slug: "daily",
    name: "Daily",
    kind: "daily",
    system: true,
  };
  return [pinned, ...lists.filter((_, listIndex) => listIndex !== index)];
}

export function normalizeList(raw: unknown, index = 0): List {
  return migrateList(raw, index);
}

/**
 * Pure upgrade from a v1 snapshot (or an already-shaped v2 object) to v2.
 * Does not touch storage. Invalid roots throw so the caller can keep v1.
 * Existing v2 positions are kept so a reload does not undo a drag.
 */
export function migrateV1toV2(input: unknown): PersistedV2 {
  if (!isRecord(input) || !Array.isArray(input.lists)) throw new Error("bad snapshot");
  const alreadyV2 = input.version === 2;
  let lists = input.lists.map((list, index) => migrateList(list, index));
  if (!alreadyV2) {
    lists = pinDaily(lists).map((list, index) => ({ ...list, position: index }));
  } else if (!lists.some((list) => list.kind === "daily")) {
    const [daily, ...rest] = pinDaily(lists);
    if (daily) {
      const min = rest.reduce((lowest, list) => Math.min(lowest, list.position), 0);
      lists = [{ ...daily, position: min - 1 }, ...rest];
    }
  }
  const stored = readStoredTheme(input.settings, input.theme);
  const dailyEnabled = input.dailyEnabled === true || (isRecord(input.settings) && input.settings.dailyEnabled === true);
  const settingsRecord = isRecord(input.settings) ? input.settings : null;
  const settings: Settings = {
    ...defaultSettings(stored.defaultTheme, dailyEnabled, text(settingsRecord?.updatedAt, EPOCH)),
    texture: stored.texture,
    customThemes: stored.customThemes,
    activeCustomId: stored.activeCustomId,
    calendarId: text(settingsRecord?.calendarId, "primary") || "primary",
    shiftMatch: text(settingsRecord?.shiftMatch, "Fire department") || "Fire department",
    fdLastResetDay: typeof settingsRecord?.fdLastResetDay === "string" ? settingsRecord.fdLastResetDay : null,
  };
  const activeId = typeof input.activeId === "string" ? input.activeId : null;
  const visible = lists.filter((list) => !list.deletedAt);
  const resolved =
    activeId && lists.some((list) => list.id === activeId)
      ? activeId
      : (visible.find((list) => list.kind === "fire-dept")?.id ?? visible[0]?.id ?? null);
  return { version: 2, activeId: resolved, lists, settings };
}

export function stampScore(list: List, when = new Date()): List {
  const stats = completion(list.tasks);
  const day = easternDay(when);
  const history = [
    ...list.shiftHistory.filter((entry) => entry.day !== day),
    { day, done: stats.done, total: stats.total, onTime: stats.onTime },
  ].slice(-60);
  return {
    ...list,
    lastShift: { day, done: stats.done, total: stats.total },
    shiftHistory: history,
    updatedAt: nowIso(),
  };
}
