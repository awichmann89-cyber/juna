import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  ListChecks,
  MapPin,
  MessageSquareHeart,
  NotebookPen,
  Users,
} from "lucide-react";
import { agendaItemAction } from "@/app/(app)/leiterrunde/actions";
import { SeriesDot, StatusBadge } from "@/components/actions/action-bits";
import { NotesEditorLoader } from "@/components/actions/notes-editor-loader";
import { agendaItemDate, agendaItemLabel } from "@/components/meetings/agenda-list";
import { AutoRefresh } from "@/components/meetings/auto-refresh";
import { PageSkeleton } from "@/components/page-skeleton";
import { FeedbackTab } from "@/components/planning/feedback-tab";
import { ScheduleTab } from "@/components/planning/schedule-tab";
import { TasksTab } from "@/components/planning/tasks-tab";
import { TeamTab } from "@/components/planning/team-tab";
import { buttonClass, LinkButton } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, EmptyState } from "@/components/ui/feedback";
import { formatActionDate, formatActionTime, todayIso } from "@/lib/action-format";
import { getAction } from "@/lib/actions-data";
import { requireOrgUser } from "@/lib/auth";
import { liveblocksEnabled, roomIdFor } from "@/lib/liveblocks";
import { agendaKindLabels, getMeeting, meetingAgenda } from "@/lib/meetings-data";
import { actionFeedback, actionTasks, getPlanning, orgMembers, planningCounts } from "@/lib/planning-data";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ablauf" };

const areas = [
  { key: "feedback", label: "Feedback", icon: MessageSquareHeart },
  { key: "team", label: "Team", icon: Users },
  { key: "aufgaben", label: "Aufgaben", icon: ListChecks },
  { key: "zeitplan", label: "Zeitplan", icon: CalendarClock },
  { key: "notizen", label: "Notizen", icon: ClipboardList },
] as const;
type AreaKey = (typeof areas)[number]["key"];

