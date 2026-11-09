import { LinkButton } from "@/components/ui/button";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo size={48} withText={false} />
      <div>
        <h1 className="text-2xl font-extrabold">Seite nicht gefunden</h1>
        <p className="mt-2 text-muted">Diese Seite gibt es nicht – oder du hast keinen Zugriff darauf.</p>
      </div>
      <LinkButton href="/uebersicht">Zur Übersicht</LinkButton>
    </div>
  );
}
