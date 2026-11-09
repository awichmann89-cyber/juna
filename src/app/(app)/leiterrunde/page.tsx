import type { Metadata } from "next";
import { Users } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export const metadata: Metadata = { title: "Leiterrunde" };

export default function MeetingPage() {
  return (
    <ComingSoon
      title="Leiterrunde"
      description="Treffen vorbereiten, Aktionen durchklicken, Feedback und Teilnahmen erfassen."
      icon={<Users className="size-6" />}
      emptyTitle="Der Leiterrunden-Modus kommt bald"
    >
      Agenda, Anwesenheit und Schnellerfassung folgen in Phase 4.
    </ComingSoon>
  );
}
