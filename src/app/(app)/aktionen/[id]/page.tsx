import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ClipboardList,
  Clock,
  FolderOpen,
  History,
  ListChecks,
  MapPin,
  MessageSquareHeart,
  Pencil,
  Plus,
  Users,
} from "lucide-react";
import { SeriesDot, StatusBadge } from "@/components/actions/action-bits";
import { NotesEditorLoader } from "@/components/actions/notes-editor-loader";
import { PageSkeleton } from "@/components/page-skeleton";
import { LinkButton } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { formatActionDate, formatActionTime, todayIso } from "@/lib/action-format";
import { getAction, seriesHistory, type ActionDetail } from "@/lib/actions-data";
import { CopyPanelBox } from "@/components/planning/copy-panel";
import { FilesTab } from "@/components/files/files-tab";
import { actionFiles } from "@/lib/files-data";
import { clientUploadAvailable, storageMode } from "@/lib/storage";
import { liveblocksEnabled, roomIdFor } from "@/lib/liveblocks";
import { FeedbackTab } from "@/components/planning/feedback-tab";
import { LastTime } from "@/components/planning/last-time";
import { ScheduleTab } from "@/components/planning/schedule-tab";
import { TasksTab } from "@/components/planning/tasks-tab";
import { TeamTab } from "@/components/planning/team-tab";
import {
  actionFeedback,
  actionTasks,
  copySources,
  getPlanning,
  lastTimeItems,
  orgMembers,
  planningCounts,
} from "@/lib/planning-data";
import { requireOrgUser, type OrgUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Aktion" };

const tabs = [
  { key: "notizen", label: "Notizen", icon: ClipboardList },
  { key: "zeitplan", label: "Zeitplan", icon: CalendarClock },
  { key: "team", label: "Team", icon: Users },
  { key: "aufgaben", label: "Aufgaben", icon: ListChecks },
  { key: "feedback", label: "Feedback", icon: MessageSquareHeart },
  { key: "dateien", label: "Dateien", icon: FolderOpen },
  { key: "historie", label: "Historie", icon: History, mobileOnly: true },
] as const;
type TabKey = (typeof tabs)[number]["key"];

const savedFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

async function SeriesHistory({ user, action }: { user: OrgUser; action: ActionDetail }) {
  if (!action.seriesId) {
    return (
      <p className="text-sm text-muted">
        Diese Aktion gehört zu keiner Reihe.{" "}
        <Link href={`/aktionen/${action.id}/bearbeiten`} className="font-semibold text-primary hover:underline">
          Reihe zuordnen
        </Link>
        , um Notizen und Feedback früherer Durchführungen hier zu sehen.
      </p>
    );
  }
  const history = await seriesHistory(user, action.seriesId, action.id);
  if (history.length === 0) {
    return <p className="text-sm text-muted">Das ist die erste Durchführung dieser Reihe.</p>;
  }
  const today = todayIso();
  return (
    <ol className="flex flex-col gap-3">
      {history.map((h, i) => (
        <li key={h.id} className="rounded-xl border border-border bg-surface p-3">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/aktionen/${h.id}`} className="font-bold hover:underline">
              {h.title}
            </Link>
            <StatusBadge status={h.status} />
          </div>
          <div className="mt-0.5 text-xs font-semibold text-muted">
            {formatActionDate(h, "short")}
            {h.date && h.date >= today ? " · geplant" : ""}
          </div>
          {h.notesText ? (
            <details className="group mt-2" open={i === 0}>
              <summary className="cursor-pointer list-none text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Notizen anzeigen</span>
                <span className="hidden group-open:inline">Notizen ausblenden</span>
              </summary>
              <div className="mt-2 max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-surface-2 p-2.5 text-sm">
                {h.notesText}
              </div>
            </details>
          ) : (
            <p className="mt-2 text-sm text-muted">Keine Notizen.</p>
          )}
        </li>
      ))}
    </ol>
  );
}

async function ActionPage({
  params,
  searchParams,
}: {
  params: PageProps<"/aktionen/[id]">["params"];
  searchParams: PageProps<"/aktionen/[id]">["searchParams"];
}) {
  const user = await requireOrgUser();
  const { id } = await params;
  const sp = await searchParams;
  const action = await getAction(user, id);
  if (!action) notFound();
  const tab: TabKey = tabs.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "notizen";
  const activeTab = tabs.find((t) => t.key === tab)!;
  const today = todayIso();
  const counts = await planningCounts(user, action.id);
  const badge: Partial<Record<TabKey, number>> = {
    zeitplan: counts.slots,
    team: counts.dabei,
    aufgaben: counts.tasks_open,
    feedback: counts.feedback,
    dateien: counts.files,
  };

  let tabContent: React.ReactNode;
  if (tab === "notizen") {
    const [lastTime, sources] = await Promise.all([lastTimeItems(user, action), copySources(user, action)]);
    const live = liveblocksEnabled();
    const isEmpty = counts.slots === 0 && counts.tasks_open === 0 && !action.notesText;
    tabContent = (
      <>
        <LastTime actionId={action.id} items={lastTime} />
        <CopyPanelBox
          actionId={action.id}
          defaultOpen={isEmpty}
          targetHasNotes={Boolean(action.notesText)}
          sources={sources.map((src) => ({
            id: src.id,
            title: src.title,
            dateLabel: formatActionDate(src, "short"),
            slots: src.slots,
            tasks: src.tasks,
            planners: src.planners,
            hasNotes: src.hasNotes,
          }))}
        />
        <Card>
          <CardContent className="pt-4">
            <NotesEditorLoader
              key={live ? action.id : `${action.id}:${action.notesVersion}`}
              actionId={action.id}
              live={live}
              roomId={live ? roomIdFor(user.org.id, "aktion", action.id) : undefined}
              initialBlocks={action.notes}
              initialVersion={action.notesVersion}
              lastSavedLabel={
                action.notesUpdatedAt
                  ? `Zuletzt bearbeitet ${savedFmt.format(action.notesUpdatedAt)}${action.notesUpdatedByName ? ` von ${action.notesUpdatedByName}` : ""}`
                  : undefined
              }
            />
          </CardContent>
        </Card>
      </>
    );
  } else if (tab === "zeitplan" || tab === "team") {
    const [planning, members] = await Promise.all([getPlanning(user, action.id), orgMembers(user)]);
    tabContent =
      tab === "zeitplan" ? (
        <ScheduleTab action={action} planning={planning} members={members} />
      ) : (
        <TeamTab user={user} action={action} planning={planning} members={members} />
      );
  } else if (tab === "aufgaben") {
    const [tasks, members] = await Promise.all([actionTasks(user, action.id, action.date), orgMembers(user)]);
    tabContent = <TasksTab action={action} tasks={tasks} members={members} today={today} />;
  } else if (tab === "feedback") {
    tabContent = <FeedbackTab user={user} action={action} items={await actionFeedback(user, action.id)} />;
  } else if (tab === "dateien") {
    const mode = storageMode();
    tabContent = (
      <FilesTab
        user={user}
        actionId={action.id}
        files={await actionFiles(user, action.id)}
        mode={mode === "blob" ? (clientUploadAvailable() ? "client" : "server") : mode === "local" ? "server" : "none"}
      />
    );
  } else if (tab === "historie") {
    tabContent = <SeriesHistory user={user} action={action} />;
  } else {
    tabContent = <EmptyState icon={<activeTab.icon className="size-6" />} title={activeTab.label} />;
  }

  return (
    <>
      <Link
        href={action.seriesId ? `/aktionen?reihe=${action.seriesId}` : "/aktionen"}
        className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-fg"
      >
        <ChevronLeft className="size-4" aria-hidden /> Aktionen
      </Link>

      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {action.seriesName && (
            <Link
              href={`/aktionen?reihe=${action.seriesId}`}
              className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-fg"
            >
              <SeriesDot color={action.seriesColor} /> {action.seriesName}
            </Link>
          )}
          <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xl font-extrabold tracking-tight md:text-3xl">
            {action.title} <StatusBadge status={action.status} />
          </h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden /> {formatActionDate(action)}
            </span>
            {action.date && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-4" aria-hidden /> {formatActionTime(action)}
              </span>
            )}
            {action.location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden /> {action.location}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {action.seriesId && (
            <LinkButton href={`/aktionen/neu?reihe=${action.seriesId}`} variant="secondary" size="sm">
              <Plus className="size-4" /> Neue Durchführung
            </LinkButton>
          )}
          <LinkButton href={`/aktionen/${action.id}/bearbeiten`} variant="secondary" size="sm">
            <Pencil className="size-4" /> Bearbeiten
          </LinkButton>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <nav className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-border px-1" aria-label="Bereiche der Aktion">
            {tabs.map((t) => (
              <Link
                key={t.key}
                href={t.key === "notizen" ? `/aktionen/${action.id}` : `/aktionen/${action.id}?tab=${t.key}`}
                scroll={false}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold",
                  t.key === tab ? "border-primary text-primary" : "border-transparent text-muted hover:text-fg",
                  "mobileOnly" in t && "lg:hidden",
                )}
              >
                <t.icon className="size-4" aria-hidden /> {t.label}
                {badge[t.key] ? (
                  <span className="rounded-full bg-surface-2 px-1.5 text-xs font-bold text-muted">{badge[t.key]}</span>
                ) : null}
              </Link>
            ))}
          </nav>

          {tabContent}
        </div>

        <aside className="hidden lg:block">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted">
            <History className="size-4" aria-hidden /> Historie der Reihe
          </h2>
          <SeriesHistory user={user} action={action} />
        </aside>
      </div>
    </>
  );
}

export default function ActionDetailPage(props: PageProps<"/aktionen/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ActionPage params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}
