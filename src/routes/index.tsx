import { createFileRoute } from "@tanstack/react-router";
import { ChecklistScreen } from "@/components/checklist/ChecklistScreen";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <ChecklistScreen />;
}
