export const SCHEMA = "cv-authoring/2.0" as const;
export const LEGACY_SCHEMA = "cv-authoring/1.0" as const;
export const TEMPLATES = ["classic", "modern", "minimal", "executive"] as const;
export type TemplateId = typeof TEMPLATES[number];
export const DEFAULT_TEMPLATE: TemplateId = "modern";
export const DEFAULT_ACCENT_COLOR = "#00b14f";
export const MAX_DRAFT_BYTES = 256 * 1024;
export const MAX_SECTION_ENTRIES = 20;
export const MAX_PHOTO_DATA_URL_LENGTH = 160_000;
export const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;

export const CV_LANGUAGES = ["vi", "en"] as const;
export type CvLanguage = typeof CV_LANGUAGES[number];

export const CV_FONT_SIZES = ["small", "medium", "large"] as const;
export type CvFontSize = typeof CV_FONT_SIZES[number];

export const CV_LINE_SPACINGS = ["compact", "normal", "relaxed"] as const;
export type CvLineSpacing = typeof CV_LINE_SPACINGS[number];

export const CV_FONT_FAMILIES = ["sans", "serif", "mono"] as const;
export type CvFontFamily = typeof CV_FONT_FAMILIES[number];

export const ACCENT_PRESETS = [
  { id: "#00b14f", label: "Xanh TopCV" },
  { id: "#0f766e", label: "Xanh ngọc" },
  { id: "#1e3a8a", label: "Xanh navy" },
  { id: "#334155", label: "Xám đá" },
  { id: "#047857", label: "Lục bảo" },
  { id: "#9f1239", label: "Đỏ rượu" },
] as const;

export const TEMPLATE_META: Record<TemplateId, { name: string; badge: string; description: string }> = {
  classic: {
    name: "Classic",
    badge: "CLASSIC · A4 · CHUẨN ATS",
    description: "Bố cục truyền thống một cột, rõ ràng và dễ quét cho mọi ngành nghề.",
  },
  modern: {
    name: "Modern",
    badge: "MODERN · A4 · HAI CỘT",
    description: "Thanh bên nổi bật ảnh đại diện, liên hệ và kỹ năng; cột chính cho kinh nghiệm.",
  },
  minimal: {
    name: "Minimal",
    badge: "MINIMAL · A4 · TINH GỌN",
    description: "Thiết kế tối giản với đường nhấn dọc tinh tế và khoảng trắng thoáng.",
  },
  executive: {
    name: "Executive",
    badge: "EXECUTIVE · A4 · HEADER NỔI BẬT",
    description: "Header màu toàn phần phong cách TopCV cùng thân hai cột cân đối.",
  },
};

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

export const CORE_BODY_SECTIONS = [
  "introduction", "skills", "experiences", "education", "projects", "certificates", "languages",
] as const;

export const SECTIONS = [
  "experiences", "education", "projects", "certificates", "languages", "awards", "activities", "hobbies",
] as const;
export type Section = typeof SECTIONS[number];

export const BODY_SECTIONS = [
  "introduction", "skills", "experiences", "education", "projects", "certificates", "languages", "awards", "activities", "hobbies",
] as const;
export type BodySection = typeof BODY_SECTIONS[number];

export const SECTION_LABELS: Record<BodySection, string> = {
  introduction: "Giới thiệu",
  skills: "Kỹ năng",
  experiences: "Kinh nghiệm làm việc",
  education: "Học vấn",
  projects: "Dự án",
  certificates: "Chứng chỉ",
  languages: "Ngoại ngữ",
  awards: "Giải thưởng",
  activities: "Hoạt động",
  hobbies: "Sở thích",
};

export const SECTION_LABELS_BY_LANG: Record<CvLanguage, Record<BodySection, string>> = {
  vi: {
    introduction: "Mục tiêu nghề nghiệp",
    skills: "Kỹ năng",
    experiences: "Kinh nghiệm làm việc",
    education: "Học vấn",
    projects: "Dự án",
    certificates: "Chứng chỉ",
    languages: "Ngoại ngữ",
    awards: "Giải thưởng",
    activities: "Hoạt động",
    hobbies: "Sở thích",
  },
  en: {
    introduction: "Career Objective",
    skills: "Skills",
    experiences: "Work Experience",
    education: "Education",
    projects: "Projects",
    certificates: "Certificates",
    languages: "Languages",
    awards: "Honors & Awards",
    activities: "Activities",
    hobbies: "Hobbies",
  },
};

