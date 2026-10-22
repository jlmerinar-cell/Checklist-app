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
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { GearPanel } from "@/components/checklist/gear-panel";
import { RenameControl } from "@/components/checklist/rename-control";
import { useChecklistRuntime } from "@/components/checklist/runtime";
import { isNativeShell } from "@/lib/checklist/calendar";
import { emptyListCopy, listsForSwitcher, showListSwitcher } from "@/lib/checklist/chrome";
import { switchCommand } from "@/lib/checklist/commands";
import { dueTone, formatCountdown, tasksCrossingDue } from "@/lib/checklist/countdown";
import { signalDue } from "@/lib/checklist/notify";
import { completion } from "@/lib/checklist/score";
import { cancelSpeech, recognizeSpeech, SpeechUnavailableError, speechReady } from "@/lib/checklist/speech";
import {
  activeList,
  addTask,
  columnsOf,
  currentAppearance,
  deleteTask,
  getSeed,
  getState,
  moveTaskByDir,
  moveTaskByDrop,
  renameList,
  saveNotes,
  setActive,
  setDone,
  setDueAt,
  setMessage,
  setNotesDraft,
  setTitle,
  subscribe,
  tasksIn,
  visibleLists,
} from "@/lib/checklist/store";
import { applyAppearance, columnSlotFor, inkFor } from "@/lib/checklist/theme";
import { clockFromIso, dueAtFromLocalClock, parseClock } from "@/lib/checklist/time";
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
  const lists = listsForSwitcher(visibleLists(state.lists), state.settings.dailyEnabled);
  if (!showListSwitcher(lists.length)) return null;
  const active = lists.find((list) => list.id === state.activeId) ?? null;
  return (
    <div className="list-switch">
      <ChevronDown aria-hidden="true" className="size-6" />
      <select
        aria-label="Switch list"
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
    </div>
  );
}

