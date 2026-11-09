import type { Metadata } from "next";
import { ListChecks } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Meine Aufgaben" };

export default function TasksPage() {
  return (
    <ComingSoon
      title="Meine Aufgaben"
      description="Alles, was dir zugewiesen ist – sortiert nach Deadline."
      icon={<ListChecks className="size-6" />}
      emptyTitle="Noch keine Aufgaben"
    >
      Aufgaben mit Deadlines aus den Aktionen und persönlichen Erinnerungen folgen in Phase 3.
    </ComingSoon>
  );
}
