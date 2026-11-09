"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/**
 * Zeigt einen Einladungs-/Passwort-Link zum manuellen Weitergeben –
 * nur solange kein Mailversand (RESEND_API_KEY) konfiguriert ist.
 */
export function ManualLink({ url, label = "Link manuell weitergeben" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2 rounded-xl border border-dashed border-warning bg-warning-soft p-3 text-sm">
      <span className="font-semibold text-warning">Mailversand nicht eingerichtet – {label}:</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-2 py-1.5 text-xs">{url}</code>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface text-fg hover:bg-surface-2"
          aria-label="Link kopieren"
        >
          {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
        </button>
      </div>
    </div>
  );
}
