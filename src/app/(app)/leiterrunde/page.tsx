import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, ChevronRight, MapPin, Plus, Users } from "lucide-react";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/feedback";
import { formatTime, parseIsoDate, todayIso } from "@/lib/action-format";
import { requireOrgUser } from "@/lib/auth";
import { listMeetings, meetingStatusLabels, meetingTypeLabels, type MeetingListItem } from "@/lib/meetings-data";
import { orgMembers } from "@/lib/planning-data";

export const metadata: Metadata = { title: "Leiterrunde" };

const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const statusTone = { geplant: "neutral", laufend: "success", abgeschlossen: "neutral" } as const;

function MeetingRow({ m }: { m: MeetingListItem }) {
  return (
    <li>
      <Link href={`/leiterrunde/${m.id}`} className="flex items-center gap-3 px-3 py-3 hover:bg-surface-2 sm:px-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{m.title}</span>
            {m.status !== "geplant" && <Badge tone={statusTone[m.status]}>{meetingStatusLabels[m.status]}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {dateFmt.format(parseIsoDate(m.date))}
              {m.startTime && `, ${formatTime(m.startTime)} Uhr`}
            </span>
            {m.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {m.location}
              </span>
            )}
            <span>
              {meetingTypeLabels[m.type]} · {m.agendaCount} {m.agendaCount === 1 ? "Punkt" : "Punkte"}
              {m.status === "abgeschlossen" && ` · ${m.present} anwesend`}
            </span>
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );
}

function MeetingList({ title, items }: { title: string; items: MeetingListItem[] }) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="mb-2 px-1 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <Card>
        <ul className="divide-y divide-border">
          {items.map((m) => (
            <MeetingRow key={m.id} m={m} />
          ))}
        </ul>
      </Card>
    </section>
  );
}

async function Meetings() {
  const user = await requireOrgUser();
  const today = todayIso();
  const [meetings, members] = await Promise.all([listMeetings(user), orgMembers(user)]);
  const upcoming = meetings.filter((m) => m.status === "laufend" || (m.status === "geplant" && m.date >= today)).reverse();
  const past = meetings.filter((m) => !upcoming.includes(m));
  const activeMembers = members.filter((m) => m.status === "active");

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        {meetings.length === 0 ? (
          <EmptyState icon={<Users className="size-6" />} title="Noch keine Treffen">
            Leg euer nächstes Monatstreffen oder die Jahresplanung an. juna schlägt die Agenda automatisch vor: Feedback zu
            vergangenen Aktionen und alles, was als Nächstes ansteht.
          </EmptyState>
        ) : (
          <>
            <MeetingList title="Anstehend" items={upcoming} />
            <MeetingList title="Vergangen" items={past} />
          </>
        )}
      </div>
      <Card id="neu" className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="size-5" aria-hidden /> Neues Treffen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MeetingForm members={activeMembers} defaultDate={today} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function MeetingsPage() {
  return (
    <>
      <PageHeader title="Leiterrunde" description="Treffen vorbereiten, Aktionen durchgehen, Anwesenheit und Protokoll." />
      <Suspense fallback={<PageSkeleton />}>
        <Meetings />
      </Suspense>
    </>
  );
}
