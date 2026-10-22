import { useEffect, useState, useSyncExternalStore } from "react";
import { RenameControl } from "@/components/checklist/rename-control";
import { SettingsScreen } from "@/components/checklist/settings-screen";
import { isNativeShell } from "@/lib/checklist/calendar";
import { shareBlurb, shareCommand, switchCommand } from "@/lib/checklist/commands";
import { completion } from "@/lib/checklist/score";
import {
  addColumn,
  addTask,
  columnsOf,
  createList,
  deleteList,
  destinationColumn,
  getSeed,
  getState,
  moveColumn,
  moveListByDir,
  removeColumn,
  renameColumn,
  renameList,
  setMessage,
  startFireList,
  subscribe,
  undoFireStart,
  visibleLists,
} from "@/lib/checklist/store";
import { syncConfig } from "@/lib/checklist/sync";
import type { List } from "@/lib/checklist/types";

function useChecklist() {
  return useSyncExternalStore(subscribe, getState, getSeed);
}

function formatShiftDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function ListMenu() {
  const state = useChecklist();
  const lists = visibleLists(state.lists);
  const active = lists.find((list) => list.id === state.activeId) ?? null;
  const [menuId, setMenuId] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const menu = lists.find((list) => list.id === menuId) ?? null;
  useEffect(() => {
    if (!armed) return;
    const id = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(id);
  }, [armed]);

  function openMenu(list: List) {
    setMenuId(list.id);
    setArmed(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <img src="/favicon.svg" alt="" width={40} height={40} className="logo-mark" />
        {active ? (
          <RenameControl
            value={active.name}
            disabled={Boolean(active.system)}
            className="list-name"
            onCommit={(next) => renameList(active.id, next)}
          />
        ) : (
          <h2 className="min-w-0 flex-1 truncate text-2xl">Checklist</h2>
        )}
        <button
          type="button"
          aria-label="Add list"
          className="min-h-14 min-w-14 shrink-0 rounded-card border border-line bg-canvas px-3"
          onClick={() => {
            const list = createList("New list");
            openMenu(list);
            switchCommand(list.slug);
          }}
        >
          +
        </button>
        {active ? (
          <button
            type="button"
            aria-label={`Reorder or delete ${active.name}`}
            className="min-h-14 min-w-14 shrink-0 rounded-card border border-line bg-canvas px-3"
            onClick={() => (menuId === active.id ? setMenuId(null) : openMenu(active))}
          >
            ···
          </button>
        ) : null}
      </div>
      {menu?.system ? (
        <p className="rounded-card border border-line bg-canvas p-3 text-muted">Daily fills each morning and can't be deleted.</p>
      ) : menu ? (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-canvas p-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="tap flex-1 rounded-card border border-line px-3" onClick={() => moveListByDir(menu.id, -1)}>
              Up
            </button>
            <button type="button" className="tap flex-1 rounded-card border border-line px-3" onClick={() => moveListByDir(menu.id, 1)}>
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
                deleteList(menu.id);
                setMenuId(null);
              }}
            >
              {armed ? "Tap again to delete" : "Delete"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FireShiftPanel({ list }: { list: List }) {
  const state = useChecklist();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState("");
  const [canUndo, setCanUndo] = useState(false);
  const native = isNativeShell() || state.calendar === "native";
  const record = [...list.shiftHistory].reverse().find((entry) => entry.day === list.lastShift?.day);
  const summary = list.lastShift
    ? `Last shift ${formatShiftDay(list.lastShift.day)}: ${list.lastShift.done} of ${list.lastShift.total}${record ? `, ${record.onTime} on time` : ""}`
    : "Last shift: not recorded yet";
  useEffect(() => {
    if (!confirming) return;
    const id = window.setTimeout(() => setConfirming(false), 4000);
    return () => window.clearTimeout(id);
  }, [confirming]);
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line bg-canvas p-3">
      <p>{summary}</p>
      <p className="fine text-muted">
        On a shift day this list clears at 9:00 AM Eastern, once. A shift day is a calendar event titled “{state.settings.shiftMatch}”.
      </p>
      {native ? (
        <p>Calendar isn't available on this phone. Calendar sign-in works in the browser version.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="min-h-14 rounded-card bg-accent px-3 text-on-accent"
          onClick={() => {
            if (!confirming) {
              setConfirming(true);
              return;
            }
            const outcome = startFireList();
            setResult(outcome.message);
            setCanUndo(outcome.ok);
            setConfirming(false);
          }}
        >
          {confirming ? "Clear every check?" : "Start list"}
        </button>
        <span className="text-muted">Manual start</span>
        {canUndo ? (
          <button
            type="button"
            className="min-h-14 rounded-card border border-line bg-canvas px-3"
            onClick={() => {
              const outcome = undoFireStart();
              setResult(outcome.message);
              setCanUndo(false);
            }}
          >
            Undo
          </button>
        ) : null}
        {result ? (
          <p className="min-w-0 flex-1" role="status">
            {result}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ColumnTools({ list }: { list: List }) {
  const [columnName, setColumnName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const columns = columnsOf(list);
  const destination = confirmId ? destinationColumn(columns, confirmId) : null;
  useEffect(() => {
    if (!confirmId) return;
    const id = window.setTimeout(() => setConfirmId(null), 4000);
    return () => window.clearTimeout(id);
  }, [confirmId]);
  return (
    <div className="flex flex-col gap-3">
      {columns.map((column, index) => (
        <div key={column.id} className="flex flex-col gap-2 rounded-card border border-line bg-canvas p-3">
          <label className="flex flex-col gap-2">
            Column
            <input
              className="field"
              aria-label={`Column name ${column.name}`}
              value={column.name}
              onChange={(event) => renameColumn(list.id, column.id, event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-card border border-line px-3" onClick={() => moveColumn(list.id, column.id, -1)} disabled={index <= 0}>
              Up
            </button>
            <button
              type="button"
              className="min-h-11 rounded-card border border-line px-3"
              onClick={() => moveColumn(list.id, column.id, 1)}
              disabled={index >= columns.length - 1}
            >
              Down
            </button>
            <button
              type="button"
              className="min-h-11 rounded-card border border-line px-3 text-muted"
              onClick={() => {
                if (confirmId !== column.id) {
                  setConfirmId(column.id);
                  return;
                }
                removeColumn(list.id, column.id);
                setConfirmId(null);
              }}
              disabled={columns.length <= 1}
            >
              {confirmId === column.id ? "Tap Remove again" : "Remove"}
            </button>
          </div>
        </div>
      ))}
      {confirmId && destination ? (
        <p className="text-muted">Tap Remove again to move those items into {destination.name}.</p>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const error = addColumn(list.id, columnName);
          if (!error) setColumnName("");
          else setMessage(error);
        }}
      >
        <label className="flex flex-col gap-2" htmlFor="new-column">
          New column
          <input id="new-column" className="field" value={columnName} placeholder="Night" onChange={(event) => setColumnName(event.target.value)} />
        </label>
        <button type="submit" className="min-h-14 rounded-card border border-line bg-canvas">
          Add column
        </button>
      </form>
    </div>
  );
}

function AddTask({ list }: { list: List }) {
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
      }}
    >
      <label className="flex flex-col gap-2" htmlFor="new-task">
        New task
        <input id="new-task" className="field" value={draft} enterKeyHint="done" placeholder="Add a task" onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button type="submit" className="min-h-14 rounded-card bg-accent px-3 text-on-accent">
        Add
      </button>
    </form>
  );
}

function ShareList({ list }: { list: List }) {
  const [link, setLink] = useState("");
  useEffect(() => {
    if (!list.shared) {
      setLink("");
      return;
    }
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("list", list.slug);
    setLink(url.toString());
  }, [list.shared, list.slug]);
  return (
    <div className="flex flex-col gap-2">
      <button type="button" className="min-h-14 rounded-card border border-line bg-canvas" onClick={() => void shareCommand(list.slug)}>
        {list.shared ? "Copy this list's link" : "Share this list"}
      </button>
      <p className="text-muted">{shareBlurb(list.name, syncConfig() !== null)}</p>
      {link ? <input readOnly aria-label="Invite link" className="field" value={link} onFocus={(event) => event.currentTarget.select()} /> : null}
    </div>
  );
}

export function GearPanel({
  list,
  dueText,
  onClose,
  onDismissDue,
}: {
  list: List | null;
  dueText: string;
  onClose: () => void;
  onDismissDue: () => void;
}) {
  const stats = list ? completion(list.tasks) : null;
  return (
    <>
      <button type="button" className="gear-scrim" aria-label="Close settings" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Settings" className="gear-panel">
        <div className="gear-head">
          <h2 className="text-xl">Settings</h2>
          <button type="button" aria-label="Close settings" className="gear-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="gear-body">
        {dueText ? (
          <div className="due-banner due-banner-inline" role="status">
            <p>{dueText}</p>
            <button type="button" className="min-h-11 shrink-0 rounded-card border border-on-accent px-3" onClick={onDismissDue}>
              Dismiss
            </button>
          </div>
        ) : null}
        <ListMenu />
        {list && stats ? (
          <div className="flex flex-col gap-2">
            <p aria-live="polite">{stats.label}</p>
            <p className="text-muted">Score {stats.points}</p>
            <div className="h-3 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stats.pct} aria-label={stats.label}>
              <div className="h-full bg-accent" style={{ width: `${stats.pct}%` }} />
            </div>
          </div>
        ) : null}
        {list?.kind === "fire-dept" ? <FireShiftPanel list={list} /> : null}
        {list ? <ColumnTools list={list} /> : null}
        {list ? <AddTask list={list} /> : null}
        {list ? <ShareList list={list} /> : null}
        <SettingsScreen embedded />
        </div>
      </div>
    </>
  );
}
