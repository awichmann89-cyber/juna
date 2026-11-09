import { Download, FileText, FolderOpen, ImageIcon, Trash2 } from "lucide-react";
import { deleteFile } from "@/app/(app)/aktionen/file-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { EmptyState } from "@/components/ui/feedback";
import type { OrgUser } from "@/lib/auth";
import { formatBytes, isImageType } from "@/lib/files";
import type { ActionFile } from "@/lib/files-data";
import { FileUpload } from "./file-upload";

const dateFmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

export function FilesTab({
  user,
  actionId,
  files,
  mode,
}: {
  user: OrgUser;
  actionId: string;
  files: ActionFile[];
  mode: "client" | "server" | "none";
}) {
  const groups = new Map<string, ActionFile[]>();
  for (const f of files) groups.set(f.groupLabel ?? "", [...(groups.get(f.groupLabel ?? "") ?? []), f]);
  const groupNames = [...groups.keys()].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      {files.length === 0 ? (
        <EmptyState icon={<FolderOpen className="size-6" />} title="Noch keine Dateien">
          Plakate, Flyer, Einkaufslisten, Einverständniserklärungen … Varianten derselben Datei (z. B. Plakat als PDF und als
          Instagram-Bild) lassen sich über eine gemeinsame Gruppe bündeln.
        </EmptyState>
      ) : (
        [...groups.entries()].map(([group, items]) => (
          <section key={group || "_"}>
            {group && <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{group}</h3>}
            <ul className="grid gap-3 sm:grid-cols-2">
              {items.map((f) => (
                <li key={f.id}>
                  <Card className="flex h-full flex-col overflow-hidden">
                    <a href={`/api/dateien/${f.id}`} target="_blank" rel="noopener" className="block bg-surface-2">
                      {isImageType(f.contentType) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/dateien/${f.id}`} alt={f.filename} loading="lazy" className="h-40 w-full object-cover" />
                      ) : (
                        <div className="grid h-40 place-items-center text-muted">
                          {f.contentType.startsWith("image/") ? <ImageIcon className="size-10" /> : <FileText className="size-10" />}
                        </div>
                      )}
                    </a>
                    <CardContent className="flex flex-1 flex-col gap-1 pt-3">
                      <a href={`/api/dateien/${f.id}`} target="_blank" rel="noopener" className="truncate font-semibold hover:underline" title={f.filename}>
                        {f.filename}
                      </a>
                      <div className="text-xs text-muted">
                        {formatBytes(f.sizeBytes)} · {f.uploadedByName ?? "?"} · {dateFmt.format(f.createdAt)}
                      </div>
                      <div className="mt-auto flex items-center gap-3 pt-2 text-sm">
                        <a href={`/api/dateien/${f.id}?download=1`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                          <Download className="size-4" aria-hidden /> Herunterladen
                        </a>
                        {(f.uploadedBy === user.id || user.role === "admin") && (
                          <form action={deleteFile} className="ml-auto">
                            <input type="hidden" name="fileId" value={f.id} />
                            <input type="hidden" name="actionId" value={actionId} />
                            <ConfirmSubmit confirm={`„${f.filename}“ löschen?`} className="inline-flex items-center gap-1 text-muted hover:text-danger" aria-label={`${f.filename} löschen`}>
                              <Trash2 className="size-4" />
                            </ConfirmSubmit>
                          </form>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dateien hochladen</CardTitle>
        </CardHeader>
        <CardContent>
          <FileUpload mode={mode} orgId={user.org.id} actionId={actionId} groups={groupNames} />
        </CardContent>
      </Card>
    </div>
  );
}
