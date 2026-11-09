import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Aktionen" };

export default function ActionsPage() {
  return (
    <ComingSoon
      title="Aktionen"
      description="Alle Aktionen eurer Leiterrunde – mit Historie aus früheren Durchführungen."
      icon={<CalendarDays className="size-6" />}
      emptyTitle="Hier entsteht eure Aktionsplanung"
    >
      Aktionen, Aktionsreihen und der Notiz-Editor folgen in Phase 2.
    </ComingSoon>
  );
}
