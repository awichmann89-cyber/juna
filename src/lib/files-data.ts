import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { schema, withUser } from "@/db";
import type { OrgUser } from "@/lib/auth";

export type ActionFile = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  groupLabel: string | null;
  uploadedBy: string | null;
  uploadedByName: string | null;
  createdAt: Date;
};

export async function actionFiles(user: OrgUser, actionId: string): Promise<ActionFile[]> {
  return withUser(user.id, (tx) =>
    tx
      .select({
        id: schema.actionFiles.id,
        filename: schema.actionFiles.filename,
        contentType: schema.actionFiles.contentType,
        sizeBytes: schema.actionFiles.sizeBytes,
        groupLabel: schema.actionFiles.groupLabel,
        uploadedBy: schema.actionFiles.uploadedBy,
        uploadedByName: sql<string | null>`(select pn.display_name from public.profiles pn where pn.id = "action_files"."uploaded_by")`,
        createdAt: schema.actionFiles.createdAt,
      })
      .from(schema.actionFiles)
      .where(eq(schema.actionFiles.actionId, actionId))
      .orderBy(asc(sql`lower(coalesce(${schema.actionFiles.groupLabel}, ''))`), asc(schema.actionFiles.createdAt)),
  );
}

/** Für die Download-Route: nur Dateien der eigenen Organisation (RLS) */
export async function fileForDownload(user: OrgUser, fileId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return null;
  const [row] = await withUser(user.id, (tx) =>
    tx
      .select({
        storageKey: schema.actionFiles.storageKey,
        filename: schema.actionFiles.filename,
        contentType: schema.actionFiles.contentType,
      })
      .from(schema.actionFiles)
      .where(and(eq(schema.actionFiles.id, fileId), eq(schema.actionFiles.orgId, user.org.id))),
  );
  return row ?? null;
}

export function storageKeyFor(orgId: string, actionId: string, safeName: string) {
  return `orgs/${orgId}/actions/${actionId}/${crypto.randomUUID()}-${safeName}`;
}

export function keyBelongsTo(key: string, orgId: string, actionId: string) {
  const prefix = `orgs/${orgId}/actions/${actionId}/`;
  return key.startsWith(prefix) && !key.slice(prefix.length).includes("/") && !key.includes("..");
}
