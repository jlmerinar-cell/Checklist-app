/**
 * Supabase free-tier sharing. One invite link per list.
 * Sharing a list never publishes the others. Pull and push both key off
 * that list's invite token, so a collaborator only receives the list they opened.
 *
 * UPGRADE PATH — live transport:
 * This module polls checklist_pull every few seconds. Swap poll for a
 * Supabase Realtime channel on public.checklist_lists when you enable
 * replication (or move to Pro, where concurrent connections are looser).
 * Keep push/pull payloads the same so storage does not change.
 *
 * UPGRADE PATH — limits: see limits.ts and v_list_cap / v_member_cap
 * in supabase/schema.sql.
 */

import { FREE_MEMBER_CAP, FREE_SHARED_LIST_CAP } from "./limits";
import { getSnapshot, mergeRemote, setRemoveNotifier, setSyncNotifier, stampSync } from "./storage";
import type { RemoteList, RemoteTask } from "./types";

const DEVICE_KEY = "checklist.device";
const POLL_MS = 5000;

type RpcResult = {
  ok?: boolean;
  reason?: string;
  detail?: string;
  stale?: boolean;
  id?: string;
  name?: string;
  slug?: string;
  inviteToken?: string;
  updatedAt?: string;
  tasks?: unknown;
};

export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

export function supabaseUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "") ?? "";
}

export function supabaseKey(): string {
  return import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
}

export function deviceId(): string {
  if (typeof localStorage === "undefined") return "server";
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem(DEVICE_KEY, created);
  return created;
}

export function inviteUrl(token: string): string {
  if (typeof window === "undefined") return `?invite=${encodeURIComponent(token)}`;
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("invite", token);
  return url.toString();
}

function asTasks(value: unknown): RemoteTask[] | null {
  if (!Array.isArray(value)) return null;
  const tasks: RemoteTask[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "string" || typeof row.title !== "string") return null;
    tasks.push({
      id: row.id,
      title: row.title,
      done: row.done === true,
      notes: typeof row.notes === "string" ? row.notes : "",
      due: typeof row.due === "string" ? row.due : null,
      calendarEventId: typeof row.calendarEventId === "string" ? row.calendarEventId : null,
    });
  }
  return tasks;
}

function asRemote(result: RpcResult): RemoteList | null {
  const tasks = asTasks(result.tasks);
  if (!result.id || !result.slug || !result.name || !result.inviteToken || !result.updatedAt || !tasks) return null;
  return {
    id: result.id,
    slug: result.slug,
    name: result.name,
    inviteToken: result.inviteToken,
    updatedAt: result.updatedAt,
    tasks,
  };
}

async function rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: supabaseKey(),
      Authorization: `Bearer ${supabaseKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.slice(0, 180) || `Supabase ${response.status}`);
  }
  return text ? (JSON.parse(text) as RpcResult) : { ok: false, reason: "empty" };
}

function reasonMessage(reason: string | undefined, detail?: string): string {
  if (reason === "list-cap") {
    return `Free tier shares ${FREE_SHARED_LIST_CAP} lists. Upgrade Supabase to share more.`;
  }
  if (reason === "member-cap") {
    return `This list already has ${FREE_MEMBER_CAP} people. That’s the free-tier cap.`;
  }
  if (reason === "not-found") return "That invite link doesn’t match a shared list.";
  if (detail?.includes("checklist_push") || detail?.includes("schema cache")) {
    return "Supabase is connected but the checklist SQL hasn’t been run yet.";
  }
  return "Couldn’t reach Supabase. Lists stay on this phone.";
}

let timer: number | null = null;
let poll = 0;
let running = false;

async function reconcile(quiet: boolean): Promise<void> {
  if (!supabaseConfigured() || running) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    stampSync("offline", "Changes stay on this phone until you’re back online.");
    return;
  }
  const shared = getSnapshot().lists.filter((list) => list.shared);
  if (!shared.length) {
    stampSync(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "local", "");
    return;
  }
  running = true;
  if (!quiet) stampSync("syncing", "");
  try {
    for (const list of shared) {
      const pulled = await rpc("checklist_pull", { p_token: list.inviteToken, p_device: deviceId() });
      if (pulled.ok === false && pulled.reason && pulled.reason !== "not-found") {
        stampSync("reconnecting", reasonMessage(pulled.reason, pulled.detail));
        return;
      }
      const remote = pulled.ok === false ? null : asRemote(pulled);
      const remoteTime = remote ? Date.parse(remote.updatedAt) : 0;
      const localTime = Date.parse(list.updatedAt);
      if (remote && remoteTime > localTime) {
        mergeRemote(remote);
        continue;
      }
      const latest = getSnapshot().lists.find((item) => item.id === list.id) ?? list;
      if (!remote || localTime > remoteTime) {
        const pushed = await rpc("checklist_push", {
          p_id: latest.id,
          p_token: latest.inviteToken,
          p_name: latest.name,
          p_slug: latest.slug,
          p_device: deviceId(),
          p_updated_at: latest.updatedAt,
          p_payload: latest.tasks.map((task) => ({
            id: task.id,
            title: task.title,
            done: task.done,
            notes: task.notes,
            due: task.due,
            calendarEventId: task.calendarEventId,
          })),
        });
        if (pushed.ok === false) {
          stampSync("reconnecting", reasonMessage(pushed.reason, pushed.detail));
          return;
        }
        if (pushed.stale) {
          const newer = asRemote(pushed);
          if (newer) mergeRemote(newer);
        }
      }
    }
    stampSync("live", "");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    stampSync("reconnecting", reasonMessage(undefined, detail));
  } finally {
    running = false;
  }
}

function schedule(): void {
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void reconcile(true);
  }, 400);
}

export function startSharing(): () => void {
  if (!supabaseConfigured()) {
    stampSync(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "local", "");
  } else {
    void reconcile(false);
  }
  setSyncNotifier(() => {
    if (!supabaseConfigured()) return;
    schedule();
  });
  setRemoveNotifier((token) => {
    if (!supabaseConfigured()) return;
    void rpc("checklist_drop", { p_token: token, p_device: deviceId() }).catch(() => {
      /* local delete already happened */
    });
  });
  const onOnline = () => {
    if (!supabaseConfigured()) {
      stampSync("local", "");
      return;
    }
    stampSync("reconnecting", "");
    void reconcile(false);
  };
  const onOffline = () => stampSync("offline", "Changes stay on this phone until you’re back online.");
  const onVisible = () => {
    if (document.visibilityState === "visible") void reconcile(true);
  };
  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  document.addEventListener("visibilitychange", onVisible);
  poll = window.setInterval(() => {
    if (supabaseConfigured()) void reconcile(true);
  }, POLL_MS);
  return () => {
    setSyncNotifier(null);
    setRemoveNotifier(null);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    window.clearInterval(poll);
    if (timer) window.clearTimeout(timer);
  };
}

export async function pullInvite(token: string): Promise<{ ok: boolean; message: string; list?: RemoteList }> {
  if (!supabaseConfigured()) {
    return { ok: false, message: "That invite needs Supabase, and it isn’t connected." };
  }
  try {
    const result = await rpc("checklist_join", { p_token: token, p_device: deviceId() });
    if (result.ok === false) return { ok: false, message: reasonMessage(result.reason, result.detail) };
    const remote = asRemote(result);
    if (!remote) return { ok: false, message: "The shared list came back empty." };
    return { ok: true, message: `Joined ${remote.name}.`, list: remote };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    return { ok: false, message: reasonMessage(undefined, detail) };
  }
}
