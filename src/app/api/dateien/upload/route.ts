import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { and, eq } from "drizzle-orm";
import { schema, withUser } from "@/db";
import { getCurrentUser, type OrgUser } from "@/lib/auth";
import { ALLOWED_CONTENT_TYPES, MAX_FILE_BYTES } from "@/lib/files";
import { keyBelongsTo } from "@/lib/files-data";

/**
 * Erzeugt kurzlebige Tokens für Client-Uploads direkt in den privaten Blob-Store.
 * Registrierung in der DB erfolgt danach über die Server Action registerUploadedFile
 * (prüft Pfad, Typ und Größe erneut).
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user?.org) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const orgUser = user as OrgUser;

  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { actionId } = JSON.parse(clientPayload ?? "{}") as { actionId?: string };
        if (!actionId || !keyBelongsTo(pathname, orgUser.org.id, actionId)) throw new Error("Ungültiger Speicherpfad");
        const [action] = await withUser(orgUser.id, (tx) =>
          tx
            .select({ id: schema.actions.id })
            .from(schema.actions)
            .where(and(eq(schema.actions.id, actionId), eq(schema.actions.orgId, orgUser.org.id))),
        );
        if (!action) throw new Error("Aktion nicht gefunden");
        return {
          allowedContentTypes: [...ALLOWED_CONTENT_TYPES],
          maximumSizeInBytes: MAX_FILE_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
        };
      },
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload nicht möglich" }, { status: 400 });
  }
}
