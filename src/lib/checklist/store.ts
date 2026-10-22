import { listsForSwitcher } from "./chrome.ts";
import { defaultColumns, migrateV1toV2, normalizeList, themeIdOf } from "./migrate.ts";
import {
  appearanceFor,
  applyAppearance,
  packTheme,
  presetTexture,
  themeRecordFromCustom,
  unpackTheme,
  type Appearance,
} from "./theme.ts";
import { byPosition, moveByDir, moveToIndex, placeInColumn } from "./order.ts";
import { isFireList, resetShiftList } from "./shift.ts";
import { dueAtFromParts, easternDay, nowIso } from "./time.ts";
import {
  DAILY_ID,
  KEY_THEME,
  KEY_V1,
  KEY_V1_BAK,
  KEY_V2,
  NOTES_LIMIT,
  TITLE_LIMIT,
  type CalendarStatus,
  type List,
  type PersistedV2,
  type Settings,
  type SyncStatus,
  type Task,
  type TextureId,
  type ThemeColors,
  type ThemeId,
  type UiState,
} from "./types.ts";

const SEED_STAMP = "2026-01-01T00:00:00.000Z";

function task(
  id: string,
  title: string,
  columnId: string,
  position: number,
  extra: boolean | Partial<Pick<Task, "done" | "notes" | "notesOpen" | "dueAt" | "doneAt" | "onTime">> = false,
): Task {
  const patch = typeof extra === "boolean" ? { done: extra } : extra;
  const notes = patch.notes ?? "";
  return {
    id,
    title,
    done: patch.done ?? false,
    notes,
    notesDraft: notes,
    notesOpen: patch.notesOpen ?? false,
    editing: false,
    position,
    columnId,
    dueAt: patch.dueAt ?? null,
    leadMinutes: null,
    notificationIds: [],
    calendarEventId: null,
    calendarPending: false,
    doneAt: patch.doneAt ?? null,
    onTime: patch.onTime ?? null,
    updatedAt: SEED_STAMP,
    deletedAt: null,
  };
}

function makeList(
  id: string,
  slug: string,
  name: string,
  position: number,
  kind: List["kind"],
  tasks: Task[],
  system = false,
): List {
  return {
    id,
    slug,
    name,
    position,
    kind,
    columns: defaultColumns(),
    theme: null,
    lastShift: null,
    shiftHistory: [],
    updatedAt: SEED_STAMP,
    deletedAt: null,
    inviteToken: `seed-${slug}`,
    shared: false,
    day: null,
    system,
    tasks,
  };
}

export function seedPersisted(): PersistedV2 {
  const morning = "col-morning";
  const afternoon = "col-afternoon";
  const evening = "col-evening";
  const today = easternDay();
  const nine = dueAtFromParts(today, "09:00");
  const two = dueAtFromParts(today, "14:00");
  const doneAt = nine ?? SEED_STAMP;
  return {
    version: 2,
    activeId: "22222222-2222-4222-8222-222222222222",
    settings: {
      defaultTheme: "dark",
      texture: "none",
      customThemes: [],
      activeCustomId: null,
      calendarId: "primary",
      shiftMatch: "Fire department",
      fdLastResetDay: null,
      dailyEnabled: false,
      updatedAt: SEED_STAMP,
    },
    lists: [
      makeList(DAILY_ID, "daily", "Daily", 0, "daily", [], true),
      makeList("11111111-1111-4111-8111-111111111111", "barbershop", "Barbershop", 1, "normal", [
        task("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "Saturday open until 5", morning, 0, {
          notes: "Stay until 5 for after-work cuts and school kids.",
        }),
        task("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", "Check tomorrow's bookings", morning, 1, true),
        task("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", "Reset chairs and sweep", afternoon, 0),
        task("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4", "Confirm Saturday hours", evening, 0),
      ]),
      makeList("22222222-2222-4222-8222-222222222222", "fire-dept", "Fire department", 2, "fire-dept", [
        task("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", "Check hydrant map", morning, 0, {
          notes: "Quincy Hill: black bonnets are dead. Relay from the four orange tops.",
          notesOpen: true,
          dueAt: nine,
        }),
        task("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", "Quincy Hill relay", morning, 1, {
          done: true,
          doneAt,
          onTime: true,
        }),
        task("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", "Engine check and medical bag", morning, 2),
        task("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4", "Parkland Place standpipe", afternoon, 0, { dueAt: two }),
        task("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5", "High-rise assignment review", afternoon, 1),
        task("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb6", "Restock the medical kit", evening, 0, { done: true, doneAt }),
      ]),
      makeList("33333333-3333-4333-8333-333333333333", "personal", "Personal", 3, "normal", [
        task("cccccccc-cccc-4ccc-8ccc-ccccccccccc1", "EMT patient assessment sheet", morning, 0),
        task("cccccccc-cccc-4ccc-8ccc-ccccccccccc2", "Review CAB and primary survey", afternoon, 0),
      ]),
    ],
  };
}

