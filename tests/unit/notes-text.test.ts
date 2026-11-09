import { describe, expect, it } from "vitest";
import { blocksToText, sanitizeBlocks } from "@/lib/notes-text";

const t = (text: string) => [{ type: "text", text, styles: {} }];

describe("blocksToText", () => {
  it("wandelt typische Planungsnotizen in Klartext um", () => {
    const blocks = [
      { type: "heading", props: { level: 2 }, content: t("Ablauf"), children: [] },
      { type: "bulletListItem", props: {}, content: t("Aufbau ab 14 Uhr"), children: [
        { type: "bulletListItem", props: {}, content: t("Tische aus dem Keller"), children: [] },
      ] },
      { type: "numberedListItem", props: {}, content: t("Begrüßung"), children: [] },
      { type: "numberedListItem", props: {}, content: t("Spiele"), children: [] },
      { type: "checkListItem", props: { checked: true }, content: t("Plakat drucken"), children: [] },
      { type: "checkListItem", props: { checked: false }, content: t("Waffeleisen leihen"), children: [] },
      { type: "paragraph", props: {}, content: [
        { type: "text", text: "Infos: ", styles: {} },
        { type: "link", href: "https://kettlerhof.de", content: t("Kettlerhof") },
      ], children: [] },
      { type: "paragraph", props: {}, content: [], children: [] },
      { type: "table", props: {}, content: { type: "tableContent", rows: [
        { cells: [t("Wer"), t("Was")] },
        { cells: [{ type: "tableCell", content: t("Lena") }, { type: "tableCell", content: t("Kasse") }] },
      ] }, children: [] },
    ];
    expect(blocksToText(blocks)).toBe(
      [
        "ABLAUF",
        "• Aufbau ab 14 Uhr",
        "  • Tische aus dem Keller",
        "1. Begrüßung",
        "2. Spiele",
        "☑ Plakat drucken",
        "☐ Waffeleisen leihen",
        "Infos: Kettlerhof (https://kettlerhof.de)",
        "",
        "Wer | Was",
        "Lena | Kasse",
      ].join("\n"),
    );
  });

  it("liefert leeren Text für leere oder ungültige Eingaben", () => {
    expect(blocksToText(null)).toBe("");
    expect(blocksToText([{ type: "paragraph", content: [], children: [] }])).toBe("");
  });
});

describe("sanitizeBlocks", () => {
  it("entfernt javascript:-Links und normalisiert children", () => {
    const out = sanitizeBlocks([
      { type: "paragraph", content: [{ type: "link", href: "javascript:alert(1)", content: t("x") }] },
    ]);
    expect(out[0]!.children).toEqual([]);
    expect((out[0]!.content as { href: string }[])[0]!.href).toBe("");
  });

  it("lehnt Nicht-Arrays und Blöcke ohne Typ ab", () => {
    expect(() => sanitizeBlocks({})).toThrow();
    expect(() => sanitizeBlocks([{ content: [] }])).toThrow();
  });
});
