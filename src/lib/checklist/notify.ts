import { isNativeShell } from "./calendar.ts";
import { getState, onData, setMessage, setNotificationIds } from "./store.ts";

const MAX_WEB_DELAY = 7 * 24 * 60 * 60 * 1000;
const LEAD_MS = 10 * 60 * 1000;

export const EXACT_ALARM_HINT =
  "Android blocked exact alarms, so reminders may arrive a few minutes late. Allow them under Settings → Apps → Checklist → Alarms & reminders.";

export type PlannedReminder = {
  kind: "lead" | "due";
  at: string;
  title: string;
  body: string;
};

export type ReminderTask = {
  key: string;
  title: string;
  dueAt: string | null;
  done: boolean;
  deleted: boolean;
  notificationIds: number[];
};

export type ReminderPlugin = {
  schedule: (options: {
    notifications: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean } }[];
  }) => Promise<unknown>;
  cancel: (options: { notifications: { id: number }[] }) => Promise<unknown>;
  checkExactNotificationSetting?: () => Promise<{ exact_alarm: string }>;
};

type Arm = { signature: string; ids: number[] };

export type ScheduledNote = { id: number; title: string; body: string; at: string };

export type ApplyResult = {
  writes: { key: string; ids: number[] }[];
  scheduled: ScheduledNote[];
  cancelled: number[];
  hint: string | null;
  hintShown: boolean;
};

export function formatReminderClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Due-time alert plus a 10-minute lead, for an unchecked task that is still ahead. */
export function planReminders(
  task: { title: string; dueAt: string | null; done: boolean; deleted?: boolean },
  now: Date,
): PlannedReminder[] {
  if (task.done || task.deleted || !task.dueAt) return [];
  const dueMs = Date.parse(task.dueAt);
  if (!Number.isFinite(dueMs) || dueMs <= now.getTime()) return [];
  const name = task.title.trim() || "Task";
  const clock = formatReminderClock(task.dueAt);
  const planned: PlannedReminder[] = [];
  const leadAt = dueMs - LEAD_MS;
  if (leadAt > now.getTime()) {
    planned.push({
      kind: "lead",
      at: new Date(leadAt).toISOString(),
      title: "Checklist",
      body: `${name} is due in 10 minutes`,
    });
  }
  planned.push({
    kind: "due",
    at: new Date(dueMs).toISOString(),
    title: "Checklist",
    body: `Checklist: ${name} is due at ${clock}`,
  });
  return planned;
}

function planKey(planned: PlannedReminder[]): string {
  return planned.map((item) => `${item.kind}:${item.at}:${item.body}`).join("|");
}

