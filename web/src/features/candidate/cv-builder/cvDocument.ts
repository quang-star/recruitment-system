export const SCHEMA = "cv-authoring/1.0" as const;
export const TEMPLATE = "classic" as const;
export const MAX_DRAFT_BYTES = 256 * 1024;
export const MAX_SECTION_ENTRIES = 20;

export const scalarLimits = {
  title: 160,
  fullName: 200,
  headline: 240,
  email: 320,
  phone: 80,
  location: 240,
  links: 2000,
  introduction: 6000,
  skills: 4000,
} as const;

export const entryLimits = {
  id: 64,
  title: 240,
  subtitle: 240,
  startMonth: 7,
  endMonth: 7,
  description: 8000,
} as const;

export const SECTIONS = [
  "experiences", "education", "projects", "certificates", "languages",
] as const;
export type Section = typeof SECTIONS[number];
type Scalar = keyof typeof scalarLimits;

export interface CvEntry {
  id: string;
  title: string;
  subtitle: string;
  startMonth: string;
  endMonth: string;
  current: boolean;
  description: string;
}

export type CvDocument = {
  schemaVersion: typeof SCHEMA;
  templateId: typeof TEMPLATE;
} & Record<Scalar, string> & Record<Section, CvEntry[]>;

const scalarKeys = Object.keys(scalarLimits) as Scalar[];
const entryKeys = Object.keys(entryLimits) as (keyof typeof entryLimits)[];
const documentKeys = ["schemaVersion", "templateId", ...scalarKeys, ...SECTIONS];
const allowedEntryKeys = [...entryKeys, "current"];
const encoder = new TextEncoder();

function fail(message: string): never {
  throw new Error(message);
}

function exactObject(
  value: unknown, keys: readonly string[], path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`${path}: expected an object`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    fail(`${path}: expected a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length ||
      actual.some(k => typeof k !== "string" || !keys.includes(k)))
    fail(`${path}: missing or unknown fields`);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const d = descriptors[key];
    if (!d || !("value" in d)) fail(`${path}.${key}: expected a data field`);
    result[key] = d.value;
  }
  return result;
}

function text(value: unknown, limit: number, path: string): string {
  if (typeof value !== "string") fail(`${path}: expected a string`);
  if (value.length > limit) fail(`${path}: exceeds ${limit} UTF-16 units`);
  return value;
}

function validMonth(value: string): boolean {
  return value === "" || /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

function checkSerializedSize(doc: CvDocument): void {
  if (encoder.encode(JSON.stringify(doc)).byteLength > MAX_DRAFT_BYTES)
    fail(`Draft exceeds ${MAX_DRAFT_BYTES} UTF-8 bytes`);
}

export function createCvEntry(): CvEntry {
  return {
    id: `entry-${Array.from(crypto.getRandomValues(new Uint32Array(3)), n => n.toString(16)).join("-")}`,
    title: "", subtitle: "", startMonth: "", endMonth: "",
    current: false, description: "",
  };
}

export function createCvDocument(): CvDocument {
  return {
    schemaVersion: SCHEMA, templateId: TEMPLATE,
    title: "", fullName: "", headline: "", email: "", phone: "",
    location: "", links: "", introduction: "", skills: "",
    experiences: [], education: [], projects: [], certificates: [], languages: [],
  };
}

// Structural validation permits incomplete drafts and returns a detached copy.
// Supported input is JSON data or ordinary data objects, not hostile JS proxies.
export function validateCvDocument(value: unknown): CvDocument {
  const source = exactObject(value, documentKeys, "document");
  if (source.schemaVersion !== SCHEMA) fail("Unsupported schemaVersion");
  if (source.templateId !== TEMPLATE) fail("Unsupported templateId");
  const doc = createCvDocument();
  for (const key of scalarKeys)
    doc[key] = text(source[key], scalarLimits[key], key);

  const ids = new Set<string>();
  for (const section of SECTIONS) {
    const items = source[section];
    if (!Array.isArray(items)) fail(`${section}: expected an array`);
    if (items.length > MAX_SECTION_ENTRIES)
      fail(`${section}: maximum ${MAX_SECTION_ENTRIES} entries`);
    const entries: CvEntry[] = [];
    for (let i = 0; i < items.length; i++) {
      const path = `${section}[${i}]`;
      const raw = exactObject(items[i], allowedEntryKeys, path);
      const strings = {} as Record<keyof typeof entryLimits, string>;
      for (const key of entryKeys)
        strings[key] = text(raw[key], entryLimits[key], `${path}.${key}`);
      if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(strings.id))
        fail(`${path}.id: invalid technical item ID`);
      if (ids.has(strings.id)) fail(`${path}.id: duplicate item ID`);
      ids.add(strings.id);
      if (typeof raw.current !== "boolean")
        fail(`${path}.current: expected a boolean`);
      if (!validMonth(strings.startMonth) || !validMonth(strings.endMonth))
        fail(`${path}: dates must be empty or YYYY-MM (years 0001–9999)`);
      if (raw.current && strings.endMonth)
        fail(`${path}: current entries cannot have an end month`);
      if (strings.startMonth && strings.endMonth &&
          strings.startMonth > strings.endMonth)
        fail(`${path}: start month is after end month`);
      entries.push({ ...strings, current: raw.current });
    }
    doc[section] = entries;
  }
  checkSerializedSize(doc);
  return doc;
}

function hasEntryContent(entry: CvEntry): boolean {
  return [entry.title, entry.subtitle, entry.description]
    .some(value => value.trim().length > 0);
}

// Gate printable preview/PDF export, NOT draft saving.
// Returns the first structural failure, or all readiness failures.
export function cvDocumentErrors(value: unknown): string[] {
  let doc: CvDocument;
  try {
    doc = validateCvDocument(value);
  } catch {
    return ["Kiểm tra độ dài nội dung và mốc thời gian: tháng hợp lệ, bắt đầu không sau kết thúc, mục đang tiếp tục không có ngày kết thúc."];
  }
  const errors: string[] = [];
  if (!doc.fullName.trim()) errors.push("Vui lòng nhập họ tên.");
  const professional = [doc.headline, doc.introduction, doc.skills]
    .some(value => value.trim().length > 0) ||
    SECTIONS.some(section => doc[section].some(hasEntryContent));
  if (!professional) errors.push("Bổ sung kỹ năng, giới thiệu hoặc ít nhất một mục nội dung.");
  if (doc.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(doc.email.trim()))
    errors.push("Email liên hệ chưa đúng định dạng.");
  return errors;
}

// Pass only text from a user-selected draft file.
// Check File.size before reading as well; this check protects this API boundary.
export function importCvDraft(json: string): CvDocument {
  if (typeof json !== "string") fail("Draft must be JSON text");
  if (json.length > MAX_DRAFT_BYTES ||
      encoder.encode(json).byteLength > MAX_DRAFT_BYTES)
    fail(`Draft exceeds ${MAX_DRAFT_BYTES} UTF-8 bytes`);
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    fail("Draft is not valid JSON");
  }
  return validateCvDocument(value);
}

// Compact serialization keeps the byte cap identical on export and import.
// Caller downloads this text explicitly; incomplete drafts remain exportable.
export function exportCvDraft(value: unknown): string {
  return JSON.stringify(validateCvDocument(value));
}
