"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Lädt die Server-Daten regelmäßig neu, damit alle in der Leiterrunde denselben Stand sehen.
 * Pausiert, solange ein Eingabefeld fokussiert ist oder der Tab im Hintergrund liegt.
 */
export function AutoRefresh({ intervalMs = 15000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (document.querySelector("dialog[open], details[open] form")) return;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
