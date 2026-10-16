/** Shared checklist shapes. UI, storage, calendar, sharing, and the bot all use these. */

export type Theme = "light" | "dark" | "contrast" | "pink" | "rugged";

export type SyncState = "local" | "offline" | "syncing" | "live" | "reconnecting";

export type CalendarState = "off" | "ready" | "connected" | "expired";

export type Task = {
  id: string;
  title: string;
  done: boolean;
  /** Committed notes. Collaborators see this, not the draft. */
  notes: string;
  /** What the notes box shows. Written to notes only when Save is tapped. */
  notesDraft: string;
  due: string | null;
  calendarEventId: string | null;
  /** Local only. True until this device finishes the Google Calendar write. */
  calendarPending: boolean;
  notesOpen: boolean;
  editing: boolean;
  /** Last committed edit. Draft notes do not move this. Last-write-wins sync uses it. */
  updatedAt: string;
};

export type List = {
  id: string;
  slug: string;
  name: string;
  inviteToken: string;
  shared: boolean;
  updatedAt: string;
  /** Local calendar day (YYYY-MM-DD) this list was filled for. Daily only. */
  day: string | null;
  /** Built-in list. Daily cannot be renamed or deleted. */
  system: boolean;
  tasks: Task[];
};

export type Snapshot = {
  lists: List[];
  activeId: string | null;
  theme: Theme;
  message: string;
  sync: SyncState;
  syncDetail: string;
  calendar: CalendarState;
  /** Morning fill of the Daily tab from Google Calendar. */
  dailyEnabled: boolean;
  /** Shown in the status line when the morning read fails. */
  dailyError: string;
};

export type RemoteTask = {
  id: string;
  title: string;
  done: boolean;
  notes: string;
  due: string | null;
  calendarEventId: string | null;
};

export type RemoteList = {
  id: string;
  slug: string;
  name: string;
  inviteToken: string;
  updatedAt: string;
  tasks: RemoteTask[];
};

export type ActionResult = {
  ok: boolean;
  message: string;
  ref?: string;
};