export function getSectionLabel(
  section: BodySection,
  language: CvLanguage = "vi",
  customTitles?: Partial<Record<BodySection, string>>,
): string {
  const custom = customTitles?.[section]?.trim();
  return custom || SECTION_LABELS_BY_LANG[language][section];
}

export const optionalScalarLimits = {
  dateOfBirth: 40,
  gender: 40,
} as const;
export const MAX_SECTION_TITLE_LENGTH = 80;

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
  templateId: TemplateId;
  accentColor: string;
  sectionOrder: BodySection[];
  photoDataUrl: string;
  language: CvLanguage;
  fontSize: CvFontSize;
  lineSpacing: CvLineSpacing;
  fontFamily: CvFontFamily;
  dateOfBirth: string;
  gender: string;
  sectionTitles: Partial<Record<BodySection, string>>;
  hiddenSections: BodySection[];
} & Record<Scalar, string> & Record<Section, CvEntry[]>;

export type CvDraftPayloadDto = Omit<
  CvDocument,
  | "schemaVersion"
  | "templateId"
  | "accentColor"
  | "sectionOrder"
  | "title"
  | "photoDataUrl"
  | "language"
  | "fontSize"
  | "lineSpacing"
  | "fontFamily"
  | "dateOfBirth"
  | "gender"
  | "awards"
  | "activities"
  | "hobbies"
  | "sectionTitles"
  | "hiddenSections"
> & {
  photoDataUrl?: string | null;
  language?: CvLanguage;
  fontSize?: CvFontSize;
  lineSpacing?: CvLineSpacing;
  fontFamily?: CvFontFamily;
  dateOfBirth?: string | null;
  gender?: string | null;
  awards?: CvEntry[];
  activities?: CvEntry[];
  hobbies?: CvEntry[];
  sectionTitles?: Partial<Record<BodySection, string>>;
  hiddenSections?: BodySection[];
};

export type CvDraftRecord = {
  draftId: string;
  candidateUserId: string;
  title: string;
  templateId: TemplateId;
  accentColor: string;
  sectionOrder: BodySection[];
  payload: CvDraftPayloadDto;
  createdAt: string;
  updatedAt: string;
  version: number;
};

