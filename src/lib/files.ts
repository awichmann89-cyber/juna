/** Datei-Regeln – rein, auf Server und Client nutzbar */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Erlaubte Typen. Bewusst kein SVG/HTML (könnten Skripte enthalten). */
export const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  "application/vnd.oasis.opendocument.presentation",
  "application/zip",
] as const;

export const ACCEPT_ATTR = ALLOWED_CONTENT_TYPES.join(",");

/** Inline anzeigen (Bilder/PDF), alles andere als Download */
export function isInlineType(contentType: string) {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}

export function isImageType(contentType: string) {
  return ["image/jpeg", "image/png", "image/webp", "image/gif"].includes(contentType);
}

/** Dateiname für den Speicherpfad: ASCII, keine Pfadtrenner */
export function safeFilename(name: string) {
  const base = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return (cleaned || "datei").slice(-120);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}
