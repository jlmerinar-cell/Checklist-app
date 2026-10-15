/**
 * Bot surface. Every action is a function on window.checklist.
 * checklist("checklist add fire-dept check hydrant map") runs the parser.
 */

import {
  addTask,
  changeTheme,
  connectCalendar,
  createList,
  deleteList,
  downloadLists,
  editTitle,
  importLists,
  openNotes,
  refreshDaily,
  renameList,
  saveNotes,
  setDailyEnabled,
  setDueDate,
  shareList,
  switchTab,
  toggleCheckbox,
  upgradeLimits,
} from "./actions";
import { exec } from "./commands";
import type { ActionResult } from "./types";

export type ChecklistApi = {
  (command: string): ActionResult | Promise<ActionResult>;
  createList: typeof createList;
  switchTab: typeof switchTab;
  addTask: typeof addTask;
  editTitle: typeof editTitle;
  toggleCheckbox: typeof toggleCheckbox;
  openNotes: typeof openNotes;
  saveNotes: typeof saveNotes;
  setDueDate: typeof setDueDate;
  changeTheme: typeof changeTheme;
  setDailyEnabled: typeof setDailyEnabled;
  refreshDaily: typeof refreshDaily;
  renameList: typeof renameList;
  deleteList: typeof deleteList;
  downloadLists: typeof downloadLists;
  importLists: typeof importLists;
  shareList: typeof shareList;
  connectCalendar: typeof connectCalendar;
  upgradeLimits: typeof upgradeLimits;
  exec: typeof exec;
};

declare global {
  interface Window {
    checklist?: ChecklistApi;
    __checklistReady?: boolean;
  }
}

export function registerBot(): void {
  if (typeof window === "undefined") return;
  const checklist = ((command: string) => exec(command)) as ChecklistApi;
  checklist.createList = createList;
  checklist.switchTab = switchTab;
  checklist.addTask = addTask;
  checklist.editTitle = editTitle;
  checklist.toggleCheckbox = toggleCheckbox;
  checklist.openNotes = openNotes;
  checklist.saveNotes = saveNotes;
  checklist.setDueDate = setDueDate;
  checklist.changeTheme = changeTheme;
  checklist.setDailyEnabled = setDailyEnabled;
  checklist.refreshDaily = refreshDaily;
  checklist.renameList = renameList;
  checklist.deleteList = deleteList;
  checklist.downloadLists = downloadLists;
  checklist.importLists = importLists;
  checklist.shareList = shareList;
  checklist.connectCalendar = connectCalendar;
  checklist.upgradeLimits = upgradeLimits;
  checklist.exec = exec;
  window.checklist = checklist;
  window.__checklistReady = true;
}

export function unregisterBot(): void {
  if (typeof window === "undefined") return;
  delete window.checklist;
  window.__checklistReady = false;
}
