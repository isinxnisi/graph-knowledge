import type { CapsuleText } from "../domain/capsule-document";

export type CanvasTextFormat = Pick<CapsuleText, "width" | "fontSize" | "fontWeight" | "align">;
export const CAPSULE_TEXT_FONT = "system-ui, sans-serif";

export function capsuleTextFormat(style?: string, format: CanvasTextFormat = {}) {
  return {
    width: format.width ?? 260,
    fontSize: format.fontSize ?? (style === "heading" ? 24 : 16),
    fontWeight: format.fontWeight ?? (style === "heading" ? "bold" : "normal"),
    align: format.align ?? "left",
  } as const;
}

// Wrap once, using the same font as the renderer. Both the hit rectangle and the
// painted label use these exact lines, including explicit blank lines and CJK.
export function capsuleTextLayout(text: string, style?: string, format: CanvasTextFormat = {}, measure?: (text: string) => number) {
  const resolved = capsuleTextFormat(style, format), padding = 10;
  const available = resolved.width - padding * 2;
  const widthOf = measure ?? ((value: string) => [...value].reduce((sum, char) => sum + resolved.fontSize * (/[^\u0000-\u00ff]/u.test(char) ? 1 : 0.58), 0));
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    // Preserve hard newlines, prefer word breaks, and break long words/CJK runs
    // when necessary. No saved text is modified by the rendering projection.
    for (const word of paragraph.match(/\S+\s*|\s+/gu) ?? []) {
      if (line && widthOf(line + word.trimEnd()) > available) { lines.push(line.trimEnd()); line = ""; }
      for (const character of word) {
        if (line && widthOf(line + character) > available) { lines.push(line.trimEnd()); line = ""; }
        line += character;
      }
    }
    lines.push(line.trimEnd());
  }
  const labelWidth = Math.max(...lines.map(widthOf), 0);
  const textMarginX = resolved.align === "left" ? (labelWidth - resolved.width) / 2 + padding : resolved.align === "right" ? (resolved.width - labelWidth) / 2 - padding : 0;
  return { ...resolved, label: lines.join("\n"), lines, height: Math.max(1, lines.length) * resolved.fontSize * 1.35 + padding * 2, padding, labelWidth, textMarginX };
}
