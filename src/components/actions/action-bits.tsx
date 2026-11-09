import Link from "next/link";
import { Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/feedback";
import type { ActionListItem } from "@/lib/actions-data";
import {
  formatActionDate,
  formatActionTime,
  formatMonthYear,
  parseIsoDate,
  seriesColorClass,
  statusLabels,
  statusTone,
} from "@/lib/action-format";
import type { ActionStatus, SeriesColor } from "@/db/schema";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: ActionStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabels[status]}</Badge>;
}

export function SeriesDot({ color, className }: { color: SeriesColor | null; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-full", color ? seriesColorClass[color] : "bg-border", className)} />;
}

const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: "UTC" });
const monthShort = new Intl.DateTimeFormat("de-DE", { month: "short", timeZone: "UTC" });

function DateTile({ date }: { date: string | null }) {
  if (!date) {
    return (
      <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-center text-[11px] font-bold leading-tight text-muted">
        ohne
        <br />
        Termin
      </div>
    );
  }
  const d = parseIsoDate(date);
  return (
    <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-xl bg-primary-soft text-primary">
      <span className="text-[11px] font-bold uppercase leading-none">{weekday.format(d).replace(".", "")}</span>
      <span className="text-xl font-extrabold leading-tight">{d.getUTCDate()}</span>
      <span className="text-[11px] font-semibold leading-none">{monthShort.format(d).replace(".", "")}</span>
    </div>
  );
}

export function ActionRow({ action, today }: { action: ActionListItem; today?: string }) {
  const past = today && action.date && (action.endDate ?? action.date) < today;
  return (
    <Link
      href={`/aktionen/${action.id}`}
      prefetch={false}
      className={cn("flex items-center gap-4 rounded-2xl p-3 transition-colors hover:bg-surface-2", past && "opacity-80")}
    >
      <DateTile date={action.date} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-bold">{action.title}</span>
          <StatusBadge status={action.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          {action.seriesName && (
            <span className="inline-flex items-center gap-1.5">
              <SeriesDot color={action.seriesColor} />
              {action.seriesName}
            </span>
          )}
          {action.date && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden />
              {action.endDate && action.endDate !== action.date ? formatActionDate(action, "short") : formatActionTime(action)}
            </span>
          )}
          {action.location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{action.location}</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Liste, nach Monaten gruppiert */
export function ActionList({ actions, today, groupByMonth = true }: { actions: ActionListItem[]; today?: string; groupByMonth?: boolean }) {
  if (!groupByMonth) {
    return (
      <ul className="flex flex-col">
        {actions.map((a) => (
          <li key={a.id}>
            <ActionRow action={a} today={today} />
          </li>
        ))}
      </ul>
    );
  }
  const groups = new Map<string, ActionListItem[]>();
  for (const a of actions) {
    const key = a.date ? a.date.slice(0, 7) : "ohne";
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return (
    <div className="flex flex-col gap-6">
      {[...groups.entries()].map(([month, items]) => (
        <section key={month}>
          <h2 className="mb-1 px-3 text-sm font-bold uppercase tracking-wide text-muted">
            {month === "ohne" ? "Ohne Termin" : formatMonthYear(month)}
          </h2>
          <ul className="flex flex-col">
            {items.map((a) => (
              <li key={a.id}>
                <ActionRow action={a} today={today} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
