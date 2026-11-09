import { Check, ListPlus, Pin, Undo2 } from "lucide-react";
import { resolveFollowup } from "@/app/(app)/aktionen/planning-actions";
import { formatActionDate } from "@/lib/action-format";
import type { LastTimeItem } from "@/lib/planning-data";
import { cn } from "@/lib/utils";

/** „Aus dem letzten Mal“: offene „Fürs nächste Mal“-Punkte früherer Durchführungen der Reihe */
export function LastTime({ actionId, items }: { actionId: string; items: LastTimeItem[] }) {
  if (items.length === 0) return null;
  const open = items.filter((i) => !i.resolution).length;
  return (
    <details className="group mb-4 rounded-2xl border border-primary/30 bg-primary-soft/50 p-4" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-bold [&::-webkit-details-marker]:hidden">
        <Pin className="size-4 text-primary" aria-hidden /> Aus dem letzten Mal
        <span className="text-sm font-semibold text-muted">
          {open > 0 ? `${open} offen` : "alles berücksichtigt"} · {items.length} gesamt
        </span>
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id} className={cn("rounded-xl bg-surface p-3", i.resolution && "opacity-70")}>
            <p className={cn("whitespace-pre-line text-sm", i.resolution === "beruecksichtigt" && "line-through")}>{i.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">
                aus „{i.sourceTitle}“{i.sourceDate ? ` · ${formatActionDate({ date: i.sourceDate }, "short")}` : ""}
              </span>
              <span className="ml-auto flex gap-1.5">
                {i.resolution ? (
                  <form action={resolveFollowup}>
                    <input type="hidden" name="actionId" value={actionId} />
                    <input type="hidden" name="feedbackId" value={i.id} />
                    <button
                      name="resolution"
                      value="zuruecksetzen"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-muted hover:bg-surface-2"
                    >
                      <Undo2 className="size-3.5" aria-hidden />
                      {i.resolution === "aufgabe" ? "als Aufgabe übernommen" : "berücksichtigt"} · rückgängig
                    </button>
                  </form>
                ) : (
                  <form action={resolveFollowup} className="flex gap-1.5">
                    <input type="hidden" name="actionId" value={actionId} />
                    <input type="hidden" name="feedbackId" value={i.id} />
                    <button
                      name="resolution"
                      value="aufgabe"
                      className="inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1 font-semibold text-primary-fg hover:bg-primary-hover"
                    >
                      <ListPlus className="size-3.5" aria-hidden /> Als Aufgabe
                    </button>
                    <button
                      name="resolution"
                      value="beruecksichtigt"
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 font-semibold hover:bg-surface-2"
                    >
                      <Check className="size-3.5" aria-hidden /> Berücksichtigt
                    </button>
                  </form>
                )}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
