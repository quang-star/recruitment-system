import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

export type OverlayKind = "whiteout" | "text" | "image";

export type PdfOverlayItem = {
  id: string;
  pageIndex: number; // 0-based page index
  kind: OverlayKind;
  /** Coordinates in percentage (0..100) relative to rendered page dimensions so zoom stays exact. */
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  text: string;
  fontSizePt: number;
  bold: boolean;
  color: string;
  opaqueBg: boolean;
  imageDataUrl?: string;
};

function hexToRgb(hex: string) {
  const clean = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#0f172a";
  const r = parseInt(clean.slice(1, 3), 16) / 255;
  const g = parseInt(clean.slice(3, 5), 16) / 255;
  const b = parseInt(clean.slice(5, 7), 16) / 255;
  return rgb(r, g, b);
}

async function fetchLocalFontBytes(relativePath: string): Promise<ArrayBuffer> {
  const response = await fetch(`${import.meta.env.BASE_URL}${relativePath}`);
  if (!response.ok) {
    throw new Error(`Không tải được font nội bộ: ${relativePath}`);
  }
  return response.arrayBuffer();
}

function decodeBase64DataUrl(dataUrl: string): { mime: "png" | "jpeg"; bytes: Uint8Array } | null {
  const match = dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { mime: match[1] as "png" | "jpeg", bytes };
}

/** Bake whiteout patches, Vietnamese Noto Sans text overlays, and image stamps onto a PDF binary. */
export async function exportPdfWithOverlays(
  sourceBytes: Uint8Array,
  overlays: readonly PdfOverlayItem[],
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  pdfDoc.registerFontkit(fontkit);

  const hasText = overlays.some(item => item.kind === "text" && item.text.trim().length > 0);
  const [regularFont, boldFont] = hasText
    ? await Promise.all([
        fetchLocalFontBytes("fonts/noto-sans/NotoSans-Regular.ttf").then(buf => pdfDoc.embedFont(buf)),
        fetchLocalFontBytes("fonts/noto-sans/NotoSans-Bold.ttf").then(buf => pdfDoc.embedFont(buf)),
      ])
    : [null, null];

  const pages = pdfDoc.getPages();
  const imageCache = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();

  for (const item of overlays) {
    const page = pages[item.pageIndex];
    if (!page) continue;
    const { width: pageW, height: pageH } = page.getSize();
    const x = (item.xPct / 100) * pageW;
    const w = Math.max(4, (item.wPct / 100) * pageW);
    const h = Math.max(4, (item.hPct / 100) * pageH);
    const yBottom = pageH - ((item.yPct / 100) * pageH + h);

    if (item.kind === "whiteout") {
      page.drawRectangle({
        x,
        y: yBottom,
        width: w,
        height: h,
        color: rgb(1, 1, 1),
      });
      continue;
    }

    if (item.kind === "image" && item.imageDataUrl) {
      let embedded = imageCache.get(item.imageDataUrl);
      if (!embedded) {
        const parsed = decodeBase64DataUrl(item.imageDataUrl);
        if (!parsed) continue;
        embedded =
          parsed.mime === "png"
            ? await pdfDoc.embedPng(parsed.bytes)
            : await pdfDoc.embedJpg(parsed.bytes);
        imageCache.set(item.imageDataUrl, embedded);
      }
      page.drawImage(embedded, { x, y: yBottom, width: w, height: h });
      continue;
    }

    if (item.kind === "text") {
      if (item.opaqueBg) {
        page.drawRectangle({
          x,
          y: yBottom,
          width: w,
          height: h,
          color: rgb(1, 1, 1),
        });
      }
      const cleanText = item.text.normalize("NFC");
      if (!cleanText.trim() || !regularFont || !boldFont) continue;
      const font = item.bold ? boldFont : regularFont;
      const fontSize = Math.max(7, Math.min(36, item.fontSizePt));
      const lineHeight = fontSize * 1.28;
      const topY = pageH - (item.yPct / 100) * pageH - fontSize - 2;

      const lines = cleanText.split(/\r?\n/);
      lines.forEach((line, index) => {
        const lineY = topY - index * lineHeight;
        if (lineY < yBottom - 2) return;
        page.drawText(line, {
          x: x + 2,
          y: lineY,
          size: fontSize,
          font,
          color: hexToRgb(item.color),
          maxWidth: Math.max(20, w - 4),
        });
      });
    }
  }

  return pdfDoc.save();
}
