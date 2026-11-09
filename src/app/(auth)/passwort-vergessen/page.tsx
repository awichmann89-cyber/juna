import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function ForgotPasswordPage() {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Passwort vergessen</CardTitle>
          <CardDescription>Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.</CardDescription>
        </CardHeader>
        <CardContent>
          <ResetForm />
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Zurück zur Anmeldung
        </Link>
      </p>
    </>
  );
}