const scalarKeys = Object.keys(scalarLimits) as Scalar[];
const payloadScalarKeys = scalarKeys.filter((k): k is Exclude<Scalar, "title"> => k !== "title");
const entryKeys = Object.keys(entryLimits) as (keyof typeof entryLimits)[];
const LEGACY_SECTIONS = ["experiences", "education", "projects", "certificates", "languages"] as const;
const OPTIONAL_SECTIONS = ["awards", "activities", "hobbies"] as const;
const optionalStyleKeys = [
  "photoDataUrl",
  "language",
  "fontSize",
  "lineSpacing",
  "fontFamily",
  "dateOfBirth",
  "gender",
  "awards",
  "activities",
  "hobbies",
  "sectionTitles",
  "hiddenSections",
] as const;
const v1Keys = ["schemaVersion", "templateId", ...scalarKeys, ...LEGACY_SECTIONS];
const v2RequiredKeys = ["schemaVersion", "templateId", "accentColor", "sectionOrder", ...scalarKeys, ...LEGACY_SECTIONS];
const v2AllowedKeys = new Set<string>([...v2RequiredKeys, ...optionalStyleKeys]);
const allowedEntryKeys = [...entryKeys, "current"];
const SAFE_PHOTO_DATA_URL_RE = /^(?:|data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/;
const encoder = new TextEncoder();

function fail(message: string): never {
  throw new Error(message);
}

function validateObjectFields(
  value: unknown,
  requiredKeys: readonly string[],
  allowedKeys: ReadonlySet<string>,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(`${path}: expected an object`);
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null)
    fail(`${path}: expected a plain object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some(k => typeof k !== "string" || !allowedKeys.has(k)))
    fail(`${path}: unknown fields`);
  if (requiredKeys.some(k => !(k in descriptors)))
    fail(`${path}: missing required fields`);
  const result: Record<string, unknown> = Object.create(null);
  for (const key of actual) {
    if (typeof key !== "string") continue;
    const d = descriptors[key];
    if (!d || !("value" in d)) fail(`${path}.${key}: expected a data field`);
    result[key] = d.value;
  }
  return result;
}

function exactObject(
  value: unknown, keys: readonly string[], path: string,
): Record<string, unknown> {
  const result = validateObjectFields(value, keys, new Set(keys), path);
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

function validateTemplateId(value: unknown): TemplateId {
  if (typeof value !== "string" || !TEMPLATES.includes(value as TemplateId))
    fail("Unsupported templateId");
  return value as TemplateId;
}

function validateAccentColor(value: unknown): string {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value))
    fail("Invalid accentColor");
  return value.toLowerCase();
}

function validateSectionOrder(value: unknown): BodySection[] {
  if (!Array.isArray(value) || value.length < CORE_BODY_SECTIONS.length || value.length > BODY_SECTIONS.length)
    fail("sectionOrder: expected 7 to 10 unique sections");
  const seen = new Set<BodySection>();
  const order: BodySection[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !BODY_SECTIONS.includes(item as BodySection))
      fail("sectionOrder: unknown section");
    const section = item as BodySection;
    if (seen.has(section)) fail("sectionOrder: duplicate section");
    seen.add(section);
    order.push(section);
  }
  for (const required of CORE_BODY_SECTIONS) {
    if (!seen.has(required)) fail("sectionOrder: missing core section");
  }
  for (const section of BODY_SECTIONS) {
    if (!seen.has(section)) order.push(section);
  }
  return order;
}

function validateSectionTitles(value: unknown): Partial<Record<BodySection, string>> {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) fail("sectionTitles: expected an object");
  const result: Partial<Record<BodySection, string>> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!BODY_SECTIONS.includes(key as BodySection)) fail(`sectionTitles: unknown section ${key}`);
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== "string") fail(`sectionTitles.${key}: expected a string`);
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_SECTION_TITLE_LENGTH) {
      fail(`sectionTitles.${key}: exceeds ${MAX_SECTION_TITLE_LENGTH} characters`);
    }
    result[key as BodySection] = trimmed;
  }
  return result;
}

export function isSafeCvPhotoDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_PHOTO_DATA_URL_LENGTH &&
    SAFE_PHOTO_DATA_URL_RE.test(value)
  );
}

function validatePhotoDataUrl(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  if (!isSafeCvPhotoDataUrl(value)) fail("photoDataUrl: expected a PNG, JPEG, or WebP base64 data URL");
  return value;
}

function validateEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
  field: string,
): T[number] {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !allowed.includes(value)) {
    fail(`${field}: unsupported value`);
  }
  return value as T[number];
}

function validateHiddenSections(value: unknown): BodySection[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > BODY_SECTIONS.length)
    fail("hiddenSections: invalid list");
  const seen = new Set<BodySection>();
  const hidden: BodySection[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !BODY_SECTIONS.includes(item as BodySection))
      fail("hiddenSections: unknown section");
    const section = item as BodySection;
    if (seen.has(section)) fail("hiddenSections: duplicate section");
    seen.add(section);
    hidden.push(section);
  }
  return hidden;
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
    schemaVersion: SCHEMA,
    templateId: DEFAULT_TEMPLATE,
    accentColor: DEFAULT_ACCENT_COLOR,
    sectionOrder: [...BODY_SECTIONS],
    photoDataUrl: "",
    language: "vi",
    fontSize: "medium",
    lineSpacing: "normal",
    fontFamily: "sans",
    dateOfBirth: "",
    gender: "",
    sectionTitles: {},
    hiddenSections: [],
    title: "", fullName: "", headline: "", email: "", phone: "",
    location: "", links: "", introduction: "", skills: "",
    experiences: [], education: [], projects: [], certificates: [], languages: [],
    awards: [], activities: [], hobbies: [],
  };
}

export function reorderArray<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= items.length ||
    toIndex < 0 ||
    toIndex >= items.length
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function moveSectionOrder(order: BodySection[], index: number, direction: -1 | 1): BodySection[] {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function reorderSectionOrder(order: BodySection[], fromIndex: number, toIndex: number): BodySection[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    fromIndex >= order.length ||
    toIndex < 0 ||
    toIndex >= order.length
  ) {
    return order;
  }
  return reorderArray(order, fromIndex, toIndex);
}

export function toggleSectionVisibility(hiddenSections: readonly BodySection[], section: BodySection): BodySection[] {
  return hiddenSections.includes(section)
    ? hiddenSections.filter(item => item !== section)
    : [...hiddenSections, section];
}

// Structural validation permits incomplete drafts and returns a detached copy.
// Accepts both cv-authoring/2.0 (with optional TopCV display settings) and legacy cv-authoring/1.0 drafts.
export function validateCvDocument(value: unknown): CvDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail("document: expected an object");
  const version = (value as Record<string, unknown>).schemaVersion;
  const isLegacy = version === LEGACY_SCHEMA;
  if (!isLegacy && version !== SCHEMA) fail("Unsupported schemaVersion");
  const source = isLegacy
    ? exactObject(value, v1Keys, "document")
    : validateObjectFields(value, v2RequiredKeys, v2AllowedKeys, "document");
  if (isLegacy && source.templateId !== "classic") fail("Unsupported templateId");

  const doc = createCvDocument();
  doc.templateId = isLegacy ? "classic" : validateTemplateId(source.templateId);
  doc.accentColor = isLegacy ? DEFAULT_ACCENT_COLOR : validateAccentColor(source.accentColor);
  doc.sectionOrder = isLegacy ? [...BODY_SECTIONS] : validateSectionOrder(source.sectionOrder);
  if (!isLegacy) {
    doc.photoDataUrl = validatePhotoDataUrl(source.photoDataUrl);
    doc.language = validateEnum(source.language, CV_LANGUAGES, "vi", "language");
    doc.fontSize = validateEnum(source.fontSize, CV_FONT_SIZES, "medium", "fontSize");
    doc.lineSpacing = validateEnum(source.lineSpacing, CV_LINE_SPACINGS, "normal", "lineSpacing");
    doc.fontFamily = validateEnum(source.fontFamily, CV_FONT_FAMILIES, "sans", "fontFamily");
    doc.dateOfBirth = source.dateOfBirth === undefined || source.dateOfBirth === null
      ? ""
      : text(source.dateOfBirth, optionalScalarLimits.dateOfBirth, "dateOfBirth");
    doc.gender = source.gender === undefined || source.gender === null
      ? ""
      : text(source.gender, optionalScalarLimits.gender, "gender");
    doc.sectionTitles = validateSectionTitles(source.sectionTitles);
    doc.hiddenSections = validateHiddenSections(source.hiddenSections);
  }
  for (const key of scalarKeys)
    doc[key] = text(source[key], scalarLimits[key], key);

  const ids = new Set<string>();
  const sectionsToValidate = isLegacy
    ? LEGACY_SECTIONS
    : SECTIONS;
  for (const section of sectionsToValidate) {
    const isOptionalSection = (OPTIONAL_SECTIONS as readonly string[]).includes(section);
    const items = source[section];
    if (items === undefined || items === null) {
      if (isOptionalSection) {
        doc[section] = [];
        continue;
      }
      fail(`${section}: expected an array`);
    }
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
export function cvDocumentErrors(value: unknown): string[] {
  let doc: CvDocument;
  try {
    doc = validateCvDocument(value);
  } catch {
    return ["Kiểm tra độ dài nội dung, ảnh đại diện và mốc thời gian: tháng hợp lệ, bắt đầu không sau kết thúc."];
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

export function exportCvDraft(value: unknown): string {
  return JSON.stringify(validateCvDocument(value));
}

export function toServerDraftRequest(value: CvDocument, expectedVersion?: number) {
  const doc = validateCvDocument(value);
  const title = (doc.title.trim() || doc.fullName.trim() || "CV chưa đặt tên").slice(0, scalarLimits.title);
  const payload = {
    photoDataUrl: doc.photoDataUrl,
    language: doc.language,
    fontSize: doc.fontSize,
    lineSpacing: doc.lineSpacing,
    fontFamily: doc.fontFamily,
    dateOfBirth: doc.dateOfBirth,
    gender: doc.gender,
    sectionTitles: doc.sectionTitles,
    hiddenSections: doc.hiddenSections,
  } as CvDraftPayloadDto;
  for (const key of payloadScalarKeys) payload[key] = doc[key];
  for (const section of SECTIONS) payload[section] = doc[section];
  return {
    title,
    templateId: doc.templateId,
    accentColor: doc.accentColor,
    sectionOrder: doc.sectionOrder,
    payload,
    ...(expectedVersion !== undefined ? { expectedVersion } : {}),
  };
}

export function fromServerDraft(record: CvDraftRecord): CvDocument {
  return validateCvDocument({
    schemaVersion: SCHEMA,
    templateId: record.templateId,
    accentColor: record.accentColor,
    sectionOrder: record.sectionOrder,
    title: record.title,
    ...record.payload,
  });
}

export type CvCompletenessCheck = {
  score: number;
  items: {
    id: string;
    label: string;
    completed: boolean;
    points: number;
    section?: BodySection;
  }[];
};

export function computeCvCompleteness(doc: CvDocument): CvCompletenessCheck {
  const hidden = new Set(doc.hiddenSections);
  const hasIdentity = doc.fullName.trim().length >= 2 && doc.headline.trim().length >= 2;
  const hasContact = doc.email.trim().length > 0 || doc.phone.trim().length > 0;
  const hasIntro = !hidden.has("introduction") && doc.introduction.trim().length >= 30;
  const hasExperienceOrProject =
    (!hidden.has("experiences") && doc.experiences.some(hasEntryContent)) ||
    (!hidden.has("projects") && doc.projects.some(hasEntryContent));
  const hasSkills = !hidden.has("skills") && doc.skills.trim().length >= 10;
  const hasEduCertOrLang =
    (!hidden.has("education") && doc.education.some(hasEntryContent)) ||
    (!hidden.has("certificates") && doc.certificates.some(hasEntryContent)) ||
    (!hidden.has("languages") && doc.languages.some(hasEntryContent));

  const items: CvCompletenessCheck["items"] = [
    { id: "identity", label: "Họ tên & vị trí ứng tuyển", completed: hasIdentity, points: 20 },
    { id: "contact", label: "Email hoặc số điện thoại liên hệ", completed: hasContact, points: 15 },
    { id: "intro", label: "Mục tiêu nghề nghiệp (>= 30 ký tự)", completed: hasIntro, points: 15, section: "introduction" },
    { id: "work", label: "Kinh nghiệm làm việc hoặc Dự án thực tế", completed: hasExperienceOrProject, points: 25, section: "experiences" },
    { id: "skills", label: "Kỹ năng chuyên môn", completed: hasSkills, points: 15, section: "skills" },
    { id: "background", label: "Học vấn, Chứng chỉ hoặc Ngoại ngữ", completed: hasEduCertOrLang, points: 10, section: "education" },
  ];
  const score = items.reduce((sum, item) => sum + (item.completed ? item.points : 0), 0);
  return { score, items };
}

export async function resizeCvAvatarFile(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Chỉ hỗ trợ ảnh đại diện định dạng PNG, JPG hoặc WebP.");
  }
  if (file.size > MAX_PHOTO_UPLOAD_BYTES) {
    throw new Error("Ảnh đại diện vượt quá 5 MiB. Vui lòng chọn ảnh nhỏ hơn.");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Không đọc được file ảnh này."));
      image.src = objectUrl;
    });
    const size = 240;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Trình duyệt không hỗ trợ xử lý ảnh cục bộ.");
    const minSide = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const sx = Math.max(0, ((img.naturalWidth || img.width) - minSide) / 2);
    const sy = Math.max(0, ((img.naturalHeight || img.height) - minSide) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    if (!isSafeCvPhotoDataUrl(dataUrl)) {
      throw new Error("Ảnh sau khi nén vẫn vượt kích thước cho phép.");
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
