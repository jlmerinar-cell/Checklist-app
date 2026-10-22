import { renderToStaticMarkup } from "react-dom/server";
import { ChecklistApp } from "./app.tsx";
import { ListEditScreen } from "./list-edit-screen.tsx";
import { SettingsScreen } from "./settings-screen.tsx";

const HYDRANT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

export function renderScreens(): { list: string; open: string; expanded: string; settings: string } {
  return {
    list: renderToStaticMarkup(<ChecklistApp />),
    open: renderToStaticMarkup(<ChecklistApp initialPanel />),
    expanded: renderToStaticMarkup(<ChecklistApp initialExpanded={[HYDRANT]} />),
    settings: renderToStaticMarkup(<SettingsScreen />),
  };
}

export function renderListEdit(listId: string): string {
  return renderToStaticMarkup(<ListEditScreen listId={listId} />);
}
