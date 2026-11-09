import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CalendarClock, ChevronLeft, ListOrdered, MapPin, NotebookPen, Pencil, Play, Trash2, UserCheck } from "lucide-react";
import { deleteMeeting, setMeetingStatus } from "@/app/(app)/leiterrunde/actions";
import { NotesEditorLoader } from "@/components/actions/notes-editor-loader";
import { AgendaAddForm } from "@/components/meetings/agenda-add-form";
import { AgendaList } from "@/components/meetings/agenda-list";
import { Attendance } from "@/components/meetings/attendance";
import { AutoRefresh } from "@/components/meetings/auto-refresh";
import { MeetingForm } from "@/components/meetings/meeting-form";
import { PageSkeleton } from "@/components/page-skeleton";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { formatTime, parseIsoDate } from "@/lib/action-format";
import { requireOrgUser } from "@/lib/auth";
import { liveblocksEnabled, roomIdFor } from "@/lib/liveblocks";
import {
  agendaCandidates,
  canRecordOthers,
  getMeeting,
  meetingAgenda,
  meetingAttendance,
  meetingStatusLabels,
  meetingTypeLabels,
} from "@/lib/meetings-data";
import { orgMembers } from "@/lib/planning-data";

export const metadata: Metadata = { title: "Treffen" };

const dateFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const shortFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
const savedFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

