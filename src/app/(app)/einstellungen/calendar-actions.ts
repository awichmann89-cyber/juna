"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { schema, withUser } from "@/db";
import { requireOrgUser } from "@/lib/auth";

/** Abo-Links erzeugen bzw. zurücksetzen: neue Feed-ID → alle bisherigen Links werden ungültig */
export async function resetCalendarFeed() {
  const user = await requireOrgUser();
  await withUser(user.id, async (tx) => {
    await tx.delete(schema.calendarFeeds).where(eq(schema.calendarFeeds.userId, user.id));
    await tx.insert(schema.calendarFeeds).values({ orgId: user.org.id, userId: user.id });
  });
  revalidatePath("/einstellungen");
}
