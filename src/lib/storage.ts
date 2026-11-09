import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { del, get, head, put } from "@vercel/blob";

/**
 * Datei-Speicher:
 * - "blob": privater Vercel-Blob-Store (Produktion). Lesen nur über unsere Route mit Berechtigungsprüfung.
 * - "local": Verzeichnis JUNA_LOCAL_STORAGE_DIR (Entwicklung/Tests).
 * - "none": nichts eingerichtet – Upload deaktiviert.
 */
export type StorageMode = "blob" | "local" | "none";

export function storageMode(): StorageMode {
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID) return "blob";
  if (process.env.JUNA_LOCAL_STORAGE_DIR) return "local";
  return "none";
}

/** Client-Uploads (direkt in den Blob-Store, bis 50 MB) brauchen das Read-Write-Token */
export function clientUploadAvailable() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function localPath(key: string) {
  const root = resolve(process.env.JUNA_LOCAL_STORAGE_DIR!);
  const p = resolve(join(root, key));
  if (!p.startsWith(root + "/")) throw new Error("Ungültiger Speicherpfad");
  return p;
}

export async function putFile(key: string, body: Buffer, contentType: string) {
  const mode = storageMode();
  if (mode === "blob") {
    await put(key, body, { access: "private", contentType, addRandomSuffix: false, allowOverwrite: false });
  } else if (mode === "local") {
    const p = localPath(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, body, { flag: "wx" });
    await writeFile(`${p}.type`, contentType);
  } else {
    throw new Error("Kein Dateispeicher eingerichtet");
  }
}

export async function headFile(key: string): Promise<{ size: number; contentType: string } | null> {
  const mode = storageMode();
  try {
    if (mode === "blob") {
      const h = await head(key);
      return { size: h.size, contentType: h.contentType };
    }
    if (mode === "local") {
      const p = localPath(key);
      const s = await stat(p);
      return { size: s.size, contentType: (await readFile(`${p}.type`, "utf8").catch(() => "application/octet-stream")).trim() };
    }
  } catch {
    return null;
  }
  return null;
}

export async function readFileStream(key: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
  const mode = storageMode();
  if (mode === "blob") {
    const res = await get(key, { access: "private" });
    if (!res || res.statusCode !== 200) return null;
    return { stream: res.stream, size: res.blob.size };
  }
  if (mode === "local") {
    const p = localPath(key);
    const s = await stat(p).catch(() => null);
    if (!s) return null;
    return { stream: Readable.toWeb(createReadStream(p)) as ReadableStream<Uint8Array>, size: s.size };
  }
  return null;
}

export async function deleteFiles(keys: string[]) {
  if (keys.length === 0) return;
  const mode = storageMode();
  if (mode === "blob") {
    await del(keys);
  } else if (mode === "local") {
    for (const k of keys) {
      const p = localPath(k);
      await rm(p, { force: true });
      await rm(`${p}.type`, { force: true });
    }
  }
}