async function MeetingDetail({ params }: { params: PageProps<"/leiterrunde/[id]">["params"] }) {
  const user = await requireOrgUser();
  const { id } = await params;
  const meeting = await getMeeting(user, id);
  if (!meeting) notFound();
  const live = liveblocksEnabled();
  const [agenda, attendance, members, candidates] = await Promise.all([
    meetingAgenda(user, meeting.id),
    meetingAttendance(user, meeting.id),
    orgMembers(user),
    agendaCandidates(user, meeting.date),
  ]);
  const onAgenda = new Set(agenda.map((a) => a.actionId).filter(Boolean));
  // Aktive Mitglieder plus alle, die bereits erfasst wurden
  const people = members.filter((m) => m.status === "active" || attendance.has(m.id));
  const doneCount = agenda.filter((a) => a.done).length;
  const firstOpen = agenda.findIndex((a) => !a.done);
  const closed = meeting.status === "abgeschlossen";

  return (
    <>
      {meeting.status === "laufend" && <AutoRefresh />}
      <Link href="/leiterrunde" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden /> Leiterrunde
      </Link>

      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 text-sm font-semibold text-muted">{meetingTypeLabels[meeting.type]}</div>
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-extrabold tracking-tight md:text-3xl">
            {meeting.title}
            <Badge tone={meeting.status === "laufend" ? "success" : "neutral"}>{meetingStatusLabels[meeting.status]}</Badge>
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden /> {dateFmt.format(parseIsoDate(meeting.date))}
              {meeting.startTime && `, ${formatTime(meeting.startTime)} Uhr`}
            </span>
            {meeting.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden /> {meeting.location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <NotebookPen className="size-4" aria-hidden /> Protokoll: {meeting.protocolOwnerName ?? "noch offen"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {meeting.status === "geplant" && (
            <form action={setMeetingStatus}>
              <input type="hidden" name="meetingId" value={meeting.id} />
              <button type="submit" name="status" value="laufend" className={buttonClass("primary", "sm")}>
                <Play className="size-4" aria-hidden /> Treffen starten
              </button>
            </form>
          )}
          {meeting.status === "laufend" && (
            <>
              <LinkButton href={`/leiterrunde/${meeting.id}/ablauf${firstOpen >= 0 ? `?punkt=${firstOpen + 1}` : ""}`} size="sm">
                <Play className="size-4" aria-hidden /> Ablauf fortsetzen
              </LinkButton>
              <form action={setMeetingStatus}>
                <input type="hidden" name="meetingId" value={meeting.id} />
                <button type="submit" name="status" value="abgeschlossen" className={buttonClass("secondary", "sm")}>
                  Abschließen
                </button>
              </form>
            </>
          )}
          {closed && (
            <form action={setMeetingStatus}>
              <input type="hidden" name="meetingId" value={meeting.id} />
              <button type="submit" name="status" value="laufend" className={buttonClass("secondary", "sm")}>
                Wieder öffnen
              </button>
            </form>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <ListOrdered className="size-5" aria-hidden /> Agenda
              </CardTitle>
              {agenda.length > 0 && (
                <span className="text-sm font-semibold text-muted">
                  {doneCount}/{agenda.length} erledigt
                </span>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {agenda.length === 0 ? (
                <EmptyState title="Noch keine Agendapunkte">Füge Aktionen oder freie Punkte hinzu.</EmptyState>
              ) : (
                <AgendaList meetingId={meeting.id} items={agenda} editable={!closed} />
              )}
              {!closed && (
                <details className="rounded-xl border border-border p-3" open={agenda.length === 0}>
                  <summary className="cursor-pointer text-sm font-semibold text-primary">Punkt hinzufügen</summary>
                  <div className="mt-3">
                    <AgendaAddForm
                      meetingId={meeting.id}
                      candidates={candidates
                        .filter((c) => !onAgenda.has(c.id))
                        .map((c) => ({ id: c.id, label: `${c.title} · ${c.date ? shortFmt.format(parseIsoDate(c.date)) : "Idee"}` }))}
                    />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <NotebookPen className="size-5" aria-hidden /> Protokoll
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NotesEditorLoader
                key={live ? meeting.id : `${meeting.id}:${meeting.notesVersion}`}
                meetingId={meeting.id}
                live={live}
                roomId={live ? roomIdFor(user.org.id, "treffen", meeting.id) : undefined}
                placeholder="Beschlüsse, Termine, Wer macht was … Tippe „/“ für Blöcke"
                initialBlocks={meeting.notes as unknown[] | null}
                initialVersion={meeting.notesVersion}
                lastSavedLabel={
                  meeting.notesUpdatedAt
                    ? `Zuletzt bearbeitet ${savedFmt.format(meeting.notesUpdatedAt)}${meeting.notesUpdatedByName ? ` von ${meeting.notesUpdatedByName}` : ""}`
                    : undefined
                }
              />
            </CardContent>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="size-5" aria-hidden /> Anwesenheit
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Attendance
                meetingId={meeting.id}
                members={people}
                attendance={attendance}
                currentUserId={user.id}
                canRecordOthers={canRecordOthers(user, meeting)}
              />
            </CardContent>
          </Card>

          <details className="group rounded-2xl border border-border bg-surface">
            <summary className="flex cursor-pointer items-center gap-2 p-4 font-bold">
              <Pencil className="size-4" aria-hidden /> Treffen bearbeiten
            </summary>
            <div className="border-t border-border p-4">
              <MeetingForm
                members={members.filter((m) => m.status === "active")}
                meeting={{
                  id: meeting.id,
                  type: meeting.type,
                  title: meeting.title,
                  date: meeting.date,
                  startTime: meeting.startTime,
                  location: meeting.location,
                  protocolOwner: meeting.protocolOwner,
                }}
              />
              {user.role === "admin" && (
                <form action={deleteMeeting} className="mt-4 border-t border-border pt-4">
                  <input type="hidden" name="meetingId" value={meeting.id} />
                  <ConfirmSubmit confirm="Treffen mit Agenda, Anwesenheit und Protokoll löschen?" className={buttonClass("danger", "sm")}>
                    <Trash2 className="size-4" aria-hidden /> Treffen löschen
                  </ConfirmSubmit>
                </form>
              )}
            </div>
          </details>
        </aside>
      </div>
    </>
  );
}

export default function MeetingDetailPage(props: PageProps<"/leiterrunde/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <MeetingDetail params={props.params} />
    </Suspense>
  );
}
