import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

/**
 * Abo-Token = Feed-ID (32 Hex) + HMAC-SHA256(Feed-ID) gekürzt auf 128 Bit (32 Hex).
 * Der geheime Teil liegt nicht in der Datenbank; ein DB-Leak verrät keine gültigen Links.
 * Wird BETTER_AUTH_SECRET gewechselt, werden alle Abo-Links ungültig.
 */
function mac(feedId: string) {
  return createHmac("sha256", `juna-ics:${env.betterAuthSecret}`).update(feedId).digest("hex").slice(0, 32);
}

export function feedToken(feedId: string) {
  return `${feedId.replace(/-/g, "")}${mac(feedId)}`;
}

/** Gibt die Feed-ID zurück, wenn das Token gültig signiert ist, sonst null */
export function verifyFeedToken(token: string): string | null {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  const hex = token.slice(0, 32);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const expected = Buffer.from(mac(id), "hex");
  const given = Buffer.from(token.slice(32), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export function feedUrls(siteUrl: string, token: string) {
  const https = `${siteUrl}/cal/${token}`;
  return {
    personal: `${https}/personal.ics`,
    org: `${https}/org.ics`,
    personalWebcal: `${https}/personal.ics`.replace(/^https?:/, "webcal:"),
    orgWebcal: `${https}/org.ics`.replace(/^https?:/, "webcal:"),
  };
}
