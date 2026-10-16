/**
 * Last-write-wins merge for one owner's Supabase space.
 * Each list and each task has its own updatedAt. The newer stamp wins the
 * whole record. A tie keeps the remote copy so the next pull matches the server.
 * Rows that exist only on this phone stay. A notes draft that has not been
 * saved (draft !== notes) stays on this phone even when the saved notes update.
 */

export type OwnerList = {
  id: string;
  slug: string;
  name: string;
  inviteToken: string;
  shared: boolean;
  day: string | null;
  system: boolean;
  updatedAt: string;
};

export type OwnerTask = {
  id: string;
  listId: string;
  title: string;
  done: boolean;
  notes: string;
  notesDraft: string;
  due: string | null;
  calendarEventId: string | null;
  updatedAt: string;
};

export type OwnerTombstone = {
  kind: "list" | "task";
  id: string;
  listId: string | null;
  updatedAt: string;
};

export type RemoteOwnerList = OwnerList & { deletedAt: string | null };
export type RemoteOwnerTask = Omit<OwnerTask, "notesDraft"> & { deletedAt: string | null };

export type OwnerState = {
  lists: OwnerList[];
  tasks: OwnerTask[];
  tombstones: OwnerTombstone[];
};

export type RemoteOwnerState = {
  lists: RemoteOwnerList[];
  tasks: RemoteOwnerTask[];
};

function ms(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const value = Date.parse(iso);
  return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
}

type Live<T> = { dead: false; at: number; atIso: string; value: T };
type Dead = { dead: true; at: number; atIso: string };
type Stamp<T> = Live<T> | Dead;

/** `incoming` wins when its clock is later or equal. Pass remote as incoming. */
function prefer<T>(current: Stamp<T> | null, incoming: Stamp<T> | null): Stamp<T> | null {
  if (!current) return incoming;
  if (!incoming) return current;
  return incoming.at >= current.at ? incoming : current;
}

function latestTombstone(
  tombstones: OwnerTombstone[],
  kind: OwnerTombstone["kind"],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const tomb of tombstones) {
    if (tomb.kind !== kind) continue;
    const previous = map.get(tomb.id);
    if (!previous || ms(tomb.updatedAt) > ms(previous)) map.set(tomb.id, tomb.updatedAt);
  }
  return map;
}

function withoutDelete(row: RemoteOwnerList): OwnerList {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    inviteToken: row.inviteToken,
    shared: row.shared,
    day: row.day,
    system: row.system,
    updatedAt: row.updatedAt,
  };
}

function remoteListStamp(row: RemoteOwnerList): Stamp<OwnerList> {
  const updated = ms(row.updatedAt);
  const deleted = ms(row.deletedAt);
  if (row.deletedAt && deleted >= updated) return { dead: true, at: deleted, atIso: row.deletedAt };
  return { dead: false, at: updated, atIso: row.updatedAt, value: withoutDelete(row) };
}

function remoteTaskStamp(row: RemoteOwnerTask, local: OwnerTask | undefined): Stamp<OwnerTask> {
  const updated = ms(row.updatedAt);
  const deleted = ms(row.deletedAt);
  if (row.deletedAt && deleted >= updated) return { dead: true, at: deleted, atIso: row.deletedAt };
  const dirty = local ? local.notesDraft !== local.notes : false;
  return {
    dead: false,
    at: updated,
    atIso: row.updatedAt,
    value: {
      id: row.id,
      listId: row.listId,
      title: row.title,
      done: row.done,
      notes: row.notes,
      notesDraft: dirty && local ? local.notesDraft : row.notes,
      due: row.due,
      calendarEventId: row.calendarEventId,
      updatedAt: row.updatedAt,
    },
  };
}

