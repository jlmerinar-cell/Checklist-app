import { useEffect, useState, useSyncExternalStore } from "react";
import { connectCalendar, isNativeShell, listCalendars } from "@/lib/checklist/calendar";
import { downloadCommand, execCommand } from "@/lib/checklist/commands";
import { setDaily } from "@/lib/checklist/daily";
import { SETUP_SQL } from "@/lib/checklist/setup-sql";
import {
  applyEditedTheme,
  applyTexture,
  deleteCustomTheme,
  getSeed,
  getState,
  saveNamedTheme,
  selectSavedTheme,
  setCalendarId,
  setMessage,
  setListTheme,
  setShiftMatch,
  setTheme,
  subscribe,
  visibleLists,
} from "@/lib/checklist/store";
import {
  appAppearance,
  appearanceFor,
  applyAppearance,
  COLOR_FIELDS,
  listSelection,
  PRESET_LABELS,
  TEXTURES,
} from "@/lib/checklist/theme";
import type { TextureId, ThemeColors, ThemeId } from "@/lib/checklist/types";

function useChecklist() {
  return useSyncExternalStore(subscribe, getState, getSeed);
}

function envValue(name: string): string {
  const env = import.meta.env as Record<string, string | undefined> | undefined;
  return env?.[name]?.trim() ?? "";
}

function targetAppearance(target: string, state: ReturnType<typeof getState>) {
  if (target === "app") return appAppearance(state.settings);
  const list = state.lists.find((item) => item.id === target) ?? null;
  return appearanceFor(list, state.settings);
}

