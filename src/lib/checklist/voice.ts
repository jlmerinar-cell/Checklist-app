import { activeList, addTask, setDone, setDueAt } from "./store.ts";
import { dueAtFromLocalClock, formatByTime } from "./time.ts";

export type VoiceIntent =
  | { kind: "add"; title: string; clock: string | null }
  | { kind: "check"; query: string }
  | { kind: "uncheck"; query: string }
  | { kind: "none" };

export type VoiceTask = { id: string; title: string };

export function parseSpokenClock(raw: string): { hours: number; minutes: number } | null {
  const text = raw.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  const meridiem = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(text);
  if (meridiem) {
    let hours = Number(meridiem[1]);
    const minutes = meridiem[2] ? Number(meridiem[2]) : 0;
    if (hours > 12 || minutes > 59) return null;
    if (meridiem[3] === "pm" && hours < 12) hours += 12;
    if (meridiem[3] === "am" && hours === 12) hours = 0;
    if (hours === 12 && meridiem[3] === "pm") hours = 12;
    return { hours, minutes };
  }
  const clock = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!clock) return null;
  const hours = Number(clock[1]);
  const minutes = Number(clock[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function tidyPhrase(phrase: string): string {
  const text = phrase.trim().replace(/\s+/g, " ").trim();
  if (/(?:a|p)\.m\.$/i.test(text)) return text;
  return text.replace(/[.!?]+$/g, "").trim();
}

export function parseVoice(phrase: string): VoiceIntent {
  const trimmed = tidyPhrase(phrase);
  const lower = trimmed.toLowerCase();
  if (!trimmed) return { kind: "none" };
  if (lower.startsWith("add ")) {
    const rest = trimmed.slice(4).trim();
    if (!rest) return { kind: "none" };
    const by = /^(.*?) by (.+)$/i.exec(rest);
    if (by && by[1].trim() && parseSpokenClock(by[2])) {
      return { kind: "add", title: by[1].trim(), clock: by[2].trim() };
    }
    return { kind: "add", title: rest, clock: null };
  }
  if (lower.startsWith("check off ")) {
    const query = trimmed.slice("check off ".length).trim();
    return query ? { kind: "check", query } : { kind: "none" };
  }
  if (lower.startsWith("uncheck ")) {
    const query = trimmed.slice("uncheck ".length).trim();
    return query ? { kind: "uncheck", query } : { kind: "none" };
  }
  if (lower.startsWith("check ")) {
    const query = trimmed.slice("check ".length).trim();
    return query ? { kind: "check", query } : { kind: "none" };
  }
  return { kind: "none" };
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let row = 0; row < rows; row += 1) grid[row]![0] = row;
  for (let col = 0; col < cols; col += 1) grid[0]![col] = col;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      grid[row]![col] = Math.min(grid[row - 1]![col]! + 1, grid[row]![col - 1]! + 1, grid[row - 1]![col - 1]! + cost);
    }
  }
  return grid[left.length]![right.length]!;
}

function scoreTitle(query: string, title: string): number {
  const q = normalize(query);
  const t = normalize(title);
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.includes(q) || q.includes(t)) return 0.92;
  const queryTokens = q.split(" ");
  const titleTokens = t.split(" ");
  const titleSet = new Set(titleTokens);
  const overlap = queryTokens.filter((token) => titleSet.has(token)).length;
  const tokenScore = (overlap / Math.max(queryTokens.length, titleTokens.length)) * 0.9;
  const distance = levenshtein(q, t);
  const lev = 1 - distance / Math.max(q.length, t.length);
  return Math.max(tokenScore, lev);
}

/** Closest title. A tie that is not an exact match is a miss. */
export function closestTask(tasks: VoiceTask[], query: string): VoiceTask | null {
  const ranked = tasks
    .map((task) => ({ task, score: scoreTitle(query, task.title) }))
    .filter((entry) => entry.score >= 0.55)
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best) return null;
  const second = ranked[1];
  if (second && best.score < 0.99 && best.score - second.score < 0.08) return null;
  return best.task;
}

function missed(phrase: string): string {
  const trimmed = phrase.trim();
  if (!trimmed) return "Didn't catch that.";
  return `Heard “${trimmed}”. Didn't catch that.`;
}

export function runVoice(phrase: string, now = new Date()): string {
  const intent = parseVoice(phrase);
  if (intent.kind === "none") return missed(phrase);
  const list = activeList();
  if (!list) return missed(phrase);
  const heard = phrase.trim();
  if (intent.kind === "add") {
    const created = addTask(list.id, intent.title);
    if (!created) return missed(phrase);
    if (intent.clock) {
      const clock = parseSpokenClock(intent.clock);
      if (clock) {
        const dueAt = dueAtFromLocalClock(clock.hours, clock.minutes, now);
        setDueAt(list.id, created.id, dueAt);
        return `Heard “${heard}”. Added ${created.title}, ${formatByTime(dueAt)}.`;
      }
    }
    return `Heard “${heard}”. Added ${created.title}.`;
  }
  const match = closestTask(
    list.tasks.filter((task) => !task.deletedAt).map((task) => ({ id: task.id, title: task.title })),
    intent.query,
  );
  if (!match) return missed(phrase);
  if (intent.kind === "check") {
    setDone(list.id, match.id, true);
    return `Heard “${heard}”. Checked off ${match.title}.`;
  }
  setDone(list.id, match.id, false);
  return `Heard “${heard}”. Marked ${match.title} not done.`;
}

export async function handleVoiceTap(recognize: () => Promise<string | null>, now = new Date()): Promise<string> {
  let heard: string | null = null;
  try {
    heard = await recognize();
  } catch {
    heard = null;
  }
  if (!heard || !heard.trim()) return "Didn't catch that.";
  return runVoice(heard, now);
}
