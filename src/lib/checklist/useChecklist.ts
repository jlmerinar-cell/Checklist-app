import { useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, subscribe } from "./storage";

export function useChecklist() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
