export type RichRun = {
  text: string;
  bold: boolean;
  italic: boolean;
};

export type RichLine = {
  isBullet: boolean;
  runs: RichRun[];
};

const INLINE_TOKEN_RE = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
const BULLET_PREFIX_RE = /^(?:•|-|\*)\s+(.*)$/;

/** Parse inline **bold** and *italic* markers without evaluating HTML. */
export function parseInlineRuns(text: string): RichRun[] {
  if (!text) return [{ text: "", bold: false, italic: false }];
  const runs: RichRun[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, index), bold: false, italic: false });
    }
    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**") && token.length > 4) {
      runs.push({ text: token.slice(2, -2), bold: true, italic: false });
    } else if (token.startsWith("*") && token.endsWith("*") && token.length > 2) {
      runs.push({ text: token.slice(1, -1), bold: false, italic: true });
    } else {
      runs.push({ text: token, bold: false, italic: false });
    }
    lastIndex = index + token.length;
  }
  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), bold: false, italic: false });
  }
  return runs.length > 0 ? runs : [{ text: "", bold: false, italic: false }];
}

/** Parse multiline CV prose into structured bullet and inline-formatted lines. */
export function parseRichTextLines(raw: string): RichLine[] {
  if (!raw.trim()) return [];
  return raw.split(/\r?\n/).map(line => {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(BULLET_PREFIX_RE);
    if (bulletMatch) {
      return { isBullet: true, runs: parseInlineRuns(bulletMatch[1]) };
    }
    return { isBullet: false, runs: parseInlineRuns(line) };
  });
}

export type RichFormatAction = "bold" | "italic" | "bullet";

/** Apply **bold**, *italic*, or leading bullet formatting to a textarea selection cleanly. */
export function applyRichFormatToText(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  action: RichFormatAction,
): { nextValue: string; nextStart: number; nextEnd: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length));
  const end = Math.max(start, Math.min(selectionEnd, value.length));

  if (action === "bullet") {
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const rawLineEnd = value.indexOf("\n", end);
    const lineEnd = rawLineEnd === -1 ? value.length : rawLineEnd;
    const block = value.slice(lineStart, lineEnd);
    const lines = block.split("\n");
    const allBulleted = lines.every(line => !line.trim() || line.trimStart().startsWith("• "));
    const transformed = lines
      .map(line => {
        if (!line.trim()) return allBulleted ? line : "• ";
        if (allBulleted) return line.replace(/^(\s*)•\s+/, "$1");
        return line.startsWith("• ") ? line : `• ${line}`;
      })
      .join("\n");
    const nextValue = value.slice(0, lineStart) + transformed + value.slice(lineEnd);
    return {
      nextValue,
      nextStart: lineStart,
      nextEnd: lineStart + transformed.length,
    };
  }

  const marker = action === "bold" ? "**" : "*";
  const selected = value.slice(start, end);
  if (selected.startsWith(marker) && selected.endsWith(marker) && selected.length > marker.length * 2) {
    const unwrapped = selected.slice(marker.length, -marker.length);
    const nextValue = value.slice(0, start) + unwrapped + value.slice(end);
    return { nextValue, nextStart: start, nextEnd: start + unwrapped.length };
  }
  const hasOuterMarker =
    start >= marker.length &&
    value.slice(start - marker.length, start) === marker &&
    value.slice(end, end + marker.length) === marker &&
    (marker === "**" ||
      (value.slice(start - 2, start) !== "**" && value.slice(end, end + 2) !== "**"));
  if (selected && hasOuterMarker) {
    const nextValue = value.slice(0, start - marker.length) + selected + value.slice(end + marker.length);
    return { nextValue, nextStart: start - marker.length, nextEnd: end - marker.length };
  }

  const placeholder = selected || (action === "bold" ? "nội dung nổi bật" : "ghi chú");
  const wrapped = `${marker}${placeholder}${marker}`;
  const nextValue = value.slice(0, start) + wrapped + value.slice(end);
  return {
    nextValue,
    nextStart: start + marker.length,
    nextEnd: start + marker.length + placeholder.length,
  };
}
