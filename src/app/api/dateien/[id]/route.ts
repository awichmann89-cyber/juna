import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser, type OrgUser } from "@/lib/auth";
import { isInlineType } from "@/lib/files";
import { fileForDownload } from "@/lib/files-data";
import { readFileStream } from "@/lib/storage";

/** Geschützter Download: Berechtigung wird hier geprüft, nicht im Proxy. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/dateien/[id]">) {
  const user = await getCurrentUser();
  if (!user?.org) return new NextResponse("Nicht angemeldet", { status: 401 });
  const { id } = await ctx.params;
  const file = await fileForDownload(user as OrgUser, id);
  if (!file) return new NextResponse("Nicht gefunden", { status: 404 });
  const data = await readFileStream(file.storageKey);
  if (!data) return new NextResponse("Nicht gefunden", { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1" || !isInlineType(file.contentType);
  const ascii = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(data.stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(data.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    },
  });
}
