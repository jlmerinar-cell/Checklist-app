import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  keepSystemLists,
  mergeOwnerState,
  type OwnerList,
  type OwnerState,
  type OwnerTask,
  type RemoteOwnerState,
} from "./space-sync-merge.ts";

const T1 = "2026-10-16T10:00:00.000Z";
const T2 = "2026-10-16T11:00:00.000Z";
const T3 = "2026-10-16T12:00:00.000Z";

function list(partial: Partial<OwnerList> & Pick<OwnerList, "id" | "updatedAt">): OwnerList {
  return {
    slug: partial.slug ?? partial.id,
    name: partial.name ?? partial.id,
    inviteToken: partial.inviteToken ?? `invite-${partial.id}`,
    shared: partial.shared ?? false,
    day: partial.day ?? null,
    system: partial.system ?? false,
    id: partial.id,
    updatedAt: partial.updatedAt,
  };
}

function task(
  partial: Partial<OwnerTask> & Pick<OwnerTask, "id" | "listId" | "updatedAt">,
): OwnerTask {
  return {
    title: partial.title ?? partial.id,
    done: partial.done ?? false,
    notes: partial.notes ?? "",
    notesDraft: partial.notesDraft ?? partial.notes ?? "",
    due: partial.due ?? null,
    calendarEventId: partial.calendarEventId ?? null,
    id: partial.id,
    listId: partial.listId,
    updatedAt: partial.updatedAt,
  };
}

function merge(local: OwnerState, remote: RemoteOwnerState = { lists: [], tasks: [] }) {
  return mergeOwnerState(local, remote);
}