const SAMPLE_LIST_IDS = new Set([
  DAILY_ID,
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
]);
/** Titles, checks, and notes from the pre-1.4.1 sample. A due time was not part of it. */
const ORIGINAL_TASKS = new Map<string, { title: string; done: boolean; notes: string }>([
  ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", { title: "Saturday open until 5", done: false, notes: "" }],
  ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", { title: "Check tomorrow's bookings", done: true, notes: "" }],
  ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", { title: "Check hydrant map", done: false, notes: "" }],
  ["bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", { title: "Quincy Hill relay", done: true, notes: "" }],
  ["cccccccc-cccc-4ccc-8ccc-ccccccccccc1", { title: "EMT skill sheets", done: false, notes: "" }],
]);

/**
 * The first shipped sample was five tasks. Replace only that exact sample.
 * A changed title, check, note, or due time means someone edited it.
 */
function isUntouchedSample(data: PersistedV2): boolean {
  const lists = data.lists.filter((list) => !list.deletedAt);
  if (lists.length !== 4 || !lists.every((list) => SAMPLE_LIST_IDS.has(list.id))) return false;
  const tasks = lists.flatMap((list) => list.tasks.filter((item) => !item.deletedAt));
  if (tasks.length !== ORIGINAL_TASKS.size) return false;
  return tasks.every((item) => {
    const original = ORIGINAL_TASKS.get(item.id);
    return (
      original !== undefined &&
      item.title === original.title &&
      item.done === original.done &&
      item.notes.trim() === original.notes &&
      !item.dueAt
    );
  });
}

/**
 * Read a saved snapshot the way a reload does.
 * The original sample lists can be replaced, but a saved theme or texture stays.
 */
export function reviveStored(raw: unknown): PersistedV2 {
  const data = migrateV1toV2(raw);
  if (!isUntouchedSample(data)) return data;
  const fresh = seedPersisted();
  return {
    ...fresh,
    settings: data.settings,
    lists: fresh.lists.map((list) => {
      const previous = data.lists.find((item) => item.id === list.id);
      return previous?.theme ? { ...list, theme: previous.theme } : list;
    }),
  };
}

function withUi(data: PersistedV2, extra: Partial<UiState> = {}): UiState {
  return {
    ...data,
    message: "",
    migrationError: "",
    sync: "local",
    syncDetail: "",
    calendar: "ready",
    calendarDetail: "",
    dailyError: "",
    ...extra,
  };
}

const seed = withUi(seedPersisted());
let state: UiState = seed;
let hydrated = false;
let canPersist = true;
const listeners = new Set<() => void>();
const dataHooks = new Set<() => void>();

export function getState(): UiState {
  return state;
}

