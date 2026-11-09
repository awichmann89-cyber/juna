import Link from "next/link";
import { Suspense } from "react";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";
import { orgNav, platformNav } from "./nav-items";
import { BottomNav, SidebarNav } from "./nav-links";

async function navFor() {
  const user = await getCurrentUser();
  if (!user) return { user, items: [] };
  const items = user.org ? [...orgNav] : [];
  if (user.isSuperadmin) items.splice(Math.max(items.length - 1, 0), 0, platformNav);
  return { user, items };
}

async function Sidebar() {
  const { user, items } = await navFor();
  if (!user) return null;
  return (
    <>
      {user.org && (
        <div className="mb-4 rounded-xl bg-surface-2 px-3 py-2.5">
          <div className="text-xs font-semibold text-muted">Organisation</div>
          <div className="truncate font-bold">{user.org.name}</div>
        </div>
      )}
      <SidebarNav items={items} />
      <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
        <Avatar name={user.displayName} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{user.displayName}</div>
          <div className="truncate text-xs text-muted">{user.email}</div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg"
            title="Abmelden"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="sr-only">Abmelden</span>
          </button>
        </form>
      </div>
    </>
  );
}

async function MobileOrgName() {
  const user = await getCurrentUser();
  return <span className="truncate text-sm font-semibold text-muted">{user?.org?.name ?? (user?.isSuperadmin ? "Plattform" : "")}</span>;
}

async function MobileNav() {
  const { items } = await navFor();
  if (items.length === 0) return null;
  // Mobil max. 5 Einträge: Plattform-Link erscheint auf der „Mehr“-Seite
  return <BottomNav items={items.filter((i) => i.key !== "admin" || items.length <= 1)} />;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="mb-4 h-14" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-10" />
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-5 md:flex">
        <Link href="/uebersicht" className="mb-6 px-1" aria-label="juna – Übersicht">
          <Logo size={34} />
        </Link>
        <Suspense fallback={<SidebarSkeleton />}>
          <Sidebar />
        </Suspense>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="pt-safe sticky top-0 z-20 border-b border-border bg-bg/90 backdrop-blur md:hidden">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link href="/uebersicht" aria-label="juna – Übersicht">
              <Logo size={30} />
            </Link>
            <span className="ml-auto max-w-[55%]">
              <Suspense fallback={null}>
                <MobileOrgName />
              </Suspense>
            </span>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-12">{children}</main>
      </div>

      <Suspense fallback={null}>
        <MobileNav />
      </Suspense>
    </div>
  );
}