describe("mergeOwnerState", () => {
  it("keeps a newer remote task, including notes, and a newer local task", () => {
    const local = {
      lists: [list({ id: "list", updatedAt: T1 })],
      tasks: [
        task({ id: "a", listId: "list", title: "Hydrant", notes: "old", updatedAt: T1 }),
        task({ id: "b", listId: "list", title: "Local win", notes: "phone", updatedAt: T3 }),
      ],
      tombstones: [],
    };
    const remote = {
      lists: [{ ...list({ id: "list", updatedAt: T1 }), deletedAt: null }],
      tasks: [
        {
          ...task({
            id: "a",
            listId: "list",
            title: "Hydrant",
            notes: "from the desk",
            updatedAt: T2,
          }),
          deletedAt: null,
        },
        {
          ...task({ id: "b", listId: "list", title: "Local win", notes: "stale", updatedAt: T2 }),
          deletedAt: null,
        },
      ],
    };
    const merged = merge(local, remote);
    const a = merged.tasks.find((item) => item.id === "a");
    const b = merged.tasks.find((item) => item.id === "b");
    assert.equal(a?.notes, "from the desk");
    assert.equal(a?.notesDraft, "from the desk");
    assert.equal(b?.notes, "phone");
  });

  it("keeps an unsaved notes draft when the remote notes win", () => {
    const local = {
      lists: [list({ id: "list", updatedAt: T1 })],
      tasks: [
        task({
          id: "a",
          listId: "list",
          notes: "saved",
          notesDraft: "still typing",
          updatedAt: T1,
        }),
      ],
      tombstones: [],
    };
    const remote = {
      lists: [{ ...list({ id: "list", updatedAt: T1 }), deletedAt: null }],
      tasks: [
        {
          ...task({ id: "a", listId: "list", notes: "assistant", updatedAt: T2 }),
          deletedAt: null,
        },
      ],
    };
    const merged = merge(local, remote);
    assert.equal(merged.tasks[0]?.notes, "assistant");
    assert.equal(merged.tasks[0]?.notesDraft, "still typing");
  });

  it("lets the remote copy win a tie so the phone matches the server", () => {
    const local = {
      lists: [list({ id: "list", name: "Phone", updatedAt: T2 })],
      tasks: [task({ id: "a", listId: "list", title: "Phone title", updatedAt: T2 })],
      tombstones: [],
    };
    const remote = {
      lists: [{ ...list({ id: "list", name: "Desk", updatedAt: T2 }), deletedAt: null }],
      tasks: [
        {
          ...task({ id: "a", listId: "list", title: "Desk title", updatedAt: T2 }),
          deletedAt: null,
        },
      ],
    };
    const merged = merge(local, remote);
    assert.equal(merged.lists[0]?.name, "Desk");
    assert.equal(merged.tasks[0]?.title, "Desk title");
  });

  it("adds a remote-only task and keeps a phone-only task", () => {
    const local = {
      lists: [list({ id: "list", updatedAt: T1 })],
      tasks: [task({ id: "local", listId: "list", title: "On the phone", updatedAt: T1 })],
      tombstones: [],
    };
    const remote = {
      lists: [{ ...list({ id: "list", updatedAt: T1 }), deletedAt: null }],
      tasks: [
        {
          ...task({ id: "remote", listId: "list", title: "From the desk", updatedAt: T2 }),
          deletedAt: null,
        },
      ],
    };
    const merged = merge(local, remote);
    assert.deepEqual(
      merged.tasks.map((item) => item.id),
      ["local", "remote"],
    );
  });

  it("drops a task when the remote delete is newer, and keeps one the phone edited after", () => {
    const local = {
      lists: [list({ id: "list", updatedAt: T1 })],
      tasks: [
        task({ id: "gone", listId: "list", updatedAt: T1 }),
        task({ id: "kept", listId: "list", title: "Edited after", updatedAt: T3 }),
      ],
      tombstones: [],
    };
    const remote = {
      lists: [{ ...list({ id: "list", updatedAt: T1 }), deletedAt: null }],
      tasks: [
        { ...task({ id: "gone", listId: "list", updatedAt: T1 }), deletedAt: T2 },
        { ...task({ id: "kept", listId: "list", updatedAt: T1 }), deletedAt: T2 },
      ],
    };
    const merged = merge(local, remote);
    assert.deepEqual(
      merged.tasks.map((item) => item.id),
      ["kept"],
    );
    assert.equal(
      merged.tombstones.some((tomb) => tomb.kind === "task" && tomb.id === "gone"),
      true,
    );
    assert.equal(
      merged.tombstones.some((tomb) => tomb.id === "kept"),
      false,
    );
  });

  it("keeps a local delete when it is newer than the remote task", () => {
    const local = {
      lists: [list({ id: "list", updatedAt: T1 })],
      tasks: [],
      tombstones: [{ kind: "task" as const, id: "a", listId: "list", updatedAt: T3 }],
    };
    const remote = {
      lists: [{ ...list({ id: "list", updatedAt: T1 }), deletedAt: null }],
      tasks: [
        { ...task({ id: "a", listId: "list", title: "Back", updatedAt: T2 }), deletedAt: null },
      ],
    };
    const merged = merge(local, remote);
    assert.equal(merged.tasks.length, 0);
    assert.equal(merged.tombstones[0]?.updatedAt, T3);
  });

  it("uses the newer list name and drops tasks when that list was deleted", () => {
    const local = {
      lists: [list({ id: "list", name: "Old", updatedAt: T1 })],
      tasks: [task({ id: "a", listId: "list", updatedAt: T1 })],
      tombstones: [],
    };
    const renamed = merge(local, {
      lists: [{ ...list({ id: "list", name: "Fire department", updatedAt: T2 }), deletedAt: null }],
      tasks: [{ ...task({ id: "a", listId: "list", updatedAt: T1 }), deletedAt: null }],
    });
    assert.equal(renamed.lists[0]?.name, "Fire department");
    assert.equal(renamed.tasks.length, 1);

    const deleted = merge(local, {
      lists: [{ ...list({ id: "list", name: "Old", updatedAt: T1 }), deletedAt: T2 }],
      tasks: [{ ...task({ id: "a", listId: "list", updatedAt: T1 }), deletedAt: null }],
    });
    assert.equal(deleted.lists.length, 0);
    assert.equal(deleted.tasks.length, 0);
    assert.equal(
      deleted.tombstones.some((tomb) => tomb.kind === "list" && tomb.id === "list"),
      true,
    );
    assert.equal(
      deleted.tombstones.some((tomb) => tomb.kind === "task" && tomb.id === "a"),
      true,
    );
  });

  it("raises the list clock to its newest task without taking the task as a rename", () => {
    const merged = merge(
      {
        lists: [list({ id: "list", name: "Phone", updatedAt: T1 })],
        tasks: [task({ id: "a", listId: "list", updatedAt: T3 })],
        tombstones: [],
      },
      {
        lists: [{ ...list({ id: "list", name: "Desk", updatedAt: T2 }), deletedAt: null }],
        tasks: [],
      },
    );
    assert.equal(merged.lists[0]?.name, "Desk");
    assert.equal(merged.lists[0]?.updatedAt, T3);
  });

  it("treats an unreadable timestamp as older", () => {
    const merged = merge(
      {
        lists: [list({ id: "list", updatedAt: "not-a-date" })],
        tasks: [task({ id: "a", listId: "list", notes: "local", updatedAt: "not-a-date" })],
        tombstones: [],
      },
      {
        lists: [{ ...list({ id: "list", updatedAt: T1 }), deletedAt: null }],
        tasks: [
          { ...task({ id: "a", listId: "list", notes: "remote", updatedAt: T1 }), deletedAt: null },
        ],
      },
    );
    assert.equal(merged.tasks[0]?.notes, "remote");
  });
});

describe("system lists", () => {
  it("keeps Daily when a newer remote row deletes it", () => {
    const daily = list({ id: "daily", name: "Daily", system: true, updatedAt: T1 });
    const merged = merge(
      {
        lists: [daily],
        tasks: [task({ id: "a", listId: "daily", title: "Standup", updatedAt: T1 })],
        tombstones: [],
      },
      {
        lists: [{ ...daily, deletedAt: T2 }],
        tasks: [
          {
            ...task({ id: "a", listId: "daily", title: "Standup", updatedAt: T1 }),
            deletedAt: null,
          },
        ],
      },
    );
    assert.equal(merged.lists[0]?.id, "daily");
    assert.equal(merged.tasks[0]?.title, "Standup");
    assert.equal(
      merged.tombstones.some((tomb) => tomb.id === "daily"),
      false,
    );
  });

  it("puts a missing system list back and drops its tombstone", () => {
    const daily = list({ id: "daily", name: "Daily", system: true, updatedAt: T1 });
    const kept = keepSystemLists([daily], {
      lists: [],
      tasks: [],
      tombstones: [{ kind: "list", id: "daily", listId: null, updatedAt: T2 }],
    });
    assert.equal(kept.lists[0]?.id, "daily");
    assert.equal(
      kept.tombstones.some((tomb) => tomb.id === "daily"),
      false,
    );
  });
});
