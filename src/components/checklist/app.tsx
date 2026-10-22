import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, ChevronDown, GripVertical, Mic, Settings } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GearPanel } from "@/components/checklist/gear-panel";
import { useChecklistRuntime } from "@/components/checklist/runtime";
import { showListSwitcher } from "@/lib/checklist/chrome";
import { switchCommand } from "@/lib/checklist/commands";
import { dueTone, tasksCrossingDue } from "@/lib/checklist/countdown";
import { signalDue } from "@/lib/checklist/notify";
import { recognizeSpeech } from "@/lib/checklist/speech";
import {
  activeList,
  columnsOf,
  currentAppearance,
  deleteTask,
  getSeed,
  getState,
  moveTaskByDir,
  moveTaskByDrop,
  saveNotes,
  setDone,
  setDueAt,
  setEditing,
  setMessage,
  setNotesDraft,
  setTaskColumn,
  setTitle,
  subscribe,
  tasksIn,
  visibleLists,
} from "@/lib/checklist/store";
import { applyAppearance, columnSlotFor, inkFor } from "@/lib/checklist/theme";
import { clockFromIso, dueAtFromLocalClock, formatByTime, fromDatetimeLocal, parseClock, toDatetimeLocal } from "@/lib/checklist/time";
import { foldAfterTap } from "@/lib/checklist/task-fold";
import { handleVoiceTap } from "@/lib/checklist/voice";
import type { List, Task } from "@/lib/checklist/types";

const NowContext = createContext<Date>(new Date());

function useNow(): Date {
  return useContext(NowContext);
}

function useChecklist() {
  return useSyncExternalStore(subscribe, getState, getSeed);
}

function useHoldSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function collide(args: Parameters<typeof pointerWithin>[0]) {
  const hit = pointerWithin(args);
  return hit.length ? hit : closestCenter(args);
}

function ListSelect() {
  const state = useChecklist();
  const lists = visibleLists(state.lists);
  if (!showListSwitcher(lists.length)) return null;
  const active = lists.find((list) => list.id === state.activeId) ?? null;
  return (
    <select
      aria-label="Switch list"
      className="field min-h-11 min-w-0 flex-1"
      value={active?.id ?? ""}
      onChange={(event) => {
        const next = lists.find((list) => list.id === event.target.value);
        if (next) switchCommand(next.slug);
      }}
    >
      {lists.map((list) => (
        <option key={list.id} value={list.id}>
          {list.name}
        </option>
      ))}
    </select>
  );
}

