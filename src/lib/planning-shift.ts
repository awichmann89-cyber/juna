import "server-only";
import { eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@/db";
import { daysBetween } from "@/lib/planning";

/** Beim Ändern des Aktionsdatums: Zeitplan und Anwesenheitsfenster um dieselbe Anzahl Tage mitverschieben */
export async function shiftPlanning(tx: Tx, actionId: string, oldDate: string, newDate: string) {
  const days = daysBetween(oldDate, newDate);
  if (days === 0) return;
  const interval = sql`make_interval(days => ${days})`;
  await tx
    .update(schema.actionSlots)
    .set({ startsAt: sql`${schema.actionSlots.startsAt} + ${interval}`, endsAt: sql`${schema.actionSlots.endsAt} + ${interval}` })
    .where(eq(schema.actionSlots.actionId, actionId));
  await tx
    .update(schema.actionParticipants)
    .set({
      presentFrom: sql`${schema.actionParticipants.presentFrom} + ${interval}`,
      presentUntil: sql`${schema.actionParticipants.presentUntil} + ${interval}`,
    })
    .where(eq(schema.actionParticipants.actionId, actionId));
}