function ListName({ list }: { list: List | null }) {
  if (!list) return null;
  return (
    <RenameControl
      value={list.name}
      disabled={list.system}
      className="list-name"
      onCommit={(next) => renameList(list.id, next)}
    />
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
  const [draft, setDraft] = useState<{ title: string; due: string; focus: "title" | "due" } | null>(null);
  const [session, setSession] = useState(0);
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dueRef = useRef<HTMLInputElement>(null);
  const closing = useRef<"commit" | "cancel" | null>(null);
  useEffect(() => setLive(true), []);
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const tone = live ? dueTone(task.dueAt, task.done, now) : "none";
  const countdown = task.dueAt ? formatCountdown(task.dueAt, now) : "";
  const noteLine = task.notes.trim().split("\n")[0] ?? "";
  const hasNotes = noteLine.length > 0;

  const focusOn = draft?.focus ?? null;
  useEffect(() => {
    if (!focusOn) return;
    const node = focusOn === "due" ? dueRef.current : titleRef.current;
    node?.focus();
    if (focusOn === "title") titleRef.current?.select();
  }, [session, focusOn]);

  function begin(focus: "title" | "due") {
    closing.current = null;
    setDraft({ title: task.title, due: clockFromIso(task.dueAt), focus });
    setSession((value) => value + 1);
  }

  function saveDraft(close: boolean) {
    if (!draft || closing.current === "cancel") return;
    const nextTitle = draft.title.trim() || task.title;
    if (nextTitle !== task.title) setTitle(list.id, task.id, nextTitle);
    if (draft.due !== clockFromIso(task.dueAt)) {
      if (!draft.due) setDueAt(list.id, task.id, null);
      else {
        const parsed = parseClock(draft.due);
        if (parsed) setDueAt(list.id, task.id, dueAtFromLocalClock(parsed.hours, parsed.minutes, now));
      }
    }
    if (close) {
      closing.current = "commit";
      setDraft(null);
      return;
    }
    setDraft((current) => (current ? { ...current, title: nextTitle } : current));
  }

  function cancelEdit() {
    closing.current = "cancel";
    setDraft(null);
  }

  function onEditorBlur(event: ReactFocusEvent<HTMLDivElement>) {
    if (closing.current) return;
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    saveDraft(true);
  }

  function onEditorKey(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      saveDraft(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEdit();
    }
  }

  function keepFocus(event: ReactPointerEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-task-id={task.id}
      data-expanded={expanded ? "true" : "false"}
      data-editing={draft ? "true" : "false"}
      className={`task-card flex flex-col rounded-card border border-line bg-surface ${expanded || draft ? "gap-3 p-3" : "task-card-collapsed"} ${isDragging ? "opacity-60" : ""}`}
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
        {draft ? null : (
          <div className="task-copy">
            <button type="button" className="task-title" aria-label={`Edit ${task.title}`} onClick={() => begin("title")}>
              <span className={task.done ? "line-through decoration-2" : ""}>{task.title}</span>
            </button>
            {hasNotes && !expanded ? (
              <button type="button" className="task-note" onClick={onToggle}>
                {noteLine}
              </button>
            ) : null}
          </div>
        )}
        {!draft && countdown ? (
          <button
            type="button"
            className={`due-chip ${tone === "overdue" ? "due-overdue" : tone === "soon" ? "due-soon" : ""}`}
            data-due-chip={tone}
            aria-label={`Edit due time for ${task.title}`}
            onClick={() => begin("due")}
          >
            {countdown}
          </button>
        ) : null}
        {hasNotes ? <span className="notes-dot" aria-label="Has notes" /> : null}
      </div>
      {draft ? (
        <div
          ref={editorRef}
          className="flex flex-col gap-2"
          data-inline-editor="task"
          onBlur={onEditorBlur}
          onKeyDown={onEditorKey}
        >
          <input
            ref={titleRef}
            aria-label={`Edit ${task.title}`}
            className="field min-h-14 text-lg"
            value={draft.title}
            maxLength={200}
            enterKeyHint="done"
            onChange={(event) => setDraft((current) => (current ? { ...current, title: event.target.value } : current))}
          />
          <label className="flex flex-col gap-1 text-muted">
            Due time
            <input
              ref={dueRef}
              type="time"
              className="field min-h-14"
              aria-label={`Edit due time for ${task.title}`}
              value={draft.due}
              onChange={(event) => setDraft((current) => (current ? { ...current, due: event.target.value } : current))}
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              className="tap flex-1 rounded-card border border-line px-3"
              onPointerDown={keepFocus}
              onClick={() => {
                saveDraft(false);
                moveTaskByDir(list.id, task.id, -1);
              }}
            >
              Up
            </button>
            <button
              type="button"
              className="tap flex-1 rounded-card border border-line px-3"
              onPointerDown={keepFocus}
              onClick={() => {
                saveDraft(false);
                moveTaskByDir(list.id, task.id, 1);
              }}
            >
              Down
            </button>
            <button type="button" className="tap flex-1 rounded-card border border-line px-3" onPointerDown={keepFocus} onClick={cancelEdit}>
              Cancel
            </button>
            <button
              type="button"
              className="tap flex-1 rounded-card border border-line px-3"
              onPointerDown={keepFocus}
              onClick={() => {
                saveDraft(false);
                onToggle();
              }}
            >
              Notes
            </button>
          </div>
        </div>
      ) : null}
      {expanded ? (
        <div className="flex flex-col gap-3">
          <button type="button" className="tap rounded-card border border-line px-3" aria-label={`Collapse ${task.title}`} onClick={onToggle}>
            Hide notes
          </button>
          <div className="flex items-start gap-2">
            <button
              type="button"
              className="flex size-14 shrink-0 items-center justify-center rounded-card border border-line text-muted"
              aria-label={`Drag to reorder ${task.title}`}
              {...attributes}
              {...listeners}
            >
              <GripVertical aria-hidden="true" className="size-6" />
            </button>
            {draft ? null : (
              <label className="flex min-w-0 flex-1 flex-col gap-1 text-muted">
                Due time
                <input
                  type="time"
                  className="field min-h-14"
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
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tap flex-1 rounded-card border border-line px-3" onClick={() => moveTaskByDir(list.id, task.id, -1)}>
              Up
            </button>
            <button type="button" className="tap flex-1 rounded-card border border-line px-3" onClick={() => moveTaskByDir(list.id, task.id, 1)}>
              Down
            </button>
            <button
              type="button"
              className="tap rounded-card border border-line px-3 text-muted"
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
              className="tap rounded-card border border-line px-3 text-muted"
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
  const calendarOnThisPhone = !(isNativeShell() || useChecklist().calendar === "native");
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
      {tasksIn(list).length === 0 ? (
        <p className="text-muted">{emptyListCopy(list.kind, calendarOnThisPhone)}</p>
      ) : null}
    </section>
  );
}

function ListProgress({ list }: { list: List }) {
  const stats = completion(list.tasks);
  const label = `${stats.done} of ${stats.total}`;
  return (
    <div className="list-progress">
      <p>{label}</p>
      <div
        className="h-3 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={stats.pct}
        aria-label={label}
      >
        <div className="h-full bg-accent" style={{ width: `${stats.pct}%` }} />
      </div>
    </div>
  );
}

function OverdueBanner({ list, now }: { list: List; now: Date }) {
  const late = tasksIn(list).filter((task) => dueTone(task.dueAt, task.done, now) === "overdue");
  if (!late.length) return null;
  const names = late
    .slice(0, 3)
    .map((task) => task.title)
    .join(", ");
  return (
    <p className="overdue-banner" role="status">
      Overdue: {names}
    </p>
  );
}

function ListAddTask({ list }: { list: List }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const title = draft.trim();
        if (!title) return;
        addTask(list.id, title);
        setDraft("");
        setMessage(`Added ${title}.`);
      }}
    >
      <label className="flex flex-col gap-2" htmlFor="add-task">
        New task
        <input
          id="add-task"
          className="field"
          value={draft}
          enterKeyHint="done"
          placeholder="Add a task"
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <button type="submit" className="min-h-14 rounded-card bg-accent px-3 text-on-accent">
        Add
      </button>
    </form>
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
  const shown = listsForSwitcher(visibleLists(state.lists), state.settings.dailyEnabled);
  const active = activeList(state);
  const list = active && shown.some((item) => item.id === active.id) ? active : (shown[0] ?? null);
  const [now, setNow] = useState(() => new Date());
  const [panel, setPanel] = useState(initialPanel);
  const [toast, setToast] = useState("");
  const [listening, setListening] = useState(false);
  const [dueText, dismissDue] = useDueNotice();
  const voiceCancel = useRef(false);
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

  useEffect(() => {
    if (!panel) return;
    let pushed = false;
    try {
      window.history.pushState({ checklistSheet: true }, "");
      pushed = true;
    } catch {
      pushed = false;
    }
    let consumed = false;
    const onPop = () => {
      consumed = true;
      setPanel(false);
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!pushed || consumed || !window.history.state?.checklistSheet) return;
      try {
        window.history.back();
      } catch {
        /* the sheet entry is already gone */
      }
    };
  }, [panel]);

  useEffect(() => {
    if (state.settings.dailyEnabled) return;
    const current = state.lists.find((item) => item.id === state.activeId);
    if (current?.kind !== "daily") return;
    const next = shown[0];
    if (next) setActive(next.id);
  }, [state.settings.dailyEnabled, state.activeId, state.lists, shown]);

  useEffect(() => {
    if (!state.message) return;
    setToast(state.message);
    const id = window.setTimeout(() => {
      setToast((current) => (current === state.message ? "" : current));
    }, 5000);
    return () => window.clearTimeout(id);
  }, [state.message]);

  useChecklistRuntime();

  async function onVoice() {
    if (listening) return;
    if (!speechReady()) {
      setToast("Speech isn't available on this phone.");
      window.setTimeout(() => setToast(""), 4000);
      return;
    }
    voiceCancel.current = false;
    setListening(true);
    setToast("Listening");
    try {
      const heard = await recognizeSpeech();
      if (voiceCancel.current) {
        setToast("Stopped listening.");
      } else if (!heard || !heard.trim()) {
        setToast("Didn't catch that.");
      } else {
        setToast(await handleVoiceTap(async () => heard));
      }
    } catch (error) {
      setToast(error instanceof SpeechUnavailableError ? error.message : "Didn't catch that.");
    } finally {
      setListening(false);
      window.setTimeout(() => setToast(""), 4000);
    }
  }

  function cancelVoice() {
    voiceCancel.current = true;
    cancelSpeech();
    setListening(false);
    setToast("Stopped listening.");
    window.setTimeout(() => setToast(""), 4000);
  }

  return (
    <NowContext.Provider value={now}>
      <main data-screen="list" className="screen mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <ListName list={list} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <ListSelect />
            <button
              type="button"
              aria-label={listening ? "Listening" : "Voice command"}
              aria-pressed={listening}
              className={listening ? "listen-mic" : "flex size-11 items-center justify-center rounded-card border border-line bg-surface"}
              onClick={() => void onVoice()}
            >
              {listening ? "Listening" : <Mic aria-hidden="true" className="size-5" />}
            </button>
            {listening ? (
              <button type="button" className="tap rounded-card border border-line bg-surface px-3" onClick={cancelVoice}>
                Cancel
              </button>
            ) : null}
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
        {list ? <ListProgress list={list} /> : null}
        {list ? <OverdueBanner list={list} now={now} /> : null}
        {list ? <ListAddTask list={list} /> : null}
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