function TaskCard({
  list,
  task,
  expanded,
  onToggle,
  onCheck,
}: {
  list: List;
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  onCheck: () => void;
}) {
  const now = useNow();
  const [armed, setArmed] = useState(false);
  const [live, setLive] = useState(false);
  useEffect(() => setLive(true), []);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const tone = live ? dueTone(task.dueAt, task.done, now) : "none";
  const byTime = task.dueAt ? formatByTime(task.dueAt) : "";
  const hasNotes = task.notes.trim().length > 0;
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-task-id={task.id}
      data-expanded={expanded ? "true" : "false"}
      className={`task-card flex flex-col rounded-card border border-line bg-surface ${expanded ? "gap-3 p-3" : "task-card-collapsed"} ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="task-row">
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={task.done ? `Mark “${task.title}” not done` : `Mark “${task.title}” done`}
          onClick={(event) => {
            event.stopPropagation();
            onCheck();
          }}
          className={`task-check flex size-11 shrink-0 items-center justify-center rounded-card border-2 ${task.done ? "is-done" : "border-line bg-canvas text-ink"}`}
        >
          {task.done ? <Check aria-hidden="true" strokeWidth={3} className="size-6" /> : null}
        </button>
        <button type="button" className="task-title" aria-expanded={expanded} onClick={onToggle}>
          <span className={task.done ? "line-through decoration-2" : ""}>{task.title}</span>
        </button>
        {byTime ? (
          <span className={`due-chip ${tone === "overdue" ? "due-overdue" : tone === "soon" ? "due-soon" : ""}`} data-due-chip={tone}>
            {byTime}
          </span>
        ) : null}
        {hasNotes ? <span className="notes-dot" aria-label="Has notes" /> : null}
        <button
          type="button"
          className={`task-chevron ${expanded ? "is-open" : ""}`}
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${task.title}` : `Expand ${task.title}`}
          onClick={onToggle}
        >
          <ChevronDown aria-hidden="true" className="size-5" />
        </button>
      </div>
      {expanded ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="flex size-11 shrink-0 items-center justify-center rounded-card border border-line text-muted"
              aria-label={`Drag to reorder ${task.title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" className="size-6" />
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <input
                aria-label="Task title"
                value={task.title}
                onChange={(event) => setTitle(list.id, task.id, event.target.value)}
                className={`w-full border-b border-line bg-transparent py-1 outline-none ${task.done ? "text-ink line-through decoration-2" : "text-ink"}`}
              />
              <label className="flex flex-col gap-1 text-muted">
                Due time
                <input
                  type="time"
                  className="field"
                  aria-label={`Due time for ${task.title}`}
                  value={clockFromIso(task.dueAt)}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (!value) {
                      setDueAt(list.id, task.id, null);
                      return;
                    }
                    const parsed = parseClock(value);
                    if (!parsed) return;
                    setDueAt(list.id, task.id, dueAtFromLocalClock(parsed.hours, parsed.minutes, now));
                  }}
                />
              </label>
              {task.editing ? (
                <>
                  <label className="flex flex-col gap-2">
                    Due
                    <input
                      type="datetime-local"
                      className="field"
                      value={toDatetimeLocal(task.dueAt)}
                      onChange={(event) => setDueAt(list.id, task.id, fromDatetimeLocal(event.target.value))}
                    />
                  </label>
                  <label className="flex flex-col gap-2">
                    Column
                    <select
                      className="field"
                      value={task.columnId}
                      onChange={(event) => setTaskColumn(list.id, task.id, event.target.value)}
                    >
                      {columnsOf(list).map((column) => (
                        <option key={column.id} value={column.id}>
                          {column.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="min-h-11 rounded-card border border-line px-3" onClick={() => moveTaskByDir(list.id, task.id, -1)}>
              Up
            </button>
            <button type="button" className="min-h-11 rounded-card border border-line px-3" onClick={() => moveTaskByDir(list.id, task.id, 1)}>
              Down
            </button>
            <button type="button" className="min-h-11 rounded-card border border-line px-3 text-muted" onClick={() => setEditing(list.id, task.id, true)}>
              edit
            </button>
            <button
              type="button"
              className="min-h-11 rounded-card border border-line px-3 text-muted"
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                deleteTask(list.id, task.id);
              }}
            >
              {armed ? "Tap again to delete" : "Delete"}
            </button>
            <button
              type="button"
              className="min-h-11 rounded-card border border-line px-3 text-muted"
              onClick={() => {
                saveNotes(list.id, task.id);
                setMessage("Notes saved.");
              }}
            >
              save
            </button>
          </div>
          <label className="flex flex-col gap-2 border-t border-line pt-2">
            Notes
            <textarea
              aria-label={`Notes for ${task.title}`}
              className="field min-h-28"
              value={task.notesDraft}
              placeholder="Notes for this task"
              onChange={(event) => setNotesDraft(list.id, task.id, event.target.value)}
              onBlur={() => saveNotes(list.id, task.id)}
            />
          </label>
        </div>
      ) : null}
    </article>
  );
}

function ColumnBlock({
  list,
  columnId,
  name,
  openIds,
  onToggle,
  onCheck,
}: {
  list: List;
  columnId: string;
  name: string;
  openIds: ReadonlySet<string>;
  onToggle: (taskId: string) => void;
  onCheck: (taskId: string) => void;
}) {
  const tasks = tasksIn(list, columnId);
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${columnId}` });
  const columns = columnsOf(list);
  const index = columns.findIndex((column) => column.id === columnId);
  const slot = columnSlotFor(columnId, index < 0 ? 0 : index);
  const appearance = currentAppearance(useChecklist());
  const col = appearance.colors[slot];
  return (
    <section
      className={`column-block flex flex-col gap-3 ${isOver ? "ring-2 ring-accent" : ""}`}
      data-column={slot}
      style={{ ["--col" as string]: col, ["--col-ink" as string]: inkFor(col) }}
      ref={setNodeRef}
    >
      <div className="col-band">{name}</div>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-3">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              list={list}
              task={task}
              expanded={openIds.has(task.id)}
              onToggle={() => onToggle(task.id)}
              onCheck={() => onCheck(task.id)}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function ListPanel({ list, initialExpanded = [] }: { list: List; initialExpanded?: string[] }) {
  const columns = columnsOf(list);
  const sensors = useHoldSensors();
  const [openIds, setOpenIds] = useState(() => new Set(initialExpanded));

  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    moveTaskByDrop(list.id, String(event.active.id), String(event.over.id));
  }

  function onToggle(taskId: string) {
    setOpenIds((open) => foldAfterTap(open, taskId, "toggle"));
  }

  function onCheck(taskId: string) {
    setDone(list.id, taskId);
    setOpenIds((open) => foldAfterTap(open, taskId, "check"));
  }

  return (
    <section role="tabpanel" aria-label={list.name} className="flex flex-col gap-3">
      <DndContext sensors={sensors} collisionDetection={collide} onDragEnd={onDragEnd}>
        <div className="columns">
          {columns.map((column) => (
            <ColumnBlock
              key={column.id}
              list={list}
              columnId={column.id}
              name={column.name}
              openIds={openIds}
              onToggle={onToggle}
              onCheck={onCheck}
            />
          ))}
        </div>
      </DndContext>
      {tasksIn(list).length === 0 ? <p className="text-muted">Nothing on this list yet.</p> : null}
    </section>
  );
}

function useDueNotice(): [string, () => void] {
  const [text, setText] = useState("");
  const prev = useRef(Date.now());
  const seen = useRef(new Set<string>());
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const from = Math.max(prev.current, now - 15 * 60 * 1000);
      prev.current = now;
      const hits = tasksCrossingDue(getState().lists, from, now).filter((hit) => {
        const key = `${hit.id}:${hit.dueAt}`;
        if (seen.current.has(key)) return false;
        seen.current.add(key);
        return true;
      });
      if (!hits.length) return;
      const titles = hits.map((hit) => hit.title);
      setText(titles.length === 1 ? `Due now: ${titles[0]}` : `Due now: ${titles.slice(0, 3).join(", ")}`);
      signalDue();
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  return [text, () => setText("")];
}

export function ChecklistApp({
  initialPanel = false,
  initialExpanded = [],
}: {
  initialPanel?: boolean;
  initialExpanded?: string[];
}) {
  const state = useChecklist();
  const list = activeList(state);
  const [now, setNow] = useState(() => new Date());
  const [panel, setPanel] = useState(initialPanel);
  const [toast, setToast] = useState("");
  const [dueText, dismissDue] = useDueNotice();
  const look = currentAppearance(state);
  const lookKey = `${look.source}:${look.texture}:${Object.values(look.colors).join()}`;

  useEffect(() => {
    if (panel) return;
    applyAppearance(currentAppearance(state));
  }, [lookKey, state, panel]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel]);

  useChecklistRuntime();

  async function onVoice() {
    const message = await handleVoiceTap(recognizeSpeech);
    setToast(message);
    window.setTimeout(() => setToast(""), 4000);
  }

  return (
    <NowContext.Provider value={now}>
      <main data-screen="list" className="screen mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center gap-2">
          <ListSelect />
          <div className="ml-auto flex shrink-0 gap-2">
            <button type="button" aria-label="Voice command" className="flex size-11 items-center justify-center rounded-card border border-line bg-surface" onClick={() => void onVoice()}>
              <Mic aria-hidden="true" className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Settings"
              aria-expanded={panel}
              className="flex size-11 items-center justify-center rounded-card border border-line bg-surface"
              onClick={() => setPanel(true)}
            >
              <Settings aria-hidden="true" className="size-5" />
            </button>
          </div>
        </div>
        {list ? <ListPanel list={list} initialExpanded={initialExpanded} /> : <p className="text-muted">Add a list to start.</p>}
      </main>
      {panel ? <GearPanel list={list} dueText={dueText} onClose={() => setPanel(false)} onDismissDue={dismissDue} /> : null}
      {toast ? (
        <p className="voice-toast" role="status">
          {toast}
        </p>
      ) : null}
    </NowContext.Provider>
  );
}
