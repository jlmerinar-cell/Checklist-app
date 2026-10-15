import { useEffect, useRef } from "react";
import { Check } from "lucide-react";
import {
  editTitleById,
  focusEdit,
  saveNotesById,
  setDueById,
  setNotesDraftById,
  setNotesOpenById,
  toggleById,
} from "@/lib/checklist/actions";
import type { Task } from "@/lib/checklist/types";

function formatDue(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function TaskRow({ listId, task }: { listId: string; task: Task }) {
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!task.editing) return;
    titleRef.current?.focus();
    titleRef.current?.select();
  }, [task.editing]);

  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3" data-task-id={task.id}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
          onClick={() => toggleById(listId, task.id)}
          className={
            "flex size-14 shrink-0 items-center justify-center rounded-card border-2 " +
            (task.done ? "border-accent bg-accent text-on-accent" : "border-line bg-canvas text-ink")
          }
        >
          {task.done ? <Check aria-hidden strokeWidth={3} className="size-8" /> : null}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <input
            ref={titleRef}
            aria-label="Task title"
            value={task.title}
            onChange={(event) => editTitleById(listId, task.id, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveNotesById(listId, task.id);
              }
            }}
            className={
              "w-full border-b border-line bg-transparent py-1 outline-none " +
              (task.done ? "text-ink line-through decoration-2" : "text-ink")
            }
          />
          {task.due && !task.editing ? <p className="text-muted">Due {formatDue(task.due)}</p> : null}
          {task.editing ? (
            <label className="flex flex-col gap-2">
              Due
              <input
                type="date"
                className="field"
                value={task.due ?? ""}
                onChange={(event) => setDueById(listId, task.id, event.target.value || null)}
              />
            </label>
          ) : null}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => focusEdit(listId, task.id)}
          className="rounded-card border border-line px-2 text-muted"
        >
          edit
        </button>
        <button
          type="button"
          onClick={() => saveNotesById(listId, task.id)}
          className="rounded-card border border-line px-2 text-muted"
        >
          save
        </button>
      </div>
      <details
        open={task.notesOpen}
        onToggle={(event) => {
          const open = event.currentTarget.open;
          if (open !== task.notesOpen) setNotesOpenById(listId, task.id, open);
        }}
      >
        <summary className="notes-strip border-t border-line pt-2 text-muted">notes</summary>
        {task.notesOpen ? (
          <textarea
            aria-label={`Notes for ${task.title}`}
            className="field mt-2 min-h-28"
            value={task.notesDraft}
            onChange={(event) => setNotesDraftById(listId, task.id, event.target.value)}
            placeholder="Notes for this task"
          />
        ) : null}
      </details>
    </article>
  );
}
