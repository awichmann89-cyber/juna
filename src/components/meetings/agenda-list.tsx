import Link from "next/link";
import { ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import { agendaItemAction } from "@/app/(app)/leiterrunde/actions";
import { SeriesDot } from "@/components/actions/action-bits";
import { Badge } from "@/components/ui/feedback";
import { formatActionDate } from "@/lib/action-format";
import { agendaKindLabels, type AgendaItem } from "@/lib/meetings-data";
import { cn } from "@/lib/utils";

export function agendaItemLabel(item: AgendaItem) {
  return item.actionTitle ?? item.title ?? "Punkt";
}

export function agendaItemDate(item: AgendaItem) {
  if (!item.actionId) return null;
  return formatActionDate({ date: item.actionDate, endDate: item.actionEndDate }, "short");
}

const kindTone = { feedback: "warning", planung: "primary", sonstiges: "neutral" } as const;

function OpButton({ meetingId, itemId, op, label, children, disabled }: {
  meetingId: string;
  itemId: string;
  op: string;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <form action={agendaItemAction}>
      <input type="hidden" name="meetingId" value={meetingId} />
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        name="op"
        value={op}
        disabled={disabled}
        aria-label={label}
        title={label}
        className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-30"
      >
        {children}
      </button>
    </form>
  );
}

export function AgendaList({ meetingId, items, editable }: { meetingId: string; items: AgendaItem[]; editable: boolean }) {
  return (
    <ol className="flex flex-col divide-y divide-border">
      {items.map((item, i) => (
        <li key={item.id} className="flex items-center gap-2 py-2">
          <OpButton meetingId={meetingId} itemId={item.id} op={item.done ? "undone" : "done"} label={item.done ? "Als offen markieren" : "Als erledigt markieren"}>
            <span
              className={cn(
                "grid size-5 place-items-center rounded-md border-2",
                item.done ? "border-success bg-success text-white" : "border-border",
              )}
            >
              {item.done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
            </span>
          </OpButton>
          <Link href={`/leiterrunde/${meetingId}/ablauf?punkt=${i + 1}`} className="group min-w-0 flex-1">
            <span className={cn("flex items-center gap-1.5 font-semibold group-hover:underline", item.done && "text-muted line-through")}>
              {item.actionId && <SeriesDot color={item.seriesColor} />}
              <span className="truncate">{agendaItemLabel(item)}</span>
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <Badge tone={kindTone[item.kind]} className="px-1.5 py-0 text-[11px]">
                {agendaKindLabels[item.kind]}
              </Badge>
              {agendaItemDate(item)}
            </span>
          </Link>
          {editable && (
            <div className="flex shrink-0">
              <OpButton meetingId={meetingId} itemId={item.id} op="up" label="Nach oben" disabled={i === 0}>
                <ArrowUp className="size-4" aria-hidden />
              </OpButton>
              <OpButton meetingId={meetingId} itemId={item.id} op="down" label="Nach unten" disabled={i === items.length - 1}>
                <ArrowDown className="size-4" aria-hidden />
              </OpButton>
              <OpButton meetingId={meetingId} itemId={item.id} op="remove" label="Von der Agenda entfernen">
                <Trash2 className="size-4" aria-hidden />
              </OpButton>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
