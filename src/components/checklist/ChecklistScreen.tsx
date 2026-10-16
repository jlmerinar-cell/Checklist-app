import { useEffect, useState } from "react";
import {
  acceptInvite,
  addTaskToActive,
  bootChecklist,
  downloadLists,
  shareList,
} from "@/lib/checklist/actions";
import { registerBot, unregisterBot } from "@/lib/checklist/bot";
import { startDaily } from "@/lib/checklist/daily";
import { startSpaceSync } from "@/lib/checklist/space-sync";
import { inviteUrl, startSharing } from "@/lib/checklist/sharing";
import { useChecklist } from "@/lib/checklist/useChecklist";
import { CommandBar } from "./CommandBar";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";
import { TaskRow } from "./TaskRow";
import { ThemePicker } from "./ThemeSwitch";

export function ChecklistScreen() {
  const snap = useChecklist();
  const active = snap.lists.find((list) => list.id === snap.activeId) ?? null;
  const [draft, setDraft] = useState("");
  const [link, setLink] = useState("");

  useEffect(() => {
    bootChecklist();
    registerBot();
    const stopShare = startSharing();
    const stopSpace = startSpaceSync();
    const stopDaily = startDaily();
    const invite = new URLSearchParams(window.location.search).get("invite");
    if (invite) void acceptInvite(invite);
    return () => {
      stopSpace();
      stopShare();
      stopDaily();
      unregisterBot();
    };
  }, []);

  useEffect(() => {
    if (!active?.shared) {
      setLink("");
      return;
    }
    setLink(inviteUrl(active.inviteToken));
  }, [active?.shared, active?.inviteToken]);

  return (
    <>
      <main className="screen mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl leading-tight text-balance">Checklist</h1>
          <StatusBar />
          <button
            type="button"
            onClick={() => downloadLists()}
            className="min-h-14 rounded-card border border-line bg-surface"
          >
            Download
          </button>
        </header>
        <TabBar />
        {active ? (
          <section role="tabpanel" aria-label={active.name} className="flex flex-col gap-3">
            {active.tasks.length === 0 ? (
              <p className="text-muted">Nothing on this list yet.</p>
            ) : null}
            {active.tasks.map((task) => (
              <TaskRow key={task.id} listId={active.id} task={task} />
            ))}
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const title = draft.trim();
                if (!title) return;
                addTaskToActive(title);
                setDraft("");
              }}
            >
              <label className="flex flex-col gap-2" htmlFor="new-task">
                New task
                <input
                  id="new-task"
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
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  void shareList(active.slug);
                }}
                className="min-h-14 rounded-card border border-line bg-surface"
              >
                {active.shared ? "Copy this list's link" : "Share this list"}
              </button>
              <p className="text-muted">Only {active.name}. Other lists stay private.</p>
              {link ? (
                <input
                  readOnly
                  aria-label="Invite link"
                  className="field"
                  value={link}
                  onFocus={(event) => event.currentTarget.select()}
                />
              ) : null}
            </div>
          </section>
        ) : (
          <p className="text-muted">Add a list to start.</p>
        )}
        <CommandBar />
      </main>
      <ThemePicker />
    </>
  );
}
