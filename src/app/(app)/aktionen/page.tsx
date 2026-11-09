import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Layers, Lightbulb, Plus } from "lucide-react";
import { ActionList, SeriesDot } from "@/components/actions/action-bits";
import { MonthCalendar } from "@/components/actions/month-calendar";
import { PageSkeleton } from "@/components/page-skeleton";
import { LinkButton, buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/feedback";
import { Segmented } from "@/components/ui/segmented";
import { formatMonthYear, monthGrid, shiftMonth, todayIso } from "@/lib/action-format";
import { listActions, listActionsInRange, seriesOptions, type ActionView } from "@/lib/actions-data";
import { requireOrgUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Aktionen" };

type View = ActionView | "kalender";
const views: { key: View; label: string }[] = [
  { key: "kommend", label: "Kommend" },
  { key: "kalender", label: "Kalender" },
  { key: "vergangen", label: "Vergangen" },
  { key: "ideen", label: "Ideen" },
];

function href(params: Record<string, string | undefined>) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const s = q.toString();
  return s ? `/aktionen?${s}` : "/aktionen";
}

async function Actions({ searchParams }: { searchParams: PageProps<"/aktionen">["searchParams"] }) {
  const user = await requireOrgUser();
  const sp = await searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const today = todayIso();
  const view = (views.some((v) => v.key === sp.ansicht) ? sp.ansicht : "kommend") as View;
  const series = await seriesOptions(user);
  const reihe = series.some((s) => s.id === sp.reihe) ? str(sp.reihe) : undefined;
  const month = /^\d{4}-\d{2}$/.test(str(sp.monat) ?? "") ? str(sp.monat)! : today.slice(0, 7);

  const base = { ansicht: view === "kommend" ? undefined : view, reihe, monat: view === "kalender" && month !== today.slice(0, 7) ? month : undefined };

  let content: React.ReactNode;
  if (view === "kalender") {
    const grid = monthGrid(month);
    const actions = (await listActionsInRange(user, grid[0]![0]!, grid.at(-1)![6]!)).filter((a) => !reihe || a.seriesId === reihe);
    const inMonth = actions.filter((a) => a.date && (a.endDate ?? a.date) >= `${month}-01` && a.date <= `${month}-31`);
    content = (
      <>
        <div className="mb-4 flex items-center gap-2">
          <Link href={href({ ...base, monat: shiftMonth(month, -1) })} className={buttonClass("secondary", "sm")} aria-label="Vorheriger Monat">
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="min-w-40 text-center text-lg font-bold">{formatMonthYear(month)}</h2>
          <Link href={href({ ...base, monat: shiftMonth(month, 1) })} className={buttonClass("secondary", "sm")} aria-label="Nächster Monat">
            <ChevronRight className="size-4" />
          </Link>
          {month !== today.slice(0, 7) && (
            <Link href={href({ ...base, monat: undefined })} className={buttonClass("ghost", "sm")}>
              Heute
            </Link>
          )}
        </div>
        <div className="hidden md:block">
          <MonthCalendar month={month} actions={actions} today={today} />
        </div>
        <div className="md:hidden">
          {inMonth.length ? (
            <ActionList actions={inMonth} today={today} groupByMonth={false} />
          ) : (
            <EmptyState icon={<CalendarDays className="size-6" />} title="Keine Aktionen in diesem Monat" />
          )}
        </div>
      </>
    );
  } else {
    const actions = await listActions(user, { view, today, seriesId: reihe });
    content = actions.length ? (
      <ActionList actions={actions} today={today} groupByMonth={view !== "ideen"} />
    ) : view === "ideen" ? (
      <EmptyState icon={<Lightbulb className="size-6" />} title="Keine Ideen gesammelt">
        Aktionen ohne Termin landen hier – praktisch für die Jahresplanung.
      </EmptyState>
    ) : (
      <EmptyState icon={<CalendarDays className="size-6" />} title={view === "kommend" ? "Keine anstehenden Aktionen" : "Noch keine vergangenen Aktionen"}>
        {view === "kommend" && (
          <LinkButton href="/aktionen/neu" size="sm" className="mt-3">
            <Plus className="size-4" /> Aktion anlegen
          </LinkButton>
        )}
      </EmptyState>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-col gap-3">
        <Segmented
          active={view}
          items={views.map((v) => ({ key: v.key, label: v.label, href: href({ ...base, ansicht: v.key === "kommend" ? undefined : v.key, monat: undefined }) }))}
        />
        {series.filter((s) => !s.archived || s.id === reihe).length > 0 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Nach Reihe filtern">
            <Link
              href={href({ ...base, reihe: undefined })}
              className={cn(
                "whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold",
                !reihe ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-fg",
              )}
            >
              Alle Reihen
            </Link>
            {series
              .filter((s) => !s.archived || s.id === reihe)
              .map((s) => (
                <Link
                  key={s.id}
                  href={href({ ...base, reihe: s.id === reihe ? undefined : s.id })}
                  className={cn(
                    "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-sm font-semibold",
                    s.id === reihe ? "border-primary bg-primary-soft text-primary" : "border-border text-muted hover:text-fg",
                  )}
                >
                  <SeriesDot color={s.color} />
                  {s.name}
                </Link>
              ))}
          </div>
        )}
      </div>
      {content}
    </>
  );
}

export default function ActionsPage(props: PageProps<"/aktionen">) {
  return (
    <>
      <PageHeader
        title="Aktionen"
        description="Alle Aktionen eurer Leiterrunde – mit Historie aus früheren Durchführungen."
        actions={
          <>
            <LinkButton href="/aktionen/reihen" variant="secondary">
              <Layers className="size-4" /> Reihen
            </LinkButton>
            <LinkButton href="/aktionen/neu">
              <Plus className="size-4" /> Neue Aktion
            </LinkButton>
          </>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Actions searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}
