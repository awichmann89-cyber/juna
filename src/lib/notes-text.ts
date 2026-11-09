/**
 * Hilfsfunktionen für BlockNote-Dokumente (Notizen einer Aktion).
 * - sanitizeBlocks: prüft die Struktur grob und entfernt unsichere Links
 * - blocksToText: Klartext für Suche, Vorschau und Kalender-Export (iOS zeigt nur Text)
 */

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const SAFE_HREF = /^(https?:|mailto:|tel:)/i;

export const MAX_NOTES_BYTES = 900_000;
const MAX_DEPTH = 12;

function sanitizeInline(content: Json): Json {
  if (!Array.isArray(content)) return content;
  return content.map((item) => {
    if (isObj(item) && item.type === "link") {
      const href = typeof item.href === "string" ? item.href.trim() : "";
      return { ...item, href: SAFE_HREF.test(href) ? href : "" };
    }
    return item;
  });
}

function sanitizeContent(content: Json): Json {
  if (Array.isArray(content)) return sanitizeInline(content);
  if (isObj(content) && content.type === "tableContent" && Array.isArray(content.rows)) {
    return {
      ...content,
      rows: content.rows.map((row) =>
        isObj(row) && Array.isArray(row.cells)
          ? {
              ...row,
              cells: row.cells.map((cell) =>
                isObj(cell) && Array.isArray(cell.content)
                  ? { ...cell, content: sanitizeInline(cell.content) }
                  : sanitizeInline(cell),
              ),
            }
          : row,
      ),
    };
  }
  return content;
}

/** Wirft bei ungültiger Struktur; gibt bereinigte Blöcke zurück. */
export function sanitizeBlocks(input: unknown, depth = 0): Obj[] {
  if (!Array.isArray(input)) throw new Error("Notizen: Blockliste erwartet");
  if (depth > MAX_DEPTH) throw new Error("Notizen: zu tief verschachtelt");
  return input.map((block) => {
    if (!isObj(block) || typeof block.type !== "string") throw new Error("Notizen: ungültiger Block");
    const clean: Obj = { ...block };
    if ("content" in block) clean.content = sanitizeContent(block.content ?? null);
    clean.children = Array.isArray(block.children) ? sanitizeBlocks(block.children, depth + 1) : [];
    return clean;
  });
}

function inlineText(content: Json): string {
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!isObj(item)) return "";
      if (item.type === "text") return typeof item.text === "string" ? item.text : "";
      if (item.type === "link") {
        const label = inlineText(item.content ?? []);
        const href = typeof item.href === "string" ? item.href : "";
        return href && href !== label ? `${label} (${href})` : label;
      }
      return typeof item.text === "string" ? item.text : "";
    })
    .join("");
}

function tableText(content: Obj, indent: string): string[] {
  if (!Array.isArray(content.rows)) return [];
  return content.rows.map((row) => {
    const cells = isObj(row) && Array.isArray(row.cells) ? row.cells : [];
    return indent + cells.map((c) => (isObj(c) ? inlineText(c.content ?? []) : inlineText(c))).join(" | ");
  });
}

/** BlockNote-Blöcke → gut lesbarer Klartext (für Kalender-Beschreibungen, Suche, Vorschauen). */
export function blocksToText(blocks: unknown, depth = 0): string {
  if (!Array.isArray(blocks)) return "";
  const lines: string[] = [];
  let number = 0;
  const indent = "  ".repeat(depth);
  for (const block of blocks) {
    if (!isObj(block)) continue;
    const type = block.type;
    const props = isObj(block.props) ? block.props : {};
    if (type !== "numberedListItem") number = 0;
    const content = block.content ?? [];
    const text = inlineText(content);
    switch (type) {
      case "heading":
        if (text) lines.push(indent + text.toUpperCase());
        break;
      case "bulletListItem":
        lines.push(`${indent}• ${text}`);
        break;
      case "numberedListItem":
        number += 1;
        lines.push(`${indent}${number}. ${text}`);
        break;
      case "checkListItem":
        lines.push(`${indent}${props.checked ? "☑" : "☐"} ${text}`);
        break;
      case "quote":
        lines.push(`${indent}„${text}“`);
        break;
      case "codeBlock":
        lines.push(...text.split("\n").map((l) => indent + l));
        break;
      case "table":
        if (isObj(content)) lines.push(...tableText(content, indent));
        break;
      default:
        lines.push(indent + text);
    }
    const children = blocksToText(block.children, depth + 1);
    if (children) lines.push(children);
  }
  const out = lines.join("\n");
  // Nur auf oberster Ebene: mehrfache Leerzeilen zusammenfassen, Rand säubern (Einrückungen bleiben)
  return depth === 0 ? out.replace(/\n{3,}/g, "\n\n").replace(/^\n+|\s+$/g, "") : out;
}
