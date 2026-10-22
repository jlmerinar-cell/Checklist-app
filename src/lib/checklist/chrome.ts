/** The list switcher is on the main screen only when there is more than one list. */
export function showListSwitcher(count: number): boolean {
  return count > 1;
}
