export type ListKind = "normal" | "fire-dept" | "daily";

export type ThemeId = "light" | "dark" | "contrast" | "pink" | "rugged";

export type TextureId =
  | "none"
  | "diamond"
  | "floral"
  | "brushed"
  | "carbon"
  | "wood"
  | "leather"
  | "hexagon"
  | "chevron"
  | "linen"
  | "dots";

export type ThemeColors = {
  canvas: string;
  surface: string;
  ink: string;
  muted: string;
  accent: string;
  onAccent: string;
  line: string;
  checked: string;
  button: string;
  morning: string;
  afternoon: string;
  evening: string;
};

export type CustomTheme = {
  id: string;
  name: string;
  texture: TextureId;
  colors: ThemeColors;
};

export type SyncStatus = "local" | "syncing" | "live" | "offline" | "reconnecting";

export type CalendarStatus = "ready" | "connected" | "expired" | "native";

export type Column = {
  id: string;
  name: string;
  order: number;
};

export type LastShift = {
  day: string;
  done: number;
  total: number;
};

/** onTime is how many checked items were finished by their due time. */
export type ShiftRecord = {
  day: string;
  done: number;
  total: number;
  onTime: number;
};

export type Task = {
  id: string;
  title: string;
  done: boolean;
  notes: string;
  notesDraft: string;
  notesOpen: boolean;
  editing: boolean;
  position: number;
  columnId: string;
  dueAt: string | null;
  leadMinutes: number | null;
  notificationIds: number[];
  calendarEventId: string | null;
  calendarPending: boolean;
  doneAt: string | null;
  onTime: boolean | null;
  updatedAt: string;
  deletedAt: string | null;
};

export type ListTheme = Record<string, string> | null;

export type List = {
  id: string;
  slug: string;
  name: string;
  position: number;
  kind: ListKind;
  columns: Column[];
  theme: ListTheme;
  lastShift: LastShift | null;
  shiftHistory: ShiftRecord[];
  updatedAt: string;
  deletedAt: string | null;
  inviteToken: string;
  shared: boolean;
  day: string | null;
  system: boolean;
  tasks: Task[];
};

export type Settings = {
  defaultTheme: ThemeId;
  texture: TextureId;
  customThemes: CustomTheme[];
  activeCustomId: string | null;
  calendarId: string;
  shiftMatch: string;
  fdLastResetDay: string | null;
  dailyEnabled: boolean;
  updatedAt: string;
};

export type PersistedV2 = {
  version: 2;
  activeId: string | null;
  lists: List[];
  settings: Settings;
};

export type UiState = PersistedV2 & {
  message: string;
  migrationError: string;
  sync: SyncStatus;
  syncDetail: string;
  calendar: CalendarStatus;
  calendarDetail: string;
  dailyError: string;
};

export const THEME_IDS: ThemeId[] = ["light", "dark", "contrast", "pink", "rugged"];

export const DAILY_ID = "00000000-0000-4000-8000-0000000000da";

export const KEY_V1 = "checklist.state.v1";
export const KEY_V1_BAK = "checklist.state.v1.bak";
export const KEY_V2 = "checklist.state.v2";
export const KEY_THEME = "checklist.theme";
export const KEY_TOKEN = "checklist.google.token";

export const TITLE_LIMIT = 200;
export const NOTES_LIMIT = 5000;
