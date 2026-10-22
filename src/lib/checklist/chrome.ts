/** The list switcher is on the main screen only when there is more than one list. */
export function showListSwitcher(count: number): boolean {
  return count > 1;
}

/** Daily stays out of the switcher until Morning daily is on. */
export function listsForSwitcher<T extends { kind: string }>(lists: T[], dailyEnabled: boolean): T[] {
  if (dailyEnabled) return lists;
  return lists.filter((list) => list.kind !== "daily");
}

export function emptyListCopy(kind: string, calendarOnThisPhone: boolean): string {
  if (kind !== "daily") return "Nothing on this list yet.";
  if (!calendarOnThisPhone) {
    return "Calendar isn't available on this phone. Daily needs the calendar. Calendar sign-in works in the browser version.";
  }
  return "Daily needs the calendar. Connect it and today's events show up here.";
}
