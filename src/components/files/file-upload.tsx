"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import { LoaderCircle, Upload } from "lucide-react";
import { registerUploadedFile, uploadFileServer, type FileFormState } from "@/app/(app)/aktionen/file-actions";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { ACCEPT_ATTR, MAX_FILE_BYTES, safeFilename } from "@/lib/files";

type Mode = "client" | "server" | "none";

export function FileUpload({ mode, orgId, actionId, groups }: { mode: Mode; orgId: string; actionId: string; groups: string[] }) {
  const router = useRouter();
  const [serverState, serverAction] = useActionState<FileFormState, FormData>(uploadFileServer, {});
  const [clientState, setClientState] = useState<FileFormState & { busy?: string }>({});
  const inputRef = useRef<HTMLInputElement>(null);

  if (mode === "none") {
    return (
      <Alert tone="info">
        Der Dateispeicher ist noch nicht eingerichtet. Lege in Vercel einen <b>privaten Blob-Store</b> an und verbinde ihn mit dem
        Projekt (siehe README).
      </Alert>
    );
  }

  async function clientUpload(form: HTMLFormElement) {
    const files = Array.from(inputRef.current?.files ?? []);
    const groupLabel = String(new FormData(form).get("groupLabel") ?? "");
    if (files.length === 0) return setClientState({ error: "Bitte eine Datei auswählen." });
    const done: string[] = [];
    for (const file of files.slice(0, 10)) {
      if (file.size > MAX_FILE_BYTES) return setClientState({ error: `${file.name}: größer als 50 MB.` });
      setClientState({ busy: file.name });
      try {
        const key = `orgs/${orgId}/actions/${actionId}/${crypto.randomUUID()}-${safeFilename(file.name)}`;
        await upload(key, file, {
          access: "private",
          handleUploadUrl: "/api/dateien/upload",
          clientPayload: JSON.stringify({ actionId }),
          multipart: file.size > 8 * 1024 * 1024,
          contentType: file.type,
        });
        const res = await registerUploadedFile({ actionId, key, filename: file.name, groupLabel });
        if (res.error) return setClientState({ error: `${file.name}: ${res.error}` });
        done.push(file.name);
      } catch (e) {
        return setClientState({ error: `${file.name}: ${e instanceof Error ? e.message : "Upload fehlgeschlagen"}` });
      }
    }
    form.reset();
    setClientState({ ok: `Hochgeladen: ${done.join(", ")}` });
    router.refresh();
  }

  const state = mode === "server" ? serverState : clientState;
  const busy = mode === "client" ? clientState.busy : undefined;

  return (
    <form
      action={mode === "server" ? serverAction : undefined}
      onSubmit={
        mode === "client"
          ? (e) => {
              e.preventDefault();
              void clientUpload(e.currentTarget);
            }
          : undefined
      }
      className="flex flex-col gap-3"
    >
      {state.ok && <Alert tone="success">{state.ok}</Alert>}
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <input type="hidden" name="actionId" value={actionId} />
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-6 text-center text-sm text-muted hover:border-primary hover:text-fg">
        <Upload className="size-6" aria-hidden />
        <span>
          <b className="text-fg">Dateien auswählen</b> – PDF, Bilder, Office, bis 50 MB
          {mode === "server" && " (lokal: bis 5 MB)"}
        </span>
        <input ref={inputRef} name="file" type="file" multiple accept={ACCEPT_ATTR} className="text-xs" required />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Gruppe (optional)
          <Input name="groupLabel" list="file-groups" maxLength={60} placeholder="z. B. Plakat" className="h-10 w-56" />
          <datalist id="file-groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </label>
        <UploadButton busy={busy} />
      </div>
    </form>
  );
}

function UploadButton({ busy }: { busy?: string }) {
  return (
    <button
      type="submit"
      disabled={Boolean(busy)}
      className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-fg hover:bg-primary-hover disabled:opacity-60"
    >
      {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
      {busy ? `Lädt ${busy} …` : "Hochladen"}
    </button>
  );
}
