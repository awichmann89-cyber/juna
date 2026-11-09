import Link from "next/link";
import type { ActionListItem } from "@/lib/actions-data";
import { formatTime, monthGrid, seriesColorClass } from "@/lib/action-format";
import { cn } from "@/lib/utils";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

function actionsOn(day: string, actions: ActionListItem[]) {
  return actions.filter((a) => a.date && a.date <= day && (a.endDate ?? a.date) >= day);
}

/** Monatsraster (ab md). Auf kleinen Bildschirmen zeigt die Seite stattdessen die Liste. */
export function MonthCalendar({ month, actions, today }: { month: string; actions: ActionListItem[]; today: string }) {
  const weeks = monthGrid(month);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-7 border-b border-border bg-surface-2 text-center text-xs font-bold text-muted">
        {weekdays.map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-7 border-b border-border last:border-b-0">
          {week.map((day) => {
            const inMonth = day.startsWith(month);
            const items = actionsOn(day, actions);
            return (
              <div
                key={day}
                className={cn(
                  "min-h-28 border-r border-border p-1.5 last:border-r-0",
                  !inMonth && "bg-surface-2/60 text-muted",
                )}
              >
                <div
                  className={cn(
                    "mb-1 grid size-6 place-items-center rounded-full text-xs font-bold",
                    day === today && "bg-primary text-primary-fg",
                  )}
                >
                  {Number(day.slice(8))}
                </div>
                <ul className="flex flex-col gap-1">
                  {items.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/aktionen/${a.id}`}
                        prefetch={false}
                        title={a.title}
                        className="flex items-center gap-1.5 rounded-md bg-surface-2 px-1.5 py-1 text-xs font-semibold hover:bg-primary-soft"
                      >
                        <span
                          aria-hidden
                          className={cn("size-2 shrink-0 rounded-full", a.seriesColor ? seriesColorClass[a.seriesColor] : "bg-primary")}
                        />
                        <span className="truncate">
                          {a.date === day && formatTime(a.startTime) ? `${formatTime(a.startTime)} ` : ""}
                          {a.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
