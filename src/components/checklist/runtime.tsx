import { useEffect } from "react";
import { connectCalendar, refreshCalendarStatus, scheduleCalendarFlush } from "@/lib/checklist/calendar";
import { installCommands, registerAsyncCommands, uninstallCommands } from "@/lib/checklist/commands";
import { refreshDaily, setDaily, startDaily } from "@/lib/checklist/daily";
import { startNotifications } from "@/lib/checklist/notify";
import { startShiftWatch } from "@/lib/checklist/shift-watch";
import { getState, hydrate, onData, setActive, setMessage, visibleLists } from "@/lib/checklist/store";
import { startSync } from "@/lib/checklist/sync";

/** Sync, notifications, shift reset, and commands stay up on the list and on Settings. */
export function useChecklistRuntime(): void {
  useEffect(() => {
    hydrate();
    refreshCalendarStatus();
    registerAsyncCommands({
      daily: refreshDaily,
      connect: async () => {
        const result = await connectCalendar();
        setMessage(result.message);
        return result;
      },
      setDaily,
    });
    installCommands();
    const stopSync = startSync();
    const stopDaily = startDaily();
    const stopShift = startShiftWatch();
    const stopNotifications = startNotifications();
    const stopCalendar = onData(() => scheduleCalendarFlush());
    const params = new URLSearchParams(window.location.search);
    const slug = params.get("list");
    const invite = params.get("invite");
    const match = slug
      ? visibleLists().find((item) => item.slug === slug)
      : invite
        ? getState().lists.find((item) => item.inviteToken === invite && !item.deletedAt)
        : undefined;
    if (match) setActive(match.id);
    return () => {
      stopSync();
      stopDaily();
      stopShift();
      stopNotifications();
      stopCalendar();
      uninstallCommands();
    };
  }, []);
}
