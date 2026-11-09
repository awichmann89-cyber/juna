import { Suspense } from "react";
import { CalendarDays, ListChecks, MessageSquareHeart, Users } from "lucide-react";
import { Logo } from "@/components/logo";
import { LinkButton } from "@/components/ui/button";
import { RedirectIfSignedIn } from "@/components/redirect-if-signed-in";

const features = [
  { icon: CalendarDays, title: "Jahresplanung", text: "Alle Aktionen des Jahres auf einen Blick – mit Infos vom letzten Mal." },
  { icon: Users, title: "Leiterrunden-Modus", text: "Im Treffen Aktion für Aktion durchklicken, planen und Feedback sammeln." },
  { icon: ListChecks, title: "Aufgaben & Erinnerungen", text: "Jede*r sieht die eigenen Aufgaben mit Deadline – und wird rechtzeitig erinnert." },
  { icon: MessageSquareHeart, title: "Aus Erfahrung lernen", text: "Feedback bleibt erhalten und fließt in die nächste Planung ein." },
];

export default function Home() {
  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-8 sm:px-6">
      <Suspense fallback={null}>
        <RedirectIfSignedIn />
      </Suspense>
      <header className="flex items-center justify-between">
        <Logo size={40} />
        <LinkButton href="/login" variant="secondary" size="sm">
          Anmelden
        </LinkButton>
      </header>

      <main className="flex flex-1 flex-col justify-center py-16">
        <h1 className="max-w-2xl text-4xl font-extrabold tracking-tight sm:text-5xl">
          Aktionen planen. <span className="text-primary">Gemeinsam.</span>
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          juna begleitet eure Leiterrunde von der Jahresplanung über das Monatstreffen bis zum Feedback nach der Aktion.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <LinkButton href="/login" size="lg">
            Anmelden
          </LinkButton>
          <LinkButton href="/registrieren" variant="secondary" size="lg">
            Organisation beantragen
          </LinkButton>
        </div>

        <ul className="mt-16 grid gap-4 sm:grid-cols-2">
          {features.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-4 rounded-2xl border border-border bg-surface p-5">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-bold">{title}</h2>
                <p className="mt-1 text-sm text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </main>

      <footer className="text-xs text-muted">juna · juna.app</footer>
    </div>
  );
}
