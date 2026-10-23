import { createFileRoute } from "@tanstack/react-router";
import { ListEditScreen } from "@/components/checklist/list-edit-screen";
import { useChecklistRuntime } from "@/components/checklist/runtime";

function ListEditPage() {
  const { id } = Route.useParams();
  useChecklistRuntime();
  return <ListEditScreen listId={id} />;
}

export const Route = createFileRoute("/list/$id/edit")({
  component: ListEditPage,
});
