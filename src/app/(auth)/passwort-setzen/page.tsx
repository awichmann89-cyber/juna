import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/feedback";
import { FormSkeleton } from "@/components/ui/skeleton";
import { lookupPasswordToken } from "@/lib/password-token";
import { SetPasswordForm } from "./set-password-form";

export const metadata: Metadata = { title: "Passwort festlegen", robots: { index: false } };

async function Content({ searchParams }: { searchParams: PageProps<"/passwort-setzen">["searchParams"] }) {
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const target = token ? await lookupPasswordToken(token) : null;

  if (!target) {
    return (
      <>
        <CardHeader>
          <CardTitle className="text-xl">Link ungültig</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Alert tone="error">Dieser Link ist ungültig oder abgelaufen.</Alert>
          <Link href="/passwort-vergessen" className="text-sm font-semibold text-primary hover:underline">
            Neuen Link anfordern
          </Link>
        </CardContent>
      </>
    );
  }

  const invited = target.status === "invited";
  return (
    <>
      <CardHeader>
        <CardTitle className="text-xl">
          {invited ? `Willkommen bei juna, ${target.displayName.split(" ")[0]}!` : "Neues Passwort festlegen"}
        </CardTitle>
        <CardDescription>
          {invited
            ? `Lege dein Passwort fest${target.orgName ? ` – danach geht's direkt zu „${target.orgName}“` : ""}.`
            : "Wähle ein neues Passwort für dein Konto."}{" "}
          Konto: {target.email}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm token={token} email={target.email} />
      </CardContent>
    </>
  );
}

export default function SetPasswordPage(props: PageProps<"/passwort-setzen">) {
  return (
    <Card>
      <Suspense
        fallback={
          <CardContent className="pt-5">
            <FormSkeleton />
          </CardContent>
        }
      >
        <Content searchParams={props.searchParams} />
      </Suspense>
    </Card>
  );
}
