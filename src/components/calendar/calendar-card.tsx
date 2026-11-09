import { CalendarDays, RefreshCw, User, Users } from "lucide-react";
import { eq } from "drizzle-orm";
import { resetCalendarFeed } from "@/app/(app)/einstellungen/calendar-actions";
import { schema, withUser } from "@/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import type { OrgUser } from "@/lib/auth";
import { feedToken, feedUrls } from "@/lib/calendar/token";
import { env } from "@/lib/env";
import { CopyButton } from "./copy-button";

const fmt = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" });

function FeedRow({
  icon,
  title,
  text,
  https,
  webcal,
  testId,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  https: string;
  webcal: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border p-4" data-feed={testId}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">{icon}</span>
        <div className="min-w-0">
          <div className="font-bold">{title}</div>
          <div className="text-sm text-muted">{text}</div>
        </div>
      </div>
      <input
        readOnly
        value={https}
        aria-label={`Abo-Link ${title}`}
        className="w-full truncate rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-muted"
      />
      <div className="flex flex-wrap gap-2">
        <a href={webcal} className={buttonClass("primary", "sm")}>
          <CalendarDays className="size-4" aria-hidden /> Abonnieren
        </a>
        <CopyButton value={https} />
      </div>
    </div>
  );
}

export async function CalendarCard({ user }: { user: OrgUser }) {
  const [feed] = await withUser(user.id, (tx) =>
    tx
      .select({ id: schema.calendarFeeds.id, createdAt: schema.calendarFeeds.createdAt, lastAccessedAt: schema.calendarFeeds.lastAccessedAt })
      .from(schema.calendarFeeds)
      .where(eq(schema.calendarFeeds.userId, user.id)),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-5" aria-hidden /> Kalender abonnieren
        </CardTitle>
        <CardDescription>
          Aktionen und deine Einsätze im iPhone-, Google- oder Outlook-Kalender – aktualisiert sich automatisch.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!feed ? (
          <form action={resetCalendarFeed}>
            <button type="submit" className={buttonClass("primary")}>
              <CalendarDays className="size-4" aria-hidden /> Kalender-Links erzeugen
            </button>
          </form>
        ) : (
          (() => {
            const urls = feedUrls(env.siteUrl, feedToken(feed.id));
            return (
              <>
                <FeedRow
                  testId="personal"
                  icon={<User className="size-5" aria-hidden />}
                  title="Mein Kalender"
                  text="Deine Zeitslots (inkl. „vielleicht“), Einsätze ohne Zeitplan und Deadlines deiner Aufgaben."
                  https={urls.personal}
                  webcal={urls.personalWebcal}
                />
                <FeedRow
                  testId="org"
                  icon={<Users className="size-5" aria-hidden />}
                  title={user.org.name}
                  text="Alle Aktionen als Ganztagstermine mit Zeitplan, Team und Notizen sowie die Leiterrundentreffen."
                  https={urls.org}
                  webcal={urls.orgWebcal}
                />
                <details className="rounded-xl bg-surface-2 p-3 text-sm">
                  <summary className="cursor-pointer font-semibold">So geht&apos;s</summary>
                  <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-muted">
                    <li>
                      <b className="text-fg">iPhone/Mac:</b> „Abonnieren“ tippen und bestätigen. Unter Einstellungen → Kalender →
                      Accounts → Abonnierte Kalender lässt sich das Aktualisieren auf „Alle 15 Minuten“ stellen.
                    </li>
                    <li>
                      <b className="text-fg">Google Kalender:</b> Link kopieren, dann am Computer unter „Weitere Kalender“ → „Per URL“
                      einfügen. Google aktualisiert nur etwa alle 12–24 Stunden.
                    </li>
                    <li>
                      <b className="text-fg">Outlook:</b> „Kalender hinzufügen“ → „Aus dem Internet abonnieren“ → Link einfügen.
                    </li>
                  </ul>
                </details>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <span>
                    {feed.lastAccessedAt ? `Zuletzt abgerufen ${fmt.format(feed.lastAccessedAt)}` : "Noch nicht abgerufen"}
                  </span>
                  <form action={resetCalendarFeed}>
                    <ConfirmSubmit
                      confirm="Neue Links erzeugen? Bestehende Abos funktionieren danach nicht mehr und müssen neu eingerichtet werden."
                      className="inline-flex items-center gap-1 font-semibold text-muted hover:text-danger"
                    >
                      <RefreshCw className="size-3.5" aria-hidden /> Links zurücksetzen
                    </ConfirmSubmit>
                  </form>
                </div>
                <p className="text-xs text-muted">
                  Wer einen dieser Links kennt, kann die Termine lesen. Teile ihn nicht – falls doch, setze die Links zurück.
                </p>
              </>
            );
          })()
        )}
      </CardContent>
    </Card>
  );
}
