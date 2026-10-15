import { useRef, useState } from "react";
import { createList, deleteList, renameList } from "@/lib/checklist/actions";
import { useChecklist } from "@/lib/checklist/useChecklist";
import { switchTab } from "@/lib/checklist/actions";

export function TabBar() {
  const { lists, activeId } = useChecklist();
  const [menuId, setMenuId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [armed, setArmed] = useState(false);
  const held = useRef(false);
  const timer = useRef<number | null>(null);
  const menuList = lists.find((list) => list.id === menuId) ?? null;

  function openMenu(listId: string, name: string) {
    setMenuId(listId);
    setDraft(name);
    setArmed(false);
  }

  function startHold(listId: string, name: string) {
    held.current = false;
    timer.current = window.setTimeout(() => {
      held.current = true;
      openMenu(listId, name);
    }, 500);
  }

  function endHold() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Checklists" className="flex gap-2 overflow-x-auto pb-1">
        {lists.map((list) => {
          const selected = list.id === activeId;
          const tone = selected ? "bg-accent text-on-accent" : "bg-surface text-ink";
          return (
            <div
              key={list.id}
              className={`flex shrink-0 overflow-hidden rounded-card border ${selected ? "border-accent" : "border-line"}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                className={`min-h-14 px-3 ${tone}`}
                onPointerDown={() => startHold(list.id, list.name)}
                onPointerUp={endHold}
                onPointerLeave={endHold}
                onPointerCancel={endHold}
                onContextMenu={(event) => {
                  event.preventDefault();
                  openMenu(list.id, list.name);
                }}
                onClick={() => {
                  if (held.current) {
                    held.current = false;
                    return;
                  }
                  switchTab(list.slug);
                }}
              >
                {list.name}
              </button>
              <button
                type="button"
                aria-label={`Rename or delete ${list.name}`}
                className={`min-h-14 border-l px-3 ${tone} ${selected ? "border-on-accent" : "border-line text-muted"}`}
                onClick={() => (menuId === list.id ? setMenuId(null) : openMenu(list.id, list.name))}
              >
                ···
              </button>
            </div>
          );
        })}
        <button
          type="button"
          aria-label="Add list"
          className="min-h-14 min-w-14 shrink-0 rounded-card border border-line bg-surface px-3"
          onClick={() => {
            const result = createList("New list");
            if (result.ref) openMenu(result.ref, "New list");
          }}
        >
          +
        </button>
      </div>
      {menuList?.system ? (
        <p className="rounded-card border border-line bg-surface p-3 text-muted">
          Daily fills each morning and can't be deleted.
        </p>
      ) : menuList ? (
        <form
          className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3"
          onSubmit={(event) => {
            event.preventDefault();
            renameList(menuList.slug, draft);
            setMenuId(null);
          }}
        >
          <label className="flex flex-col gap-2">
            List name
            <input className="field" value={draft} onChange={(event) => setDraft(event.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="min-h-14 rounded-card border border-line px-3">
              Rename
            </button>
            <button
              type="button"
              className="min-h-14 rounded-card border border-line px-3 text-muted"
              onClick={() => {
                if (!armed) {
                  setArmed(true);
                  return;
                }
                deleteList(menuList.slug);
                setMenuId(null);
              }}
            >
              {armed ? "Tap again to delete" : "Delete"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