async function Walkthrough({
  params,
  searchParams,
}: {
  params: PageProps<"/leiterrunde/[id]/ablauf">["params"];
  searchParams: PageProps<"/leiterrunde/[id]/ablauf">["searchParams"];
}) {
  const user = await requireOrgUser();
  const { id } = await params;
  const sp = await searchParams;
  const meeting = await getMeeting(user, id);
  if (!meeting) notFound();
  const live = liveblocksEnabled();
  const agenda = await meetingAgenda(user, meeting.id);
  const base = `/leiterrunde/${meeting.id}`;

  if (agenda.length === 0) {
    return (
      <>
        <Link href={base} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
          <ChevronLeft className="size-4" aria-hidden /> {meeting.title}
        </Link>
        <EmptyState icon={<ClipboardList className="size-6" />} title="Die Agenda ist leer">
          Füge zuerst Punkte zur Agenda hinzu.
        </EmptyState>
      </>
    );
  }

  const requested = Number(sp.punkt);
  const index = Number.isInteger(requested) && requested >= 1 && requested <= agenda.length ? requested - 1 : Math.max(0, agenda.findIndex((a) => !a.done));
  const item = agenda[index]!;
  const href = (punkt: number, bereich?: string) => `${base}/ablauf?punkt=${punkt}${bereich ? `&bereich=${bereich}` : ""}`;
  const defaultArea: AreaKey = item.kind === "feedback" ? "feedback" : "team";
  const area: AreaKey = areas.some((a) => a.key === sp.bereich) ? (sp.bereich as AreaKey) : defaultArea;
  const isLast = index === agenda.length - 1;
  const nextHref = isLast ? base : href(index + 2);

  let content: React.ReactNode = null;
  let action = null;
  if (item.actionId) {
    action = await getAction(user, item.actionId);
  }
  if (action) {
    const today = todayIso();
    if (area === "team" || area === "zeitplan") {
      const [planning, members] = await Promise.all([getPlanning(user, action.id), orgMembers(user)]);
      content =
        area === "team" ? (
          <TeamTab user={user} action={action} planning={planning} members={members} />
        ) : (
          <ScheduleTab action={action} planning={planning} members={members} />
        );
    } else if (area === "aufgaben") {
      const [tasks, members] = await Promise.all([actionTasks(user, action.id, action.date), orgMembers(user)]);
      content = <TasksTab action={action} tasks={tasks} members={members} today={today} />;
    } else if (area === "feedback") {
      content = <FeedbackTab user={user} action={action} items={await actionFeedback(user, action.id)} />;
    } else {
      content = action.notesText ? (
        <div className="whitespace-pre-wrap rounded-xl bg-surface-2 p-3 text-sm">{action.notesText}</div>
      ) : (
        <p className="text-sm text-muted">Noch keine Notizen.</p>
      );
    }
  }
  const counts = action ? await planningCounts(user, action.id) : null;
  const badge: Partial<Record<AreaKey, number>> = counts
    ? { feedback: counts.feedback, team: counts.dabei, aufgaben: counts.tasks_open, zeitplan: counts.slots }
    : {};

  return (
    <>
      {meeting.status === "laufend" && <AutoRefresh />}
      <Link href={base} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden /> {meeting.title}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Agenda-Navigation: Desktop als Liste, mobil als horizontale Leiste */}
        <nav aria-label="Agenda" className="min-w-0">
          <div className="mb-2 flex items-center justify-between px-1 text-sm font-bold uppercase tracking-wide text-muted">
            <span>Agenda</span>
            <span>
              {index + 1}/{agenda.length}
            </span>
          </div>
          <ol className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:flex-col lg:overflow-visible">
            {agenda.map((a, i) => (
              <li key={a.id} className="shrink-0 lg:shrink">
                <Link
                  href={href(i + 1)}
                  aria-current={i === index ? "step" : undefined}
                  className={cn(
                    "flex max-w-56 items-center gap-2 rounded-xl border px-2.5 py-2 text-sm lg:max-w-none",
                    i === index ? "border-primary bg-primary-soft font-bold text-primary" : "border-transparent hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold",
                      a.done ? "bg-success text-white" : "bg-surface-2 text-muted",
                    )}
                  >
                    {a.done ? <Check className="size-3" strokeWidth={3} aria-hidden /> : i + 1}
                  </span>
                  <span className={cn("truncate", a.done && i !== index && "text-muted line-through")}>{agendaItemLabel(a)}</span>
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <header>
            <div className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-muted">
              <span>
                Punkt {index + 1} von {agenda.length}
              </span>
              <Badge tone={item.kind === "feedback" ? "warning" : item.kind === "planung" ? "primary" : "neutral"}>{agendaKindLabels[item.kind]}</Badge>
              {item.done && <Badge tone="success">Erledigt</Badge>}
            </div>
            <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-extrabold tracking-tight md:text-3xl">
              {item.actionId && <SeriesDot color={item.seriesColor} className="size-3" />}
              {agendaItemLabel(item)}
              {action && <StatusBadge status={action.status} />}
            </h1>
            {action && (
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4" aria-hidden /> {formatActionDate(action)}
                  {action.date && `, ${formatActionTime(action)}`}
                </span>
                {action.location && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden /> {action.location}
                  </span>
                )}
                <Link href={`/aktionen/${action.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                  Aktion öffnen <ExternalLink className="size-3.5" aria-hidden />
                </Link>
              </div>
            )}
            {!item.actionId && <p className="mt-1 text-muted">Freier Agendapunkt – Ergebnisse direkt ins Protokoll schreiben.</p>}
            {item.actionId && !action && <p className="mt-1 text-muted">{agendaItemDate(item)}</p>}
          </header>

          {action && (
            <div>
              <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Bereiche">
                {areas.map((a) => (
                  <Link
                    key={a.key}
                    href={href(index + 1, a.key)}
                    scroll={false}
                    aria-current={a.key === area ? "page" : undefined}
                    className={cn(
                      "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold",
                      a.key === area ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg",
                    )}
                  >
                    <a.icon className="size-4" aria-hidden /> {a.label}
                    {badge[a.key] ? <span className="rounded-full bg-surface-2 px-1.5 text-xs font-bold text-muted">{badge[a.key]}</span> : null}
                  </Link>
                ))}
              </nav>
              {content}
            </div>
          )}

          <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 flex items-center justify-between gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-sm backdrop-blur lg:bottom-4">
            {index > 0 ? (
              <LinkButton href={href(index)} variant="ghost" size="sm">
                <ChevronLeft className="size-4" aria-hidden /> <span className="sr-only sm:not-sr-only">Zurück</span>
              </LinkButton>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {!isLast && (
                <LinkButton href={nextHref} variant="secondary" size="sm">
                  <span className="sm:hidden">Später</span>
                  <span className="hidden sm:inline">Überspringen</span>
                </LinkButton>
              )}
              <form action={agendaItemAction}>
                <input type="hidden" name="meetingId" value={meeting.id} />
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="next" value={nextHref} />
                <button type="submit" name="op" value="done" className={buttonClass("primary", "sm")}>
                  <Check className="size-4" aria-hidden /> {isLast ? "Erledigt & zur Übersicht" : "Erledigt & weiter"}
                  {!isLast && <ChevronRight className="size-4" aria-hidden />}
                </button>
              </form>
            </div>
          </div>

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
                placeholder="Beschlüsse, Termine, Wer macht was …"
                initialBlocks={meeting.notes as unknown[] | null}
                initialVersion={meeting.notesVersion}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function WalkthroughPage(props: PageProps<"/leiterrunde/[id]/ablauf">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Walkthrough params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
