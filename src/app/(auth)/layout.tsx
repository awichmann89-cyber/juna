import Link from "next/link";
import { Logo } from "@/components/logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col items-center px-4 py-10">
      <Link href="/" className="mb-8" aria-label="juna Startseite">
        <Logo size={44} />
      </Link>
      <main className="w-full max-w-md">{children}</main>
      <footer className="mt-auto pt-10 text-xs text-muted">juna · Aktionsplanung für Leiterrunden</footer>
    </div>
  );
}