export function getSeed(): UiState {
  return seed;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function onData(listener: () => void): () => void {
  dataHooks.add(listener);
  return () => dataHooks.delete(listener);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(): void {
  if (!canPersist || typeof localStorage === "undefined") return;
  const payload: PersistedV2 = {
    version: 2,
    activeId: state.activeId,
    lists: state.lists,
    settings: state.settings,
  };
  try {
    localStorage.setItem(KEY_V2, JSON.stringify(payload));
    localStorage.setItem(KEY_THEME, state.settings.defaultTheme);
  } catch {
    /* ignore quota */
  }
}

function commit(next: UiState, opts: { persist?: boolean; sync?: boolean } = {}): void {
  state = next;
  paintTheme();
  if (opts.persist !== false && hydrated) persist();
  emit();
  if (opts.sync && hydrated) {
    for (const hook of dataHooks) hook();
  }
}

function paintTheme(): void {
  applyAppearance(appearanceFor(activeList(), state.settings));
}

export function currentAppearance(current = state): Appearance {
  return appearanceFor(activeList(current), current.settings);
}

export function visibleLists(lists: List[] = state.lists): List[] {
  return byPosition(lists.filter((list) => !list.deletedAt));
}

export function columnsOf(list: List): List["columns"] {
  const columns = [...list.columns].sort((a, b) => a.order - b.order);
  return columns.length ? columns : defaultColumns();
}

export function tasksIn(list: List, columnId?: string): Task[] {
  return byPosition(
    list.tasks.filter((item) => !item.deletedAt && (columnId === undefined || item.columnId === columnId)),
  );
}

export function activeList(current = state): List | null {
  return visibleLists(current.lists).find((list) => list.id === current.activeId) ?? null;
}

function touchSettings(settings: Settings, patch: Partial<Settings>): Settings {
  return { ...settings, ...patch, updatedAt: nowIso() };
}

function updateList(id: string, fn: (list: List) => List, sync = true): void {
  const lists = state.lists.map((list) => (list.id === id ? fn(list) : list));
  commit({ ...state, lists }, { sync });
}

function uuid(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `xxxxxxxx-xxxx-4xxx-8xxx-${Math.random().toString(16).slice(2, 14)}`.replace(/x/g, () =>
        Math.floor(Math.random() * 16).toString(16),
      );
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "list"
  );
}

export function uniqueSlug(name: string, lists: List[], ignoreId?: string): string {
  const base = slugify(name);
  const taken = new Set(lists.filter((list) => list.id !== ignoreId && !list.deletedAt).map((list) => list.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function loadFromStorage(): { data: PersistedV2; migrationError: string } | null {
  if (typeof localStorage === "undefined") return { data: seedPersisted(), migrationError: "" };
  const v2raw = localStorage.getItem(KEY_V2);
  if (v2raw) {
    try {
      const data = reviveStored(JSON.parse(v2raw));
      return { data, migrationError: "" };
    } catch {
      canPersist = false;
      return {
        data: seedPersisted(),
        migrationError: "Couldn't read saved lists. Still using the previous copy.",
      };
    }
  }
  const v1raw = localStorage.getItem(KEY_V1);
  if (!v1raw) return { data: seedPersisted(), migrationError: "" };
  try {
    localStorage.setItem(KEY_V1_BAK, v1raw);
  } catch {
    /* ignore */
  }
  try {
    return { data: migrateV1toV2(JSON.parse(v1raw)), migrationError: "" };
  } catch {
    canPersist = false;
    return {
      data: seedPersisted(),
      migrationError: "Couldn't upgrade saved lists. Still using the previous format.",
    };
  }
}

export function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const loaded = loadFromStorage();
  if (!loaded) return;
  state = withUi(loaded.data, { migrationError: loaded.migrationError });
  paintTheme();
  if (canPersist) persist();
  emit();
}

export function setMessage(message: string): void {
  if (state.message === message) return;
  commit({ ...state, message }, { persist: false, sync: false });
}

export function setSyncStatus(sync: SyncStatus, syncDetail = ""): void {
  if (state.sync === sync && state.syncDetail === syncDetail) return;
  commit({ ...state, sync, syncDetail }, { persist: false, sync: false });
}

export function setCalendarStatus(calendar: CalendarStatus, calendarDetail = state.calendarDetail): void {
  if (state.calendar === calendar && state.calendarDetail === calendarDetail) return;
  commit({ ...state, calendar, calendarDetail }, { persist: false, sync: false });
}

export function setDailyError(dailyError: string): void {
  if (state.dailyError === dailyError) return;
  commit({ ...state, dailyError }, { persist: false, sync: false });
}

export function setTheme(theme: ThemeId): void {
  commit(
    {
      ...state,
      settings: touchSettings(state.settings, {
        defaultTheme: theme,
        texture: presetTexture(theme),
        activeCustomId: null,
      }),
    },
    { sync: true },
  );
}

export function setListTheme(listId: string, theme: ThemeId | null): void {
  const list = state.lists.find((item) => item.id === listId);
  if (!list || list.deletedAt) return;
  if (theme === null) {
    if (list.theme === null) return;
    updateList(listId, (current) => ({ ...current, theme: null, updatedAt: nowIso() }));
    return;
  }
  if (themeIdOf(list.theme) === theme && list.theme && Object.keys(list.theme).length === 1) return;
  updateList(listId, (current) => ({
    ...current,
    theme: { id: theme },
    updatedAt: nowIso(),
  }));
}

const DRAFT_THEME_ID = "custom-draft";

function upsertCustom(
  themes: Settings["customThemes"],
  theme: Settings["customThemes"][number],
): Settings["customThemes"] {
  const without = themes.filter((item) => item.id !== theme.id);
  return [...without, theme].slice(-12);
}

export function applyTexture(target: "app" | string, texture: TextureId, editingId?: string | null): void {
  if (target === "app") {
    const explicit = arguments.length >= 3;
    let customThemes = state.settings.customThemes;
    let activeCustomId = state.settings.activeCustomId;
    if (explicit && editingId && editingId !== DRAFT_THEME_ID) {
      const editing = customThemes.find((theme) => theme.id === editingId);
      if (editing) {
        customThemes = upsertCustom(customThemes, { ...editing, texture });
        activeCustomId = editing.id;
      }
    } else if (explicit) {
      if (activeCustomId === DRAFT_THEME_ID) {
        const draft = customThemes.find((theme) => theme.id === DRAFT_THEME_ID);
        if (draft) customThemes = upsertCustom(customThemes, { ...draft, texture });
      } else {
        activeCustomId = null;
      }
    } else {
      const active = customThemes.find((theme) => theme.id === activeCustomId);
      if (active) customThemes = upsertCustom(customThemes, { ...active, texture });
    }
    commit(
      { ...state, settings: touchSettings(state.settings, { texture, customThemes, activeCustomId }) },
      { sync: true },
    );
    return;
  }
  const list = state.lists.find((item) => item.id === target && !item.deletedAt);
  if (!list) return;
  const base = list.theme ?? {};
  updateList(target, (current) => ({
    ...current,
    theme: { ...base, texture },
    updatedAt: nowIso(),
  }));
}

export function applyEditedTheme(
  target: "app" | string,
  colors: ThemeColors,
  texture: TextureId,
  editingId?: string | null,
): void {
  if (target === "app") {
    const saved =
      editingId && editingId !== DRAFT_THEME_ID
        ? state.settings.customThemes.find((theme) => theme.id === editingId)
        : undefined;
    const currentId =
      saved?.id ?? (editingId === undefined ? (state.settings.activeCustomId ?? DRAFT_THEME_ID) : DRAFT_THEME_ID);
    const existing = state.settings.customThemes.find((theme) => theme.id === currentId);
    const custom = {
      id: currentId,
      name: existing?.name ?? "Custom",
      texture,
      colors,
    };
    commit(
      {
        ...state,
        settings: touchSettings(state.settings, {
          texture,
          activeCustomId: currentId,
          customThemes: upsertCustom(state.settings.customThemes, custom),
        }),
      },
      { sync: true },
    );
    return;
  }
  const list = state.lists.find((item) => item.id === target && !item.deletedAt);
  if (!list) return;
  updateList(target, (current) => ({
    ...current,
    theme: { id: current.theme?.id && !themeIdOf(current.theme) ? current.theme.id : DRAFT_THEME_ID, name: current.theme?.name || "Custom", texture, ...colors },
    updatedAt: nowIso(),
  }));
}

export function selectSavedTheme(target: "app" | string, customId: string): void {
  const custom = state.settings.customThemes.find((theme) => theme.id === customId);
  if (!custom) return;
  if (target === "app") {
    commit(
      {
        ...state,
        settings: touchSettings(state.settings, {
          activeCustomId: custom.id,
          texture: custom.texture,
        }),
      },
      { sync: true },
    );
    return;
  }
  setListThemeRecord(target, themeRecordFromCustom(custom));
}

export function saveNamedTheme(
  name: string,
  colors: ThemeColors,
  texture: TextureId,
  target: "app" | string,
  editingId?: string | null,
): string {
  const existing =
    editingId && editingId !== DRAFT_THEME_ID
      ? state.settings.customThemes.find((theme) => theme.id === editingId)
      : undefined;
  const custom = {
    id: existing?.id ?? uuid(),
    name: name.trim().slice(0, 40) || "Custom",
    texture,
    colors,
  };
  const customThemes = upsertCustom(
    state.settings.customThemes.filter((theme) => theme.id !== DRAFT_THEME_ID),
    custom,
  );
  if (target === "app") {
    commit(
      {
        ...state,
        settings: touchSettings(state.settings, {
          customThemes,
          activeCustomId: custom.id,
          texture,
        }),
      },
      { sync: true },
    );
  } else {
    commit({ ...state, settings: touchSettings(state.settings, { customThemes }) }, { sync: true });
    setListThemeRecord(target, themeRecordFromCustom(custom));
  }
  return custom.id;
}

export function deleteCustomTheme(customId: string): void {
  const customThemes = state.settings.customThemes.filter((theme) => theme.id !== customId);
  const activeCustomId = state.settings.activeCustomId === customId ? null : state.settings.activeCustomId;
  const texture =
    activeCustomId === null && state.settings.activeCustomId === customId
      ? presetTexture(state.settings.defaultTheme)
      : state.settings.texture;
  commit(
    { ...state, settings: touchSettings(state.settings, { customThemes, activeCustomId, texture }) },
    { sync: true },
  );
}

export function setListThemeRecord(listId: string, theme: Record<string, string> | null): void {
  const list = state.lists.find((item) => item.id === listId);
  if (!list || list.deletedAt) return;
  updateList(listId, (current) => ({ ...current, theme, updatedAt: nowIso() }));
}

export function setCalendarId(calendarId: string): void {
  const trimmed = calendarId.trim().slice(0, 200) || "primary";
  if (trimmed === state.settings.calendarId) return;
  commit({ ...state, settings: touchSettings(state.settings, { calendarId: trimmed }) }, { sync: true });
}

export function setShiftMatch(shiftMatch: string): void {
  const trimmed = shiftMatch.trim().slice(0, 80) || "Fire department";
  if (trimmed === state.settings.shiftMatch) return;
  commit({ ...state, settings: touchSettings(state.settings, { shiftMatch: trimmed }) }, { sync: true });
}

export function setActive(id: string): void {
  if (!state.lists.some((list) => list.id === id && !list.deletedAt)) return;
  commit({ ...state, activeId: id }, { sync: false });
}

export function createList(name: string): List {
  const trimmed = name.trim().slice(0, TITLE_LIMIT);
  const label = trimmed || "New list";
  const list = makeList(uuid(), uniqueSlug(label, state.lists), label, visibleLists().length, "normal", []);
  list.updatedAt = nowIso();
  list.inviteToken = uuid();
  commit({ ...state, lists: [...state.lists, list], activeId: list.id }, { sync: true });
  return list;
}

export function markShared(id: string): void {
  updateList(id, (list) => ({ ...list, shared: true, updatedAt: nowIso() }));
}

export function renameList(id: string, name: string): string | null {
  const list = state.lists.find((item) => item.id === id);
  if (!list) return "List not found.";
  if (list.system) return "Daily can't be renamed.";
  const trimmed = name.trim().slice(0, TITLE_LIMIT);
  if (!trimmed) return "A list needs a name.";
  const slug = uniqueSlug(trimmed, state.lists, id);
  updateList(id, (current) => ({ ...current, name: trimmed, slug, updatedAt: nowIso() }));
  return null;
}

export function deleteList(id: string): string | null {
  const list = state.lists.find((item) => item.id === id);
  if (!list) return "List not found.";
  if (list.system) return "Daily can't be deleted.";
  const stamp = nowIso();
  const lists = state.lists.map((item) =>
    item.id === id
      ? {
          ...item,
          deletedAt: stamp,
          updatedAt: stamp,
          tasks: item.tasks.map((task) => (task.deletedAt ? task : { ...task, deletedAt: stamp, updatedAt: stamp })),
        }
      : item,
  );
  const shown = listsForSwitcher(visibleLists(lists), state.settings.dailyEnabled);
  const nextActive = state.activeId === id ? (shown[0]?.id ?? null) : state.activeId;
  commit({ ...state, lists, activeId: nextActive }, { sync: true });
  return null;
}

function writeListOrder(orderedIds: string[]): void {
  const positions = new Map(orderedIds.map((id, index) => [id, index]));
  const lists = state.lists.map((list) =>
    positions.has(list.id) ? { ...list, position: positions.get(list.id) ?? list.position, updatedAt: nowIso() } : list,
  );
  commit({ ...state, lists }, { sync: true });
}

export function moveListTo(id: string, oneBased: number): string | null {
  if (!Number.isInteger(oneBased) || oneBased < 1) return "Pick a position of 1 or more.";
  const visible = visibleLists();
  const next = moveToIndex(visible, id, oneBased - 1);
  if (!next) return "List not found.";
  writeListOrder(next.map((list) => list.id));
  return null;
}

export function moveListByDrop(activeId: string, overId: string): void {
  const visible = visibleLists();
  const overIndex = visible.findIndex((list) => list.id === overId);
  if (overIndex < 0) return;
  const next = moveToIndex(visible, activeId, overIndex);
  if (!next) return;
  writeListOrder(next.map((list) => list.id));
}

export function moveListByDir(id: string, dir: -1 | 1): void {
  const visible = visibleLists();
  const next = moveByDir(visible, id, dir);
  if (!next) return;
  writeListOrder(next.map((list) => list.id));
}

export function addTask(listId: string, title: string): Task | null {
  const trimmed = title.trim().slice(0, TITLE_LIMIT);
  if (!trimmed) return null;
  const list = state.lists.find((item) => item.id === listId);
  if (!list) return null;
  const columnId = columnsOf(list)[0]?.id ?? "col-morning";
  const position = tasksIn(list, columnId).length;
  const created: Task = {
    ...task(uuid(), trimmed, columnId, position),
    updatedAt: nowIso(),
  };
  updateList(listId, (current) => ({
    ...current,
    updatedAt: nowIso(),
    tasks: [...current.tasks, created],
  }));
  return created;
}

export function setTitle(listId: string, taskId: string, title: string): void {
  const trimmed = title.slice(0, TITLE_LIMIT);
  updateList(listId, (list) => ({
    ...list,
    updatedAt: nowIso(),
    tasks: list.tasks.map((item) =>
      item.id === taskId
        ? {
            ...item,
            title: trimmed,
            updatedAt: nowIso(),
            calendarPending: item.calendarPending || !!(item.dueAt || item.calendarEventId),
          }
        : item,
    ),
  }));
}

export function setDone(listId: string, taskId: string, done?: boolean): void {
  updateList(listId, (list) => {
    const tasks = list.tasks.map((item) => {
      if (item.id !== taskId) return item;
      const next = done ?? !item.done;
      if (!next) {
        return { ...item, done: false, doneAt: null, onTime: null, updatedAt: nowIso() };
      }
      const doneAt = nowIso();
      const onTime = item.dueAt ? Date.parse(doneAt) <= Date.parse(item.dueAt) : null;
      return { ...item, done: true, doneAt, onTime, updatedAt: doneAt };
    });
    return { ...list, tasks, updatedAt: nowIso() };
  });
}

export function deleteTask(listId: string, taskId: string): void {
  const stamp = nowIso();
  updateList(listId, (list) => ({
    ...list,
    updatedAt: stamp,
    tasks: list.tasks.map((item) => (item.id === taskId ? { ...item, deletedAt: stamp, updatedAt: stamp } : item)),
  }));
}

export function setNotificationIds(listId: string, taskId: string, notificationIds: number[]): void {
  const list = state.lists.find((item) => item.id === listId);
  const current = list?.tasks.find((item) => item.id === taskId);
  if (!current) return;
  if (
    current.notificationIds.length === notificationIds.length &&
    current.notificationIds.every((id, index) => id === notificationIds[index])
  ) {
    return;
  }
  const lists = state.lists.map((item) =>
    item.id === listId
      ? {
          ...item,
          tasks: item.tasks.map((task) => (task.id === taskId ? { ...task, notificationIds } : task)),
        }
      : item,
  );
  commit({ ...state, lists }, { sync: false });
}

let lastFireStart = 0;
let fireUndo: { lists: List[]; fdLastResetDay: string | null } | null = null;

export function startFireList(when = new Date()): { ok: boolean; message: string } {
  const nowMs = Date.now();
  if (nowMs - lastFireStart < 1500) {
    const message = state.message || "Started the fire department list.";
    return { ok: true, message };
  }
  const targets = state.lists.filter((list) => isFireList(list));
  if (!targets.length) {
    const message = "No fire department list to start.";
    setMessage(message);
    return { ok: false, message };
  }
  lastFireStart = nowMs;
  fireUndo = {
    lists: structuredClone(state.lists),
    fdLastResetDay: state.settings.fdLastResetDay,
  };
  const day = easternDay(when);
  const ids = new Set(targets.map((list) => list.id));
  const lists = state.lists.map((list) => (ids.has(list.id) ? resetShiftList(list, when) : list));
  const primary = lists.find((list) => ids.has(list.id));
  const summary = primary?.lastShift ? `${primary.lastShift.done} of ${primary.lastShift.total}` : "cleared";
  const message = `Started the fire department list. Last shift: ${summary}.`;
  commit(
    {
      ...state,
      lists,
      settings: touchSettings(state.settings, { fdLastResetDay: day }),
      message,
    },
    { sync: true },
  );
  return { ok: true, message };
}

export function undoFireStart(): { ok: boolean; message: string } {
  if (!fireUndo) {
    const message = "Nothing to undo.";
    setMessage(message);
    return { ok: false, message };
  }
  const snapshot = fireUndo;
  fireUndo = null;
  lastFireStart = 0;
  const message = "Undid the list start. Checks are back.";
  commit(
    {
      ...state,
      lists: snapshot.lists,
      settings: touchSettings(state.settings, { fdLastResetDay: snapshot.fdLastResetDay }),
      message,
    },
    { sync: true },
  );
  return { ok: true, message };
}

export function setNotesDraft(listId: string, taskId: string, notes: string): void {
  const draft = notes.slice(0, NOTES_LIMIT);
  updateList(
    listId,
    (list) => ({
      ...list,
      tasks: list.tasks.map((item) => (item.id === taskId ? { ...item, notesDraft: draft } : item)),
    }),
    false,
  );
}

export function saveNotes(listId: string, taskId: string, notes?: string): void {
  updateList(listId, (list) => ({
    ...list,
    updatedAt: nowIso(),
    tasks: list.tasks.map((item) => {
      if (item.id !== taskId) return item;
      const next = (notes ?? item.notesDraft).slice(0, NOTES_LIMIT);
      const changed = next !== item.notes;
      return {
        ...item,
        notes: next,
        notesDraft: next,
        updatedAt: nowIso(),
        calendarPending: item.calendarPending || (changed && !!(item.dueAt || item.calendarEventId)),
      };
    }),
  }));
}

export function setNotesOpen(listId: string, taskId: string, open: boolean): void {
  const lists = state.lists.map((list) => ({
    ...list,
    tasks: list.tasks.map((item) => ({
      ...item,
      notesOpen: list.id === listId && item.id === taskId ? open : item.notesOpen,
    })),
  }));
  commit({ ...state, lists }, { sync: false });
}

export function setEditing(listId: string, taskId: string, editing: boolean): void {
  const lists = state.lists.map((list) => ({
    ...list,
    tasks: list.tasks.map((item) => ({
      ...item,
      editing: list.id === listId && item.id === taskId && editing,
    })),
  }));
  commit({ ...state, lists }, { sync: false });
}

export function setDueAt(listId: string, taskId: string, dueAt: string | null): void {
  updateList(listId, (list) => ({
    ...list,
    updatedAt: nowIso(),
    tasks: list.tasks.map((item) =>
      item.id === taskId ? { ...item, dueAt, calendarPending: true, updatedAt: nowIso() } : item,
    ),
  }));
}

export function setTaskColumn(listId: string, taskId: string, columnId: string): void {
  updateList(listId, (list) => {
    if (!list.columns.some((column) => column.id === columnId)) return list;
    const ids = tasksIn(list, columnId).map((item) => item.id);
    const order = placeInColumn(ids, taskId, `drop:${columnId}`);
    return applyColumnOrder(list, columnId, order);
  });
}

export function setCalendarLink(listId: string, taskId: string, eventId: string | null, pending: boolean): void {
  updateList(
    listId,
    (list) => ({
      ...list,
      tasks: list.tasks.map((item) =>
        item.id === taskId ? { ...item, calendarEventId: eventId, calendarPending: pending, updatedAt: nowIso() } : item,
      ),
      updatedAt: nowIso(),
    }),
    true,
  );
}

function applyColumnOrder(list: List, columnId: string, ids: string[]): List {
  const positions = new Map(ids.map((id, index) => [id, index]));
  return {
    ...list,
    updatedAt: nowIso(),
    tasks: list.tasks.map((item) =>
      positions.has(item.id)
        ? { ...item, columnId, position: positions.get(item.id) ?? item.position, updatedAt: nowIso() }
        : item,
    ),
  };
}

export function moveTaskTo(listId: string, taskId: string, oneBased: number): string | null {
  if (!Number.isInteger(oneBased) || oneBased < 1) return "Pick a position of 1 or more.";
  const list = state.lists.find((item) => item.id === listId);
  const taskItem = list?.tasks.find((item) => item.id === taskId && !item.deletedAt);
  if (!list || !taskItem) return "Task not found.";
  const columnTasks = tasksIn(list, taskItem.columnId);
  const next = moveToIndex(columnTasks, taskId, oneBased - 1);
  if (!next) return "Task not found.";
  updateList(listId, (current) => applyColumnOrder(current, taskItem.columnId, next.map((item) => item.id)));
  return null;
}

export function moveTaskByDir(listId: string, taskId: string, dir: -1 | 1): void {
  const list = state.lists.find((item) => item.id === listId);
  const taskItem = list?.tasks.find((item) => item.id === taskId && !item.deletedAt);
  if (!list || !taskItem) return;
  const next = moveByDir(tasksIn(list, taskItem.columnId), taskId, dir);
  if (!next) return;
  updateList(listId, (current) => applyColumnOrder(current, taskItem.columnId, next.map((item) => item.id)));
}

export function moveTaskByDrop(listId: string, taskId: string, overId: string): void {
  const list = state.lists.find((item) => item.id === listId);
  const taskItem = list?.tasks.find((item) => item.id === taskId && !item.deletedAt);
  if (!list || !taskItem) return;
  let columnId = taskItem.columnId;
  if (overId.startsWith("drop:")) columnId = overId.slice(5);
  else {
    const over = list.tasks.find((item) => item.id === overId && !item.deletedAt);
    if (!over) return;
    columnId = over.columnId;
  }
  if (!list.columns.some((column) => column.id === columnId)) return;
  const ids = tasksIn(list, columnId).map((item) => item.id);
  const order = placeInColumn(ids, taskId, overId);
  updateList(listId, (current) => applyColumnOrder(current, columnId, order));
}

export function renameColumn(listId: string, columnId: string, name: string): void {
  const trimmed = name.slice(0, 40);
  updateList(listId, (list) => ({
    ...list,
    updatedAt: nowIso(),
    columns: list.columns.map((column) => (column.id === columnId ? { ...column, name: trimmed } : column)),
  }));
}

export function addColumn(listId: string, name: string): string | null {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) return "A column needs a name.";
  updateList(listId, (list) => ({
    ...list,
    updatedAt: nowIso(),
    columns: [...columnsOf(list), { id: uuid(), name: trimmed, order: columnsOf(list).length }],
  }));
  return null;
}

/** Where a removed column's tasks go: the next column, or the previous one when this is last. */
export function destinationColumn<T extends { id: string }>(columns: T[], columnId: string): T | null {
  const index = columns.findIndex((column) => column.id === columnId);
  if (index < 0 || columns.length < 2) return null;
  return columns[index + 1] ?? columns[index - 1] ?? null;
}

export function removeColumn(listId: string, columnId: string): string | null {
  const list = state.lists.find((item) => item.id === listId);
  if (!list) return "List not found.";
  const columns = columnsOf(list);
  if (columns.length <= 1) return "A list keeps at least one column.";
  const nextColumn = destinationColumn(columns, columnId);
  if (!nextColumn) return "A list keeps at least one column.";
  const remaining = columns.filter((column) => column.id !== columnId).map((column, order) => ({ ...column, order }));
  updateList(listId, (current) => ({
    ...current,
    updatedAt: nowIso(),
    columns: remaining,
    tasks: current.tasks.map((item) =>
      item.columnId === columnId ? { ...item, columnId: nextColumn.id, updatedAt: nowIso() } : item,
    ),
  }));
  return null;
}

export function moveColumn(listId: string, columnId: string, dir: -1 | 1): void {
  const list = state.lists.find((item) => item.id === listId);
  if (!list) return;
  const columns = columnsOf(list);
  const next = moveByDir(columns, columnId, dir);
  if (!next) return;
  updateList(listId, (current) => ({
    ...current,
    updatedAt: nowIso(),
    columns: next.map((column, order) => ({ ...column, order })),
  }));
}

export function setDailyEnabled(enabled: boolean): void {
  const active = state.lists.find((list) => list.id === state.activeId);
  const leaveDaily = !enabled && active?.kind === "daily";
  const nextActive = leaveDaily
    ? (visibleLists().find((list) => list.kind !== "daily")?.id ?? state.activeId)
    : state.activeId;
  commit(
    {
      ...state,
      activeId: nextActive,
      settings: touchSettings(state.settings, { dailyEnabled: enabled }),
      dailyError: enabled ? state.dailyError : "",
    },
    { sync: true },
  );
}

export function setDailyTasks(day: string, tasks: Task[], clearFirst: boolean): void {
  updateList(DAILY_ID, (list) => {
    const sameDay = list.day === day;
    const merged = tasks.map((item) => {
      const previous = sameDay ? list.tasks.find((taskItem) => taskItem.id === item.id) : undefined;
      if (!previous) return item;
      const dirty = previous.notesDraft !== previous.notes;
      return {
        ...item,
        done: previous.done,
        notes: previous.notes,
        notesDraft: dirty ? previous.notesDraft : previous.notes,
        notesOpen: previous.notesOpen,
        editing: previous.editing,
        doneAt: previous.doneAt,
        onTime: previous.onTime,
      };
    });
    return {
      ...list,
      tasks: clearFirst && !sameDay ? merged : merged,
      day,
      updatedAt: nowIso(),
    };
  });
}

export function clearDailyDay(day: string): void {
  const daily = state.lists.find((list) => list.kind === "daily");
  if (!daily?.day || daily.day === day) return;
  updateList(daily.id, (list) => ({ ...list, tasks: [], day, updatedAt: nowIso() }));
}

export function replaceImported(lists: List[], theme?: ThemeId, dailyEnabled?: boolean): void {
  const withoutDaily = lists.filter((list) => list.kind !== "daily" && list.slug !== "daily");
  const daily = state.lists.find((list) => list.kind === "daily") ?? seedPersisted().lists[0];
  const next = [daily, ...withoutDaily].filter((list): list is List => !!list).map((list, index) => ({
    ...list,
    position: index,
  }));
  commit(
    {
      ...state,
      lists: next,
      activeId: next.find((list) => list.kind !== "daily")?.id ?? next[0]?.id ?? null,
      settings: touchSettings(state.settings, {
        ...(theme ? { defaultTheme: theme } : {}),
        ...(typeof dailyEnabled === "boolean" ? { dailyEnabled } : {}),
      }),
    },
    { sync: true },
  );
}

export type RemoteList = {
  id: string;
  name: string;
  slug: string | null;
  kind: string;
  position: number;
  columns: unknown;
  theme: unknown;
  last_shift: unknown;
  shift_history: unknown;
  updated_at: string;
  deleted_at: string | null;
};

export type RemoteTask = {
  id: string;
  list_id: string;
  column_id: string | null;
  title: string;
  done: boolean;
  notes: string;
  position: number;
  due_at: string | null;
  lead_minutes: number | null;
  done_at: string | null;
  on_time: boolean | null;
  calendar_event_id: string | null;
  updated_at: string;
  deleted_at: string | null;
};

export type RemoteSettings = {
  default_theme: unknown;
  calendar_id: string | null;
  shift_match: string | null;
  fd_last_reset_day: string | null;
  updated_at: string;
};

function newer(remote: string, local: string): boolean {
  const remoteTime = Date.parse(remote);
  const localTime = Date.parse(local);
  if (Number.isNaN(remoteTime)) return false;
  if (Number.isNaN(localTime)) return true;
  return remoteTime > localTime;
}

export function mergeRemote(lists: RemoteList[], tasks: RemoteTask[], settings: RemoteSettings | null): void {
  let nextLists = state.lists.map((list) => ({ ...list, tasks: list.tasks.map((item) => ({ ...item })) }));
  for (const remote of lists) {
    const base = normalizeList(
      {
        id: remote.id,
        name: remote.name,
        slug: remote.slug ?? slugify(remote.name),
        kind: remote.kind,
        position: remote.position,
        columns: remote.columns,
        theme: remote.theme,
        lastShift: remote.last_shift,
        shiftHistory: remote.shift_history,
        updatedAt: remote.updated_at,
        deletedAt: remote.deleted_at,
        tasks: [],
      },
      0,
    );
    const incoming =
      nextLists.find((list) => list.id === remote.id) ??
      (base.kind === "daily" ? nextLists.find((list) => list.kind === "daily") : undefined);
    if (!incoming) {
      nextLists = [...nextLists, { ...base, tasks: [] }];
      continue;
    }
    if (newer(remote.updated_at, incoming.updatedAt)) {
      nextLists = nextLists.map((list) =>
        list.id === incoming.id
          ? {
              ...list,
              ...base,
              id: list.id,
              slug: list.kind === "daily" ? list.slug : base.slug,
              name: list.kind === "daily" ? list.name : base.name,
              tasks: list.tasks,
              inviteToken: list.inviteToken,
              shared: list.shared,
              day: list.day,
              system: list.system || base.kind === "daily",
            }
          : list,
      );
    }
  }
  for (const remote of tasks) {
    const list = nextLists.find((item) => item.id === remote.list_id);
    if (!list) continue;
    const current = list.tasks.find((item) => item.id === remote.id);
    const columnId = remote.column_id || columnsOf(list)[0]?.id || "col-morning";
    const incoming: Task = {
      id: remote.id,
      title: remote.title,
      done: remote.done === true,
      notes: remote.notes ?? "",
      notesDraft: remote.notes ?? "",
      notesOpen: false,
      editing: false,
      position: remote.position ?? 0,
      columnId,
      dueAt: remote.due_at,
      leadMinutes: remote.lead_minutes,
      notificationIds: current?.notificationIds ?? [],
      calendarEventId: remote.calendar_event_id,
      calendarPending: current?.calendarPending ?? false,
      doneAt: remote.done_at,
      onTime: remote.on_time,
      updatedAt: remote.updated_at,
      deletedAt: remote.deleted_at,
    };
    if (!current) {
      list.tasks = [...list.tasks, incoming];
      continue;
    }
    if (newer(remote.updated_at, current.updatedAt)) {
      const keepDraft = current.notesDraft !== current.notes;
      list.tasks = list.tasks.map((item) =>
        item.id === remote.id
          ? {
              ...incoming,
              notesDraft: keepDraft ? current.notesDraft : incoming.notes,
              notesOpen: current.notesOpen,
              editing: current.editing,
              notificationIds: current.notificationIds,
            }
          : item,
      );
    }
  }
  let nextSettings = state.settings;
  if (settings && newer(settings.updated_at, state.settings.updatedAt)) {
    const unpacked = unpackTheme(settings.default_theme, { customThemes: state.settings.customThemes });
    nextSettings = {
      ...state.settings,
      defaultTheme: unpacked.defaultTheme,
      texture: unpacked.texture,
      customThemes: unpacked.customThemes,
      activeCustomId: unpacked.activeCustomId,
      calendarId: settings.calendar_id || "primary",
      shiftMatch: settings.shift_match || "Fire department",
      fdLastResetDay: settings.fd_last_reset_day,
      updatedAt: settings.updated_at,
    };
  }
  const activeStillThere = nextLists.some((list) => list.id === state.activeId && !list.deletedAt);
  commit(
    {
      ...state,
      lists: nextLists,
      settings: nextSettings,
      activeId: activeStillThere ? state.activeId : (visibleLists(nextLists)[0]?.id ?? null),
    },
    { sync: false },
  );
}

export function snapshot(): PersistedV2 {
  return { version: 2, activeId: state.activeId, lists: state.lists, settings: state.settings };
}
