/**
 * Neon liefert Connection Strings mit `sslmode=require`. node-postgres behandelt das aktuell
 * bereits wie `verify-full`, warnt aber, weil sich die Semantik in pg v9 ändert. Wir setzen
 * `verify-full` explizit: gleiche Sicherheit, keine Warnung, zukunftssicher.
 */
export function normalizeConnectionString(url: string) {
  return url.replace(/([?&])sslmode=(prefer|require|verify-ca)(?=&|$)/, "$1sslmode=verify-full");
}
