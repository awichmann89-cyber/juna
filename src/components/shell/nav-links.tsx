"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, LayoutDashboard, ListChecks, Settings, ShieldCheck, Users, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavItem, NavKey } from "./nav-items";

const icons: Record<NavKey, typeof CalendarDays> = {
  uebersicht: LayoutDashboard,
  aktionen: CalendarDays,
  aufgaben: ListChecks,
  leiterrunde: Users,
  einstellungen: Settings,
  admin: ShieldCheck,
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-1">
      {items.map((item) => {
        const Icon = icons[item.key];
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-colors",
              active ? "bg-primary-soft text-primary" : "text-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            <Icon className="size-5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {items.map((item) => {
          const Icon = item.key === "einstellungen" ? Menu : icons[item.key];
          const active = isActive(pathname, item.href);
          return (
            <li key={item.key} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-bold",
                  active ? "text-primary" : "text-muted",
                )}
              >
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active && "bg-primary-soft")}>
                  <Icon className="size-[22px]" aria-hidden />
                </span>
                {item.mobileLabel ?? item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
