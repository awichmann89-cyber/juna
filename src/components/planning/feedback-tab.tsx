import { Trash2 } from "lucide-react";
import { deleteFeedback } from "@/app/(app)/aktionen/planning-actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import type { ActionDetail } from "@/lib/actions-data";
import type { OrgUser } from "@/lib/auth";
import type { FeedbackItem } from "@/lib/planning-data";
import { FeedbackForm } from "./feedback-form";
import { feedbackKinds } from "./feedback-kinds";

export function FeedbackTab({ user, action, items }: { user: OrgUser; action: ActionDetail; items: FeedbackItem[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        {feedbackKinds.map((k) => {
          const list = items.filter((i) => i.kind === k.value);
          return (
            <Card key={k.value}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <span aria-hidden>{k.emoji}</span> {k.label}
                </CardTitle>
                <CardDescription>{k.description}</CardDescription>
              </CardHeader>
              <CardContent>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">Noch nichts.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {list.map((f) => (
                      <li key={f.id} className="rounded-xl bg-surface-2 p-2.5 text-sm">
                        <p className="whitespace-pre-line">{f.text}</p>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                          <span>{f.authorName ?? "?"}</span>
                          {(f.authorId === user.id || user.role === "admin") && (
                            <form action={deleteFeedback}>
                              <input type="hidden" name="feedbackId" value={f.id} />
                              <input type="hidden" name="actionId" value={action.id} />
                              <ConfirmSubmit confirm="Diesen Feedback-Punkt löschen?" className="text-muted hover:text-danger" aria-label="Löschen">
                                <Trash2 className="size-3.5" />
                              </ConfirmSubmit>
                            </form>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback geben</CardTitle>
          {!action.seriesId && (
            <CardDescription>
              Tipp: Ordne die Aktion einer Reihe zu, damit „Fürs nächste Mal“-Punkte bei der nächsten Durchführung auftauchen.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <FeedbackForm actionId={action.id} />
        </CardContent>
      </Card>
    </div>
  );
}
