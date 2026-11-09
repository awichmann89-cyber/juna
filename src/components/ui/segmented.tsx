import Link from "next/link";
import { cn } from "@/lib/utils";

export function Segmented({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="inline-flex w-fit max-w-full overflow-x-auto scrollbar-none rounded-xl bg-surface-2 p-1" aria-label="Ansicht">
      {items.map((i) => (
        <Link
          key={i.key}
          href={i.href}
          aria-current={i.key === active ? "page" : undefined}
          className={cn(
            "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
            i.key === active ? "bg-surface text-fg shadow-xs" : "text-muted hover:text-fg",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
