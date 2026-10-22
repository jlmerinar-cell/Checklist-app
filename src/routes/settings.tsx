import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "@/components/checklist/settings-screen";
import { useChecklistRuntime } from "@/components/checklist/runtime";

function SettingsPage() {
  useChecklistRuntime();
  return <SettingsScreen />;
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});
