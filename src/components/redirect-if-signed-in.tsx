import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/** Leitet gültig eingeloggte User in die App weiter (z. B. von Startseite/Login). */
export async function RedirectIfSignedIn() {
  const user = await getCurrentUser();
  if (user) redirect(user.org ? "/uebersicht" : "/admin");
  return null;
}
