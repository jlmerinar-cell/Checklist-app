export type DueTone = "none" | "later" | "soon" | "overdue";

/** Visual flag for an unchecked task. Checking clears it, even if the due time remains. */
export function dueTone(dueAt: string | null, done: boolean, now: Date = new Date()): DueTone {
  if (done || !dueAt) return "none";
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return "none";
  const delta = due - now.getTime();
  if (delta < 0) return "overdue";
  if (delta < 60 * 60 * 1000) return "soon";
  return "later";
}

export function formatCountdown(dueAt: string | null, now: Date = new Date()): string {
  if (!dueAt) return "";
  const due = Date.parse(dueAt);
  if (Number.isNaN(due)) return "";
  const delta = due - now.getTime();
  if (delta === 0) return "Due now";
  const late = delta < 0;
  const minutes = Math.ceil(Math.abs(delta) / 60_000);
  return `${late ? "Overdue" : "Due in"} ${formatSpan(minutes)}`;
}

function formatSpan(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const mins = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins}m`);
  return parts.join(" ");
}

export type DueHit = { id: string; title: string; dueAt: string };

type DueList = {
  deletedAt: string | null;
  tasks: {
    id: string;
    title: string;
    done: boolean;
    deletedAt: string | null;
    dueAt: string | null;
  }[];
};

/** Unchecked tasks whose due time landed after prevMs and at or before nowMs. */
export function tasksCrossingDue(lists: DueList[], prevMs: number, nowMs: number): DueHit[] {
  const hits: DueHit[] = [];
  for (const list of lists) {
    if (list.deletedAt) continue;
    for (const task of list.tasks) {
      if (task.deletedAt || task.done || !task.dueAt) continue;
      const due = Date.parse(task.dueAt);
      if (Number.isNaN(due)) continue;
      if (due > prevMs && due <= nowMs) hits.push({ id: task.id, title: task.title, dueAt: task.dueAt });
    }
  }
  return hits;
}
