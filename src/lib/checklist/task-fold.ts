/** In-memory fold. Checking a task leaves the open set unchanged. */
export function foldAfterTap(open: ReadonlySet<string>, taskId: string, source: "toggle" | "check"): Set<string> {
  if (source === "check") return new Set(open);
  const next = new Set(open);
  if (next.has(taskId)) next.delete(taskId);
  else next.add(taskId);
  return next;
}