function orderIds(localIds: string[], remoteIds: string[], extraIds: Iterable<string>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const id of [...localIds, ...remoteIds, ...extraIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

/**
 * The list clock follows its newest task so a task edit is not treated as
 * older than the list it belongs to. The list's own fields still come from
 * the list-level winner.
 */
function raiseListClock(list: OwnerList, tasks: OwnerTask[]): OwnerList {
  let at = ms(list.updatedAt);
  let iso = list.updatedAt;
  for (const task of tasks) {
    if (task.listId !== list.id) continue;
    const taskAt = ms(task.updatedAt);
    if (taskAt > at) {
      at = taskAt;
      iso = task.updatedAt;
    }
  }
  return iso === list.updatedAt ? list : { ...list, updatedAt: iso };
}

export function mergeOwnerState(local: OwnerState, remote: RemoteOwnerState): OwnerState {
  const listTombs = latestTombstone(local.tombstones, "list");
  const taskTombs = latestTombstone(local.tombstones, "task");
  const localLists = new Map(local.lists.map((list) => [list.id, list]));
  const remoteLists = new Map(remote.lists.map((list) => [list.id, list]));

  const nextLists: OwnerList[] = [];
  const nextListTombs = new Map<string, string>();

  for (const id of orderIds(
    local.lists.map((list) => list.id),
    remote.lists.map((list) => list.id),
    listTombs.keys(),
  )) {
    const localRow = localLists.get(id);
    const remoteRow = remoteLists.get(id);
    const tombAt = listTombs.get(id);
    const localLive: Stamp<OwnerList> | null = localRow
      ? { dead: false, at: ms(localRow.updatedAt), atIso: localRow.updatedAt, value: localRow }
      : null;
    const localDead: Stamp<OwnerList> | null = tombAt
      ? { dead: true, at: ms(tombAt), atIso: tombAt }
      : null;
    const winner = prefer(
      prefer(localLive, localDead),
      remoteRow ? remoteListStamp(remoteRow) : null,
    );
    if (!winner) continue;
    if (winner.dead) {
      // Daily cannot be deleted. A remote delete must not remove it on the phone.
      if (localRow?.system) {
        nextLists.push(localRow);
        continue;
      }
      nextListTombs.set(id, winner.atIso);
      continue;
    }
    nextLists.push(winner.value);
  }

  const liveListIds = new Set(nextLists.map((list) => list.id));
  const localTasks = new Map(local.tasks.map((task) => [task.id, task]));
  const remoteTasks = new Map(remote.tasks.map((task) => [task.id, task]));
  const nextTasks: OwnerTask[] = [];
  const nextTaskTombs = new Map<string, string>();

  for (const id of orderIds(
    local.tasks.map((task) => task.id),
    remote.tasks.map((task) => task.id),
    taskTombs.keys(),
  )) {
    const localRow = localTasks.get(id);
    const remoteRow = remoteTasks.get(id);
    const tombAt = taskTombs.get(id);
    const localLive: Stamp<OwnerTask> | null = localRow
      ? { dead: false, at: ms(localRow.updatedAt), atIso: localRow.updatedAt, value: localRow }
      : null;
    const localDead: Stamp<OwnerTask> | null = tombAt
      ? { dead: true, at: ms(tombAt), atIso: tombAt }
      : null;
    const winner = prefer(
      prefer(localLive, localDead),
      remoteRow ? remoteTaskStamp(remoteRow, localRow) : null,
    );
    if (!winner) continue;
    if (winner.dead) {
      nextTaskTombs.set(id, winner.atIso);
      continue;
    }
    if (!liveListIds.has(winner.value.listId)) {
      const listGoneAt = nextListTombs.get(winner.value.listId);
      const atIso = listGoneAt && ms(listGoneAt) >= winner.at ? listGoneAt : winner.atIso;
      nextTaskTombs.set(id, atIso);
      continue;
    }
    nextTasks.push(winner.value);
  }

  const tombstones: OwnerTombstone[] = [];
  for (const [id, updatedAt] of nextListTombs) {
    tombstones.push({ kind: "list", id, listId: null, updatedAt });
  }
  for (const [id, updatedAt] of nextTaskTombs) {
    const listId = localTasks.get(id)?.listId ?? remoteTasks.get(id)?.listId ?? null;
    tombstones.push({ kind: "task", id, listId, updatedAt });
  }

  return {
    lists: nextLists.map((list) => raiseListClock(list, nextTasks)),
    tasks: nextTasks,
    tombstones,
  };
}

/** Daily (and any other system list) stays on the phone even if a remote delete says otherwise. */
export function keepSystemLists(before: OwnerList[], merged: OwnerState): OwnerState {
  const system = before.filter((list) => list.system);
  if (!system.length) return merged;
  const lists = merged.lists.slice();
  let tombstones = merged.tombstones;
  for (const list of system) {
    tombstones = tombstones.filter((tomb) => !(tomb.kind === "list" && tomb.id === list.id));
    if (!lists.some((item) => item.id === list.id)) lists.push(list);
  }
  return { ...merged, lists, tombstones };
}