function sameIds(left: number[], right: number[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export async function applyReminders(options: {
  tasks: ReminderTask[];
  now: Date;
  plugin: ReminderPlugin;
  armed: Map<string, Arm>;
  hintShown: boolean;
  native: boolean;
  allow: boolean;
  nextId: () => number;
  armWeb?: (title: string, body: string, at: string) => number | null;
}): Promise<ApplyResult> {
  const writes: { key: string; ids: number[] }[] = [];
  const scheduled: ScheduledNote[] = [];
  const cancelled: number[] = [];
  let hint: string | null = null;
  let hintShown = options.hintShown;
  const wantsAny = options.allow && options.tasks.some((task) => planReminders(task, options.now).length > 0);
  if (options.native && wantsAny && !hintShown && options.plugin.checkExactNotificationSetting) {
    try {
      const status = await options.plugin.checkExactNotificationSetting();
      if (status.exact_alarm === "denied") {
        hint = EXACT_ALARM_HINT;
        hintShown = true;
      }
    } catch {
      /* older builds have no exact-alarm setting */
    }
  }
  for (const task of options.tasks) {
    const planned = options.allow ? planReminders(task, options.now) : [];
    const signature = planKey(planned);
    const previous = options.armed.get(task.key);
    if (
      planned.length > 0 &&
      previous &&
      previous.signature === signature &&
      previous.ids.length === planned.length &&
      sameIds(previous.ids, task.notificationIds)
    ) {
      continue;
    }
    const stale = [...new Set([...task.notificationIds, ...(previous?.ids ?? [])])];
    if (stale.length) {
      if (options.native) {
        try {
          await options.plugin.cancel({ notifications: stale.map((id) => ({ id })) });
        } catch {
          /* cancel is best-effort */
        }
      } else {
        for (const id of stale) window.clearTimeout(id);
      }
      cancelled.push(...stale);
    }
    if (!planned.length) {
      options.armed.delete(task.key);
      if (task.notificationIds.length) writes.push({ key: task.key, ids: [] });
      continue;
    }
    const ids: number[] = [];
    if (options.native) {
      const notifications = planned.map((item) => {
        const id = options.nextId();
        ids.push(id);
        return { id, title: item.title, body: item.body, schedule: { at: new Date(item.at), allowWhileIdle: true } };
      });
      try {
        await options.plugin.schedule({ notifications });
        for (const note of notifications) {
          scheduled.push({ id: note.id, title: note.title, body: note.body, at: note.schedule.at.toISOString() });
        }
      } catch {
        ids.length = 0;
      }
    } else if (options.armWeb) {
      for (const item of planned) {
        const id = options.armWeb(item.title, item.body, item.at);
        if (id !== null) {
          ids.push(id);
          scheduled.push({ id, title: item.title, body: item.body, at: item.at });
        }
      }
    }
    options.armed.set(task.key, { signature, ids });
    writes.push({ key: task.key, ids: [...ids] });
  }
  return { writes, scheduled, cancelled, hint, hintShown };
}

type LocalPlugin = ReminderPlugin & {
  checkPermissions: () => Promise<{ display: string }>;
  requestPermissions: () => Promise<{ display: string }>;
};

const armed = new Map<string, Arm>();
let asked = false;
let debounce: number | null = null;
let running = false;
let queued = false;
let exactHintShown = false;

async function plugin(): Promise<LocalPlugin> {
  const mod = await import("@capacitor/local-notifications");
  return mod.LocalNotifications as LocalPlugin;
}

function onDevice(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.Capacitor?.isNativePlatform === "function") return window.Capacitor.isNativePlatform();
  return isNativeShell();
}

function notificationWord(value: string): "granted" | "denied" | "prompt" {
  if (value === "granted" || value === "denied") return value;
  if (value === "prompt" || value === "default") return "prompt";
  return "denied";
}

/** Ask the phone (Android) or the browser for notification permission. */
export async function requestNotificationAccess(): Promise<"granted" | "denied" | "prompt" | "unavailable"> {
  try {
    if (onDevice()) {
      const notifications = await plugin();
      const current = await notifications.checkPermissions();
      if (current.display === "granted") return "granted";
      const next = await notifications.requestPermissions();
      return notificationWord(next.display);
    }
    if (typeof Notification === "undefined") return "unavailable";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    return notificationWord(await Notification.requestPermission());
  } catch {
    return "unavailable";
  }
}

async function allowed(): Promise<boolean> {
  try {
    if (onDevice()) {
      const notifications = await plugin();
      const current = await notifications.checkPermissions();
      if (current.display === "granted") return true;
      if (asked) return false;
      asked = true;
      const next = await notifications.requestPermissions();
      return next.display === "granted";
    }
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    if (asked) return false;
    asked = true;
    return (await Notification.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

function nextNativeId(used: Set<number>): number {
  let id = Math.floor(Math.random() * 1_000_000_000) + 1;
  while (used.has(id)) id = Math.floor(Math.random() * 1_000_000_000) + 1;
  used.add(id);
  return id;
}

function armWeb(title: string, body: string, at: string): number | null {
  const delay = Date.parse(at) - Date.now();
  if (!Number.isFinite(delay) || delay <= 0 || delay > MAX_WEB_DELAY) return null;
  try {
    return window.setTimeout(() => {
      try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification(title, { body });
        }
      } catch {
        /* Notification can throw if the browser dropped permission */
      }
    }, delay);
  } catch {
    return null;
  }
}

export async function reconcileNotifications(): Promise<void> {
  const canNotify = await allowed();
  const data = getState();
  const used = new Set<number>();
  for (const list of data.lists) {
    for (const task of list.tasks) for (const id of task.notificationIds) used.add(id);
  }
  const tasks: (ReminderTask & { listId: string; taskId: string })[] = [];
  for (const list of data.lists) {
    for (const task of list.tasks) {
      tasks.push({
        key: `${list.id}:${task.id}`,
        listId: list.id,
        taskId: task.id,
        title: task.title,
        dueAt: task.dueAt,
        done: task.done,
        deleted: Boolean(list.deletedAt || task.deletedAt),
        notificationIds: task.notificationIds,
      });
    }
  }
  const native = onDevice();
  const result = await applyReminders({
    tasks,
    now: new Date(),
    plugin: native ? await plugin() : { schedule: async () => {}, cancel: async () => {} },
    armed,
    hintShown: exactHintShown,
    native,
    allow: canNotify,
    nextId: () => nextNativeId(used),
    armWeb,
  });
  exactHintShown = result.hintShown;
  if (result.hint) setMessage(result.hint);
  for (const write of result.writes) {
    const task = tasks.find((item) => item.key === write.key);
    if (task) setNotificationIds(task.listId, task.taskId, write.ids);
  }
}

function requestNotificationSync(): void {
  if (typeof window === "undefined") return;
  if (debounce) window.clearTimeout(debounce);
  debounce = window.setTimeout(() => {
    debounce = null;
    void run();
  }, 400);
}

async function run(): Promise<void> {
  if (running) {
    queued = true;
    return;
  }
  running = true;
  try {
    await reconcileNotifications();
  } catch {
    /* notifications are optional; a failure must not blank the list */
  } finally {
    running = false;
    if (queued) {
      queued = false;
      requestNotificationSync();
    }
  }
}

export function startNotifications(): () => void {
  if (typeof window === "undefined") return () => {};
  const stopData = onData(() => requestNotificationSync());
  requestNotificationSync();
  const onVisible = () => {
    if (document.visibilityState === "visible") requestNotificationSync();
  };
  window.addEventListener("focus", onVisible);
  document.addEventListener("visibilitychange", onVisible);
  const interval = window.setInterval(() => requestNotificationSync(), 15 * 60 * 1000);
  return () => {
    stopData();
    window.removeEventListener("focus", onVisible);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(interval);
    if (debounce) window.clearTimeout(debounce);
    const ids = [...armed.values()].flatMap((arm) => arm.ids);
    armed.clear();
    if (onDevice()) {
      void plugin()
        .then((notifications) => notifications.cancel({ notifications: ids.map((id) => ({ id })) }))
        .catch(() => {});
    } else {
      for (const id of ids) window.clearTimeout(id);
    }
  };
}

/** Short beep and a vibration when a due time arrives while the app is open. */
export function signalDue(): void {
  if (typeof window === "undefined") return;
  try {
    navigator.vibrate?.(400);
  } catch {
    /* vibration is missing on most desktops */
  }
  try {
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    osc.onended = () => {
      void ctx.close();
    };
  } catch {
    /* autoplay rules can block the beep; the banner still shows */
  }
}
