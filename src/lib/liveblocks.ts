import "server-only";
import { Liveblocks } from "@liveblocks/node";

/** Echtzeit-Bearbeitung ist aktiv, sobald ein Liveblocks-Secret-Key hinterlegt ist. */
export function liveblocksEnabled() {
  return Boolean(process.env.LIVEBLOCKS_SECRET_KEY);
}

let client: Liveblocks | null = null;
export function liveblocks() {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) throw new Error("LIVEBLOCKS_SECRET_KEY fehlt.");
  client ??= new Liveblocks({ secret });
  return client;
}

/** Raum-IDs enthalten immer die Organisation – der Auth-Endpunkt prüft beides. */
export type RoomTarget = { kind: "aktion" | "treffen"; id: string };

export function parseRoomId(room: string): { orgId: string; target: RoomTarget } | null {
  const m = /^([0-9a-f-]{36}):(aktion|treffen):([0-9a-f-]{36})$/i.exec(room);
  if (!m) return null;
  return { orgId: m[1]!.toLowerCase(), target: { kind: m[2] as RoomTarget["kind"], id: m[3]!.toLowerCase() } };
}

const palette = ["#e8553f", "#2f9e6e", "#3b7dd8", "#9b59b6", "#d98e04", "#0f9aa8", "#c2417a", "#6b8e23"];
export function colorFor(userId: string) {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}

export function roomIdFor(orgId: string, kind: RoomTarget["kind"], id: string) {
  return `${orgId}:${kind}:${id}`;
}

/** Raum nach dem Löschen einer Aktion/eines Treffens entfernen (best effort) */
export async function deleteLiveRoom(orgId: string, kind: RoomTarget["kind"], id: string) {
  if (!liveblocksEnabled()) return;
  await liveblocks()
    .deleteRoom(roomIdFor(orgId, kind, id))
    .catch((e: { status?: number }) => {
      if (e?.status !== 404) console.error("[liveblocks] Raum nicht gelöscht", e);
    });
}
