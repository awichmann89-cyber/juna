import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApplicationForm } from "./application-form";

export const metadata: Metadata = { title: "Organisation beantragen" };

export default function RegisterPage() {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Organisation beantragen</CardTitle>
          <CardDescription>
            Neue Leiterrunden werden nach kurzer Prüfung freigeschaltet. Danach legst du als Admin eure Mitglieder an.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationForm />
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-sm text-muted">
        Schon dabei?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Anmelden
        </Link>
      </p>
    </>
  );
}