export function SettingsScreen({ embedded = false }: { embedded?: boolean }) {
  const state = useChecklist();
  const lists = visibleLists(state.lists);
  const [target, setTarget] = useState("app");
  const [themeName, setThemeName] = useState("My theme");
  const [editingId, setEditingId] = useState<string | null>(null);
  const appearance = targetAppearance(target, state);
  const saved = state.settings.customThemes.filter((theme) => theme.id !== "custom-draft");
  const previewLabel = TEXTURES.find((texture) => texture.id === appearance.texture)?.label ?? "None";

  const previewKey = `${target}:${appearance.source}:${appearance.texture}:${Object.values(appearance.colors).join()}`;

  useEffect(() => {
    applyAppearance(targetAppearance(target, state));
  }, [previewKey, state, target]);

  const shell = embedded ? "flex flex-col gap-4" : "screen mx-auto flex w-full max-w-3xl flex-col gap-4";
  return (
    <div data-screen={embedded ? undefined : "settings"} className={shell}>
      {embedded ? null : (
        <a href="/" className="settings-strip">
          Back to list
        </a>
      )}
      {embedded ? null : (
        <header className="flex items-center gap-3">
          <img src="/favicon.svg" alt="" width={40} height={40} className="logo-mark" />
          <h1 className="text-3xl leading-tight">Settings</h1>
        </header>
      )}
      <StatusBlock />
      <section aria-label="Theme editor" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
        <h2>Theme editor</h2>
        <p className="fine text-muted">
          Built-in themes stay as presets. Saved colors and a texture can be the app default or one list. Use app default on a list clears that list’s override.
        </p>
        <label className="flex flex-col gap-2">
          Apply to
          <select className="field" aria-label="Theme target" value={target} onChange={(event) => setTarget(event.target.value)}>
            <option value="app">App default</option>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
          </select>
        </label>
        <div role="radiogroup" aria-label="Preset themes" className="flex flex-wrap gap-2">
          {PRESET_LABELS.map((theme) => {
            const list = lists.find((item) => item.id === target);
            const selected =
              target === "app"
                ? !state.settings.activeCustomId && state.settings.defaultTheme === theme.id
                : listSelection(list?.theme ?? null) === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`flex min-h-11 items-center gap-2 rounded-card border px-3 ${selected ? "border-accent bg-canvas" : "border-line bg-canvas"}`}
                onClick={() => {
                  setEditingId(null);
                  if (target === "app") setTheme(theme.id as ThemeId);
                  else setListTheme(target, theme.id);
                }}
              >
                <span className={`swatch swatch-${theme.id}`} aria-hidden="true" />
                {theme.label}
              </button>
            );
          })}
        </div>
        <div
          className="texture-sample texture-preview"
          data-texture-sample={appearance.texture}
          data-texture-preview={appearance.texture}
        >
          <span className="texture-preview-label">{previewLabel}</span>
        </div>
        <div role="radiogroup" aria-label="Textures" className="flex flex-wrap gap-2">
          {TEXTURES.map((texture) => (
            <button
              key={texture.id}
              type="button"
              role="radio"
              aria-checked={appearance.texture === texture.id}
              className={`flex min-h-11 items-center gap-2 rounded-card border px-3 ${appearance.texture === texture.id ? "border-accent bg-canvas" : "border-line bg-canvas"}`}
              onClick={() => applyTexture(target, texture.id as TextureId, editingId)}
            >
              <span className="texture-sample texture-dot" data-texture-sample={texture.id} aria-hidden="true" />
              {texture.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          {COLOR_FIELDS.map((field) => (
            <label key={field.key} className="flex min-h-11 items-center justify-between gap-3">
              <span>{field.label}</span>
              <input
                type="color"
                aria-label={field.label}
                className="h-11 w-16 cursor-pointer rounded-card border border-line bg-canvas"
                value={appearance.colors[field.key]}
                onChange={(event) => {
                  const colors: ThemeColors = { ...appearance.colors, [field.key]: event.target.value };
                  applyEditedTheme(target, colors, appearance.texture, editingId);
                }}
              />
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-2">
          Theme name
          <input className="field" aria-label="Theme name" value={themeName} onChange={(event) => setThemeName(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-14 flex-1 rounded-card bg-accent px-3 text-on-accent"
            onClick={() => {
              const id = saveNamedTheme(themeName, appearance.colors, appearance.texture, target, editingId);
              setEditingId(id);
              const savedTheme = getState().settings.customThemes.find((theme) => theme.id === id);
              if (savedTheme) setThemeName(savedTheme.name);
            }}
          >
            {editingId ? "Save changes" : "Save theme"}
          </button>
          <button
            type="button"
            className="min-h-14 rounded-card border border-line bg-canvas px-3"
            onClick={() => {
              setEditingId(null);
              setThemeName("My theme");
            }}
          >
            New theme
          </button>
        </div>
        {saved.length ? (
          <div className="flex flex-col gap-2">
            <p>Saved themes</p>
            {saved.map((theme) => (
              <div key={theme.id} className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 flex-1 rounded-card border border-line bg-canvas px-3"
                  onClick={() => selectSavedTheme(target, theme.id)}
                >
                  Use {theme.name}
                </button>
                <button
                  type="button"
                  aria-label={`Edit ${theme.name}`}
                  className="min-h-11 rounded-card border border-line px-3"
                  onClick={() => {
                    setThemeName(theme.name);
                    setEditingId(theme.id);
                    selectSavedTheme(target, theme.id);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-card border border-line px-3 text-muted"
                  onClick={() => {
                    if (editingId === theme.id) setEditingId(null);
                    deleteCustomTheme(theme.id);
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted">No saved themes yet. Pick colors, name them, and save.</p>
        )}
      </section>
      <DailyBlock enabled={state.settings.dailyEnabled} />
      <NotificationsBlock />
      <ShiftBlock />
      <button type="button" onClick={() => downloadCommand()} className="min-h-14 rounded-card border border-line bg-surface">
        Download
      </button>
      <CommandBlock message={state.message} />
      <SetupBlock />
    </div>
  );
}

function StatusBlock() {
  const state = useChecklist();
  const configured = Boolean(envValue("VITE_SUPABASE_URL") && envValue("VITE_SUPABASE_ANON_KEY") && envValue("VITE_SYNC_SPACE_ID"));
  const label = !configured
    ? "On this phone"
    : state.sync === "live"
      ? "Live"
      : state.sync === "syncing"
        ? "Syncing"
        : state.sync === "offline"
          ? "Offline"
          : state.sync === "reconnecting"
            ? "Reconnecting"
            : "On this phone";
  const native = isNativeShell() || state.calendar === "native";
  const calendarLabel =
    state.calendar === "connected" ? "Connected" : state.calendar === "expired" ? "Reconnect calendar" : "Calendar";
  return (
    <section aria-label="Sync status" className="flex flex-col gap-2">
      <p role="status">{label}</p>
      {native ? (
        <p className="fine text-muted">Calendar sign-in works in the browser version</p>
      ) : (
        <button
          type="button"
          onClick={() => {
            void connectCalendar().then((result) => setMessage(result.message));
          }}
          className="min-h-14 rounded-card border border-line bg-surface px-3"
        >
          {calendarLabel}
        </button>
      )}
      {state.migrationError ? <p className="text-muted">{state.migrationError}</p> : null}
      {state.syncDetail ? <p className="text-muted">{state.syncDetail}</p> : null}
      {state.calendarDetail ? <p className="text-muted">{state.calendarDetail}</p> : null}
      {state.dailyError ? <p className="text-muted">{state.dailyError}</p> : null}
    </section>
  );
}

function DailyBlock({ enabled }: { enabled: boolean }) {
  return (
    <section aria-label="Morning daily">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className="flex min-h-14 w-full items-center justify-between rounded-card border border-line bg-surface px-3"
        onClick={() => setDaily(!enabled)}
      >
        <span>Morning daily</span>
        <span className={enabled ? "text-accent" : "text-muted"}>{enabled ? "On" : "Off"}</span>
      </button>
    </section>
  );
}

function NotificationsBlock() {
  const [note, setNote] = useState("");
  return (
    <section aria-label="Notifications" className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      <h2>Notifications</h2>
      <p className="fine text-muted">
        Due reminders stay on this phone. Checking, editing, or deleting a task cancels the old alert and schedules the new time. The list still works if notifications are blocked.
      </p>
      <button
        type="button"
        className="min-h-14 rounded-card border border-line bg-canvas px-3"
        onClick={() => {
          if (typeof Notification === "undefined") {
            setNote("This browser has no notification permission to grant.");
            return;
          }
          void Notification.requestPermission().then((result) => setNote(`Notifications are ${result}.`));
        }}
      >
        Allow notifications
      </button>
      {note ? <p className="text-muted">{note}</p> : null}
    </section>
  );
}

function ShiftBlock() {
  const state = useChecklist();
  const [calendars, setCalendars] = useState<{ id: string; summary: string }[]>([]);
  const [match, setMatch] = useState(state.settings.shiftMatch);
  useEffect(() => {
    setMatch(state.settings.shiftMatch);
  }, [state.settings.shiftMatch]);
  useEffect(() => {
    let gone = false;
    void listCalendars().then((rows) => {
      if (!gone) setCalendars(rows);
    });
    return () => {
      gone = true;
    };
  }, [state.calendar]);
  const current = state.settings.calendarId || "primary";
  const known = new Set(calendars.map((item) => item.id));
  const primaryName = calendars.find((item) => item.id === "primary")?.summary ?? "Primary";
  return (
    <section aria-label="Shift calendar" className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
      <h2>Shift calendar</h2>
      <p className="fine text-muted">
        Fire department reset uses this calendar. A shift day is an event titled “{state.settings.shiftMatch}”. Start list and Last shift stay on that list.
      </p>
      <label className="flex flex-col gap-2">
        Shift calendar
        <select className="field" aria-label="Shift calendar" value={current} onChange={(event) => setCalendarId(event.target.value)}>
          <option value="primary">{primaryName}</option>
          {calendars
            .filter((item) => item.id !== "primary")
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.summary}
              </option>
            ))}
          {current !== "primary" && !known.has(current) ? <option value={current}>{current}</option> : null}
        </select>
      </label>
      <label className="flex flex-col gap-2">
        Shift day title
        <input
          className="field"
          aria-label="Shift day title"
          value={match}
          onChange={(event) => setMatch(event.target.value)}
          onBlur={() => setShiftMatch(match)}
        />
      </label>
    </section>
  );
}

function CommandBlock({ message }: { message: string }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-col gap-2 border-t border-line pt-3"
      onSubmit={(event) => {
        event.preventDefault();
        const command = value.trim();
        if (!command) return;
        void execCommand(command);
        setValue("");
      }}
    >
      <label className="flex flex-col gap-2" htmlFor="checklist-command">
        Command
        <input
          id="checklist-command"
          className="field"
          value={value}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          placeholder="checklist add fire-dept check hydrant map"
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit" className="min-h-14 rounded-card border border-line bg-surface">
        Run
      </button>
      <p className="fine max-h-40 min-h-8 overflow-auto whitespace-pre-wrap text-muted" role="status" aria-live="polite">
        {message}
      </p>
    </form>
  );
}

function SetupBlock() {
  const [copied, setCopied] = useState(false);
  return (
    <details className="rounded-card border border-line bg-surface p-3">
      <summary className="min-h-11 cursor-pointer">Sync setup</summary>
      <div className="fine mt-3 flex flex-col gap-3">
        <p>
          Add VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, and VITE_SYNC_SPACE_ID yourself. With any of them missing, the app stays on this phone. VITE_GOOGLE_CLIENT_ID is optional.
        </p>
        <p>Paste this into the Supabase SQL editor. The sync space id works like a password, so keep it long and random.</p>
        <textarea className="field min-h-40 font-mono" readOnly value={SETUP_SQL} aria-label="Supabase setup SQL" />
        <button
          type="button"
          className="min-h-11 rounded-card border border-line px-3"
          onClick={() => {
            void navigator.clipboard.writeText(SETUP_SQL).then(() => setCopied(true));
          }}
        >
          {copied ? "SQL copied" : "Copy SQL"}
        </button>
      </div>
    </details>
  );
}
