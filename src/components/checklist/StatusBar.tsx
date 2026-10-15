import { connectCalendar } from "@/lib/checklist/actions";
import { calendarConfigured } from "@/lib/checklist/calendar";
import type { SyncState } from "@/lib/checklist/types";
import { useChecklist } from "@/lib/checklist/useChecklist";

function syncLabel(sync: SyncState): string {
  if (sync === "live") return "Live";
  if (sync === "syncing") return "Syncing";
  if (sync === "offline") return "Offline";
  if (sync === "reconnecting") return "Reconnecting";
  return "On this phone";
}

export function StatusBar() {
  const snap = useChecklist();
  const calendarLabel =
    snap.calendar === "connected" ? "Connected" : snap.calendar === "expired" ? "Reconnect" : "Calendar";
  const dot =
    snap.sync === "live"
      ? "bg-accent"
      : snap.sync === "offline" || snap.sync === "reconnecting"
        ? "bg-line"
        : "bg-muted";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-3" role="status" aria-live="polite">
          <span className={`inline-block size-4 shrink-0 rounded-full ${dot}`} aria-hidden />
          <span>{syncLabel(snap.sync)}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            void connectCalendar();
          }}
          className="min-h-14 shrink-0 rounded-card border border-line bg-surface px-3 text-ink"
        >
          {calendarLabel}
        </button>
      </div>
      {snap.syncDetail ? <p className="text-muted">{snap.syncDetail}</p> : null}
      {snap.dailyError ? <p className="text-muted">{snap.dailyError}</p> : null}
      {calendarConfigured() && snap.calendar !== "connected" ? (
        <p className="text-muted">Testing mode: only Google accounts you added as test users can connect.</p>
      ) : null}
    </div>
  );
}
