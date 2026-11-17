import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  BODY_SECTIONS,
  createCvDocument,
  createCvEntry,
  MAX_SECTION_ENTRIES,
  scalarLimits,
  validateCvDocument,
  type BodySection,
  type CvDocument,
  type CvEntry,
  type Section,
} from "./cvDocument";

let workerConfigured = false;

export function ensurePdfJsWorker(): void {
  if (workerConfigured) return;
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  workerConfigured = true;
}

const SECTION_HEADING_PATTERNS: { section: BodySection; re: RegExp }[] = [
  { section: "introduction", re: /^(?:mục tiêu nghề nghiệp|tóm tắt|giới thiệu|summary|career objective|objective|about me|profile)\b/i },
  { section: "skills", re: /^(?:kỹ năng|các kỹ năng|chuyên môn|technical skills|core skills|skills)\b/i },
  { section: "experiences", re: /^(?:kinh nghiệm làm việc|kinh nghiệm|quá trình làm việc|work experience|experience|employment)\b/i },
  { section: "education", re: /^(?:học vấn|trình độ học vấn|quá trình học tập|education|academic)\b/i },
  { section: "projects", re: /^(?:dự án|dự án tiêu biểu|dự án cá nhân|projects|key projects)\b/i },
  { section: "certificates", re: /^(?:chứng chỉ|bằng cấp|certificates|certifications)\b/i },
  { section: "languages", re: /^(?:ngoại ngữ|ngôn ngữ|languages)\b/i },
  { section: "awards", re: /^(?:giải thưởng|danh hiệu|thành tích|awards|honors|honours & awards)\b/i },
  { section: "activities", re: /^(?:hoạt động|hoạt động ngoại khóa|activities|extracurricular)\b/i },
  { section: "hobbies", re: /^(?:sở thích|hobbies|interests)\b/i },
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/;
const URL_RE = /(?:https?:\/\/|github\.com\/|linkedin\.com\/in\/|gitlab\.com\/)\S+/gi;
const MONTH_RANGE_RE = /(\d{2}\/\d{4}|\d{4}-\d{2})\s*[-–—]\s*(hiện tại|nay|present|current|\d{2}\/\d{4}|\d{4}-\d{2})/i;

function toYearMonth(token: string): string {
  const clean = token.trim();
  if (/^\d{4}-\d{2}$/.test(clean)) return clean;
  const slash = clean.match(/^(\d{2})\/(\d{4})$/);
  if (slash) return `${slash[2]}-${slash[1]}`;
  return "";
}

function detectHeading(line: string): BodySection | null {
  const clean = line.replace(/[:•\-|]+$/g, "").trim();
  if (!clean || clean.length > 52) return null;
  for (const candidate of SECTION_HEADING_PATTERNS) {
    if (candidate.re.test(clean)) return candidate.section;
  }
  return null;
}

function parseEntriesFromLines(lines: string[], section: Section): CvEntry[] {
  const entries: CvEntry[] = [];
  let current: CvEntry | null = null;

  const pushCurrent = () => {
    if (!current) return;
    if (current.title.trim() || current.subtitle.trim() || current.description.trim()) {
      entries.push({
        ...current,
        title: current.title.slice(0, 240),
        subtitle: current.subtitle.slice(0, 240),
        description: current.description.trim().slice(0, 8000),
      });
    }
    current = null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const isBullet = /^[•\-*+]/.test(line);
    const rangeMatch = !isBullet ? line.match(MONTH_RANGE_RE) : null;

    if (rangeMatch && (!current || current.description || current.subtitle)) {
      pushCurrent();
      current = createCvEntry();
      const start = toYearMonth(rangeMatch[1]);
      const endRaw = rangeMatch[2];
      const isNow = /^(hiện tại|nay|present|current)$/i.test(endRaw);
      current.startMonth = start;
      current.current = isNow;
      current.endMonth = isNow ? "" : toYearMonth(endRaw);
      const stripped = line.replace(rangeMatch[0], "").replace(/[|–—-]+$/g, "").trim();
      current.title = stripped || (section === "education" ? "Chuyên ngành / Bằng cấp" : "Vị trí");
      continue;
    }

    if (!current) {
      current = createCvEntry();
      current.title = line.replace(/^[•\-*+]\s*/, "");
      continue;
    }

    if (isBullet) {
      current.description = current.description ? `${current.description}\n${line}` : line;
    } else if (!current.subtitle && current.description === "" && line.length <= 120) {
      current.subtitle = line;
    } else {
      current.description = current.description ? `${current.description}\n${line}` : line;
    }

    if (entries.length >= MAX_SECTION_ENTRIES) break;
  }
  pushCurrent();
  return entries.slice(0, MAX_SECTION_ENTRIES);
}

/** Convert extracted visual PDF lines into a bounded CvDocument without losing user style choices. */
export function extractCvDocumentFromLines(lines: string[], baseDoc: CvDocument = createCvDocument()): CvDocument {
  const cleaned = lines.map(l => l.trim()).filter(Boolean);
  const fullText = cleaned.join("\n");

  const next = validateCvDocument({
    ...baseDoc,
    schemaVersion: "cv-authoring/2.0",
  });

  const emailMatch = fullText.match(EMAIL_RE);
  if (emailMatch) next.email = emailMatch[0].slice(0, scalarLimits.email);

  const phoneMatch = fullText.match(PHONE_RE);
  if (phoneMatch) next.phone = phoneMatch[0].replace(/\s+/g, " ").trim().slice(0, scalarLimits.phone);

  const links = Array.from(new Set(fullText.match(URL_RE) ?? [])).slice(0, 6);
  if (links.length > 0) next.links = links.join("\n").slice(0, scalarLimits.links);

  const buckets: Partial<Record<BodySection, string[]>> = {};
  const headerLines: string[] = [];
  let activeSection: BodySection | null = null;

  for (const line of cleaned) {
    const detected = detectHeading(line);
    if (detected) {
      activeSection = detected;
      if (!buckets[activeSection]) buckets[activeSection] = [];
      continue;
    }
    if (activeSection) {
      buckets[activeSection]!.push(line);
    } else if (headerLines.length < 10) {
      headerLines.push(line);
    }
  }

  for (const line of headerLines) {
    if (EMAIL_RE.test(line) || URL_RE.test(line)) continue;
    if (PHONE_RE.test(line) && line.length < 28) continue;
    if (!next.fullName && line.length >= 3 && line.length <= 80 && !/\d{4}/.test(line)) {
      next.fullName = line.slice(0, scalarLimits.fullName);
      continue;
    }
    if (!next.headline && line !== next.fullName && line.length >= 3 && line.length <= 120) {
      next.headline = line.slice(0, scalarLimits.headline);
      continue;
    }
  }

  if (buckets.introduction?.length) {
    next.introduction = buckets.introduction.join("\n").slice(0, scalarLimits.introduction);
  } else if (!next.introduction && cleaned.length > 0 && Object.keys(buckets).length === 0) {
    next.introduction = cleaned.slice(0, 12).join("\n").slice(0, scalarLimits.introduction);
  }

  if (buckets.skills?.length) {
    next.skills = buckets.skills.join("\n").slice(0, scalarLimits.skills);
  }

  for (const section of BODY_SECTIONS) {
    if (section === "introduction" || section === "skills") continue;
    const raw = buckets[section];
    if (raw?.length) {
      next[section] = parseEntriesFromLines(raw, section);
    }
  }

  if (!next.title.trim() && next.fullName.trim()) {
    next.title = `CV nhập từ PDF - ${next.fullName}`.slice(0, scalarLimits.title);
  }

  return validateCvDocument(next);
}

export type PdfExtractResult = {
  doc: CvDocument;
  pageCount: number;
  extractedLines: number;
  likelyScanned: boolean;
};

/** Extract text lines client-side from a local PDF using pdfjs-dist without network calls. */
export async function extractCvFromPdfBytes(
  bytes: Uint8Array,
  baseDoc: CvDocument = createCvDocument(),
): Promise<PdfExtractResult> {
  ensurePdfJsWorker();
  const loadingTask = pdfjsLib.getDocument({ data: bytes.slice() });
  const pdf = await loadingTask.promise;
  try {
    const pagesToRead = Math.min(pdf.numPages, 8);
    const allLines: string[] = [];

    for (let pageNum = 1; pageNum <= pagesToRead; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const rows = new Map<number, { x: number; str: string }[]>();

      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const transform = item.transform;
        const x = Number(transform?.[4] ?? 0);
        const yBucket = Math.round(Number(transform?.[5] ?? 0) / 3) * 3;
        const bucket = rows.get(yBucket) ?? [];
        bucket.push({ x, str: item.str });
        rows.set(yBucket, bucket);
      }

      const sortedY = Array.from(rows.keys()).sort((a, b) => b - a);
      for (const y of sortedY) {
        const line = rows
          .get(y)!
          .sort((a, b) => a.x - b.x)
          .map(part => part.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();
        if (line) allLines.push(line);
      }
    }

    const totalChars = allLines.join("").replace(/\s+/g, "").length;
    if (totalChars < 24) {
      return {
        doc: baseDoc,
        pageCount: pdf.numPages,
        extractedLines: allLines.length,
        likelyScanned: true,
      };
    }

    return {
      doc: extractCvDocumentFromLines(allLines, baseDoc),
      pageCount: pdf.numPages,
      extractedLines: allLines.length,
      likelyScanned: false,
    };
  } finally {
    await pdf.destroy();
  }
}
