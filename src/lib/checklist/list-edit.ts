/** Dedicated editor for one list. The id in the path is the only list that page may change. */
export function listEditPath(id: string): string {
  return `/list/${id}/edit`;
}

export function editTargets<T extends { id: string; name: string }>(
  lists: T[],
): { id: string; name: string; href: string }[] {
  return lists.map((list) => ({ id: list.id, name: list.name, href: listEditPath(list.id) }));
}

/** Daily is filled by the calendar and is not a list the owner can remove. */
export function canDeleteList(list: { system: boolean }): boolean {
  return !list.system;
}

/** First tap asks. The next tap is the only one that deletes. */
export function nextDeletePhase(phase: "idle" | "confirm"): "confirm" | "commit" {
  return phase === "idle" ? "confirm" : "commit";
}

/**
 * Move inside the already-open app.
 * Capacitor serves a single index.html, so a full load of /list/:id/edit has no file.
 */
export function followInApp(href: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(href, window.location.href);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === next) return;
  const prev = window.history.state as { __TSR_index?: number } | null;
  const prevIndex = typeof prev?.__TSR_index === "number" ? prev.__TSR_index : 0;
  const key = Math.random().toString(36).slice(2);
  window.history.pushState(
    {
      ...(prev && typeof prev === "object" ? prev : {}),
      key,
      __TSR_key: key,
      __TSR_index: prevIndex + 1,
    },
    "",
    next,
  );
}
