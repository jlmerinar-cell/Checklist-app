export function byPosition<T extends { position: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.position - b.position);
}

/** Move `id` to a 0-based index inside `items` (already the column or list). */
export function moveToIndex<T extends { id: string }>(items: T[], id: string, toIndex: number): T[] | null {
  const from = items.findIndex((item) => item.id === id);
  if (from < 0) return null;
  const next = items.slice();
  const [item] = next.splice(from, 1);
  if (!item) return null;
  const index = Math.max(0, Math.min(toIndex, next.length));
  next.splice(index, 0, item);
  return next;
}

export function moveByDir<T extends { id: string }>(items: T[], id: string, dir: -1 | 1): T[] | null {
  const from = items.findIndex((item) => item.id === id);
  if (from < 0) return null;
  const to = from + dir;
  if (to < 0 || to >= items.length) return items;
  return moveToIndex(items, id, to);
}

/**
 * Place a task into a column's id list.
 * `overId` is another task id, or a `drop:` column target (append).
 */
export function placeInColumn(ids: string[], taskId: string, overId: string): string[] {
  const without = ids.filter((id) => id !== taskId);
  if (overId.startsWith("drop:")) return [...without, taskId];
  const index = without.indexOf(overId);
  if (index < 0) return [...without, taskId];
  const next = without.slice();
  next.splice(index, 0, taskId);
  return next;
}
