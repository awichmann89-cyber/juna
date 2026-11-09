"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function CopyButton({ value, label = "Link kopieren" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // Fallback für ältere Browser / fehlende Berechtigung
          const ta = document.createElement("textarea");
          ta.value = value;
          document.body.append(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? "Kopiert" : label}
    </button>
  );
}
