import { NextResponse } from "next/server";
import { getCurrentUser, type OrgUser } from "@/lib/auth";
import { getAction } from "@/lib/actions-data";
import { colorFor, liveblocks, liveblocksEnabled, parseRoomId } from "@/lib/liveblocks";
import { getMeeting } from "@/lib/meetings-data";

/**
 * Gibt einen Liveblocks-Zugang für genau einen Raum aus.
 * Zugriff nur, wenn der Raum zur eigenen Organisation gehört und die Aktion/das Treffen (per RLS) sichtbar ist.
 */
export async function POST(request: Request) {
  if (!liveblocksEnabled()) return new NextResponse("Liveblocks ist nicht eingerichtet.", { status: 404 });
  const user = await getCurrentUser();
  if (!user?.org || user.status !== "active") return new NextResponse("Nicht angemeldet.", { status: 401 });

  const body = (await request.json().catch(() => null)) as { room?: unknown } | null;
  const parsed = typeof body?.room === "string" ? parseRoomId(body.room) : null;
  if (!parsed || parsed.orgId !== user.org.id) return new NextResponse("Kein Zugriff.", { status: 403 });

  const orgUser = user as OrgUser;
  const exists =
    parsed.target.kind === "aktion"
      ? await getAction(orgUser, parsed.target.id)
      : await getMeeting(orgUser, parsed.target.id);
  if (!exists) return new NextResponse("Kein Zugriff.", { status: 403 });

  const session = liveblocks().prepareSession(user.id, {
    userInfo: { name: user.displayName, color: colorFor(user.id) },
  });
  session.allow(body!.room as string, session.FULL_ACCESS);
  const { status, body: token } = await session.authorize();
  return new NextResponse(token, { status, headers: { "Cache-Control": "no-store" } });
}
