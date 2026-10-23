import { Pencil } from "lucide-react";
import { useEffect, useState, useSyncExternalStore, type MouseEvent } from "react";
import { ListAddTask, ListPanel } from "@/components/checklist/app";
import { ColumnTools, FireShiftPanel, ShareList } from "@/components/checklist/gear-panel";
import { RenameControl } from "@/components/checklist/rename-control";
import { canDeleteList, followInApp, nextDeletePhase } from "@/lib/checklist/list-edit";
import {
  applyEditedTheme,
  applyTexture,
  deleteList,
  getSeed,
  getState,
  renameList,
  setActive,
  setListTheme,
  setMessage,
  subscribe,
} from "@/lib/checklist/store";
import { appearanceFor, applyAppearance, COLOR_FIELDS, listSelection, PRESET_LABELS, TEXTURES } from "@/lib/checklist/theme";
import type { List, TextureId, ThemeColors, ThemeId } from "@/lib/checklist/types";

function useChecklist() {
  return useSyncExternalStore(subscribe, getState, getSeed);
}

function openHref(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  followInApp(href);
}

function ListThemeEditor({ list }: { list: List }) {
  const state = useChecklist();
  const appearance = appearanceFor(list, state.settings);
  const selected = listSelection(list.theme);
  return (
    <section aria-label={`Theme for ${list.name}`} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
      <h2 className="text-xl">Theme</h2>
      <p className="fine text-muted">Colors here belong to {list.name} only. The other lists keep their own.</p>
      <button
        type="button"
        className="min-h-14 rounded-card border border-line bg-canvas px-3"
        onClick={() => setListTheme(list.id, null)}
      >
        Use app default
      </button>
      <div role="radiogroup" aria-label={`Preset themes for ${list.name}`} className="flex flex-wrap gap-2">
        {PRESET_LABELS.map((theme) => (
          <button
            key={theme.id}
            type="button"
            role="radio"
            aria-checked={selected === theme.id}
            className={`flex min-h-11 items-center gap-2 rounded-card border px-3 ${selected === theme.id ? "border-accent bg-canvas" : "border-line bg-canvas"}`}
            onClick={() => setListTheme(list.id, theme.id as ThemeId)}
          >
            <span className={`swatch swatch-${theme.id}`} aria-hidden="true" />
            {theme.label}
          </button>
        ))}
      </div>
      <div role="radiogroup" aria-label={`Textures for ${list.name}`} className="flex flex-wrap gap-2">
        {TEXTURES.map((texture) => (
          <button
            key={texture.id}
            type="button"
            role="radio"
            aria-checked={appearance.texture === texture.id}
            className={`flex min-h-11 items-center gap-2 rounded-card border px-3 ${appearance.texture === texture.id ? "border-accent bg-canvas" : "border-line bg-canvas"}`}
            onClick={() => applyTexture(list.id, texture.id as TextureId)}
          >
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
              aria-label={`${field.label} for ${list.name}`}
              className="h-11 w-16 cursor-pointer rounded-card border border-line bg-canvas"
              value={appearance.colors[field.key]}
              onChange={(event) => {
                const colors: ThemeColors = { ...appearance.colors, [field.key]: event.target.value };
                applyEditedTheme(list.id, colors, appearance.texture);
              }}
            />
          </label>
        ))}
      </div>
    </section>
  );
}

function DeleteListBlock({ list }: { list: List }) {
  const [phase, setPhase] = useState<"idle" | "confirm">("idle");
  if (!canDeleteList(list)) {
    return <p className="rounded-card border border-line bg-canvas p-3 text-muted">Daily fills each morning and can't be deleted.</p>;
  }
  if (phase === "confirm") {
    return (
      <div className="flex flex-col gap-2 rounded-card border border-line bg-canvas p-3" role="group" aria-label={`Delete ${list.name}`}>
        <p>Delete {list.name} and its items?</p>
        <div className="flex flex-wrap gap-2">
          <a
            href="/"
            className="settings-strip"
            onClick={(event) => {
              if (nextDeletePhase(phase) !== "commit") {
                event.preventDefault();
                return;
              }
              const error = deleteList(list.id);
              if (error) {
                event.preventDefault();
                setMessage(error);
                return;
              }
              openHref(event, "/");
            }}
          >
            Delete this list
          </a>
          <button type="button" className="tap rounded-card border border-line px-3" onClick={() => setPhase("idle")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="min-h-14 rounded-card border border-line px-3 text-muted"
      onClick={() => {
        if (nextDeletePhase(phase) === "confirm") setPhase("confirm");
      }}
    >
      Delete list
    </button>
  );
}

export function ListEditScreen({ listId }: { listId: string }) {
  const state = useChecklist();
  const list = state.lists.find((item) => item.id === listId && !item.deletedAt) ?? null;
  const look = list ? appearanceFor(list, state.settings) : null;
  const lookKey = look ? `${look.source}:${look.texture}:${Object.values(look.colors).join()}` : "";

  const editingId = list?.id ?? null;
  useEffect(() => {
    if (!editingId || getState().activeId === editingId) return;
    setActive(editingId);
  }, [editingId]);

  useEffect(() => {
    if (!list) return;
    applyAppearance(appearanceFor(list, state.settings));
  }, [list, state.settings, lookKey]);

  if (!list) {
    return (
      <main data-screen="list-edit" data-list-id="" className="screen mx-auto flex w-full max-w-3xl flex-col gap-4">
        <a href="/" className="settings-strip" onClick={(event) => openHref(event, "/")}>
          Back
        </a>
        <p className="text-muted">That list isn't here.</p>
      </main>
    );
  }

  return (
    <main data-screen="list-edit" data-list-id={list.id} className="screen mx-auto flex w-full max-w-3xl flex-col gap-4">
      <a href="/" className="settings-strip" onClick={(event) => openHref(event, "/")}>
        Back
      </a>
      <header className="flex items-center gap-2">
        <Pencil aria-hidden="true" className="size-5 shrink-0" />
        <h1 className="min-w-0 text-2xl leading-tight">Edit {list.name}</h1>
      </header>
      <RenameControl
        value={list.name}
        disabled={list.system}
        className="list-name"
        onCommit={(next) => renameList(list.id, next)}
      />
      <ListThemeEditor list={list} />
      {list.kind === "fire-dept" ? <FireShiftPanel list={list} /> : null}
      <ColumnTools list={list} />
      <ListAddTask list={list} />
      <ListPanel list={list} />
      <ShareList list={list} />
      <DeleteListBlock list={list} />
    </main>
  );
}
