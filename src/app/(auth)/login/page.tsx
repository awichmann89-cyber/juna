import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSkeleton } from "@/components/ui/skeleton";
import { LoginForm } from "./login-form";
import { RedirectIfSignedIn } from "@/components/redirect-if-signed-in";

export const metadata: Metadata = { title: "Anmelden" };

const notices: Record<string, string> = {
  link: "Der Link ist ungültig oder abgelaufen. Fordere über „Passwort vergessen?“ einen neuen an.",
};

async function LoginFormWithParams({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const weiter = typeof sp.weiter === "string" ? sp.weiter : undefined;
  const fehler = typeof sp.fehler === "string" ? notices[sp.fehler] : undefined;
  return <LoginForm weiter={weiter} notice={fehler} />;
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Willkommen zurück</CardTitle>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<FormSkeleton />}>
            <RedirectIfSignedIn />
            <LoginFormWithParams searchParams={props.searchParams} />
          </Suspense>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Eure Leiterrunde ist noch nicht dabei?{" "}
        <Link href="/registrieren" className="font-semibold text-primary hover:underline">
          Organisation beantragen
        </Link>
      </p>
    </>
  );
}
