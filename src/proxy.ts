import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_PATHS = ["/", "/login", "/registrieren", "/passwort-vergessen", "/passwort-setzen", "/datenschutz", "/impressum"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

/**
 * Optimistischer Routenschutz: prüft nur, ob ein Session-Cookie existiert.
 * Die verbindliche Prüfung (Session gültig, Konto aktiv, Rolle) passiert im DAL (src/lib/auth.ts).
 */
export function proxy(request: NextRequest) {
  const hasSession = Boolean(getSessionCookie(request, { cookiePrefix: "juna" }));
  const { pathname } = request.nextUrl;

  if (!hasSession && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("weiter", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|icons/|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
  ],
};
