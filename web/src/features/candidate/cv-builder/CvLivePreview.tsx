import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import {
  createCvEntry,
  getSectionLabel,
  isSafeCvPhotoDataUrl,
  MAX_SECTION_TITLE_LENGTH,
  moveSectionOrder,
  optionalScalarLimits,
  reorderArray,
  reorderSectionOrder,
  scalarLimits,
  SECTION_LABELS,
  SECTION_LABELS_BY_LANG,
  toggleSectionVisibility,
  type BodySection,
  type CvDocument,
  type CvEntry,
  type CvFontFamily,
  type CvFontSize,
  type CvLanguage,
  type CvLineSpacing,
  type Section,
} from "./cvDocument";
import { applyRichFormatToText, parseRichTextLines, type RichFormatAction } from "./cvRichText";

type Props = {
  doc: CvDocument;
  editable?: boolean;
  disabled?: boolean;
  onChangeDoc?: (next: CvDocument) => void;
  onReorderSection?: (fromIndex: number, toIndex: number) => void;
  onMoveSection?: (index: number, direction: -1 | 1) => void;
  onUploadAvatar?: (file: File) => void;
  onRemoveAvatar?: () => void;
  onRequestSuggestion?: (section: BodySection) => void;
};

const FONT_FAMILY_CSS: Record<CvFontFamily, string> = {
  sans: '"Noto Sans", ui-sans-serif, system-ui, sans-serif',
  serif: '"Noto Serif", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, monospace',
};

const FONT_SIZE_CSS: Record<CvFontSize, { body: string; title: string; subtitle: string; heading: string; meta: string }> = {
  small: { body: "11px", title: "11.5px", subtitle: "10.5px", heading: "12px", meta: "10px" },
  medium: { body: "12px", title: "12.5px", subtitle: "11.5px", heading: "13px", meta: "10.5px" },
  large: { body: "13px", title: "13.5px", subtitle: "12px", heading: "14px", meta: "11px" },
};

const LINE_HEIGHT_CSS: Record<CvLineSpacing, string> = {
  compact: "1.35",
  normal: "1.52",
  relaxed: "1.7",
};

function hasContent(entry: CvEntry): boolean {
  return [entry.title, entry.subtitle, entry.description].some(v => v.trim().length > 0);
}

function formatDates(entry: CvEntry, language: CvLanguage): string {
  const currentLabel = language === "en" ? "Present" : "Hiện tại";
  return [entry.startMonth, entry.current ? currentLabel : entry.endMonth].filter(Boolean).join(" - ");
}

function hasSectionContent(doc: CvDocument, section: BodySection): boolean {
  if (section === "introduction") return doc.introduction.trim().length > 0;
  if (section === "skills") return doc.skills.trim().length > 0;
  return doc[section as Section].some(hasContent);
}

function ContactGlyph({ kind, color }: { kind: "email" | "phone" | "location" | "link"; color: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mt-0.5 shrink-0"
    >
      {kind === "email" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </>
      )}
      {kind === "phone" && (
        <path d="M6.5 4h3l1.5 4-2 1.5a12 12 0 0 0 5.5 5.5L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4z" />
      )}
      {kind === "location" && (
        <>
          <path d="M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10z" />
          <circle cx="12" cy="11" r="2" />
        </>
      )}
      {kind === "link" && (
        <path d="M10 13a5 5 0 0 0 7.1 0l2.8-2.8a5 5 0 0 0-7.1-7.1L11 4.8M14 11a5 5 0 0 0-7.1 0L4.1 13.8a5 5 0 0 0 7.1 7.1L13 19.2" />
      )}
    </svg>
  );
}

function AvatarSlot({
  photoDataUrl,
  accent,
  round = true,
  inverted = false,
  editable,
  onUploadAvatar,
  onRemoveAvatar,
}: {
  photoDataUrl: string;
  accent: string;
  round?: boolean;
  inverted?: boolean;
  editable: boolean;
  onUploadAvatar?: (file: File) => void;
  onRemoveAvatar?: () => void;
}) {
  const safePhoto = photoDataUrl && isSafeCvPhotoDataUrl(photoDataUrl) ? photoDataUrl : "";
  if (!safePhoto && !editable) return null;

  const shape = round ? "rounded-full" : "rounded-xl";
  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onUploadAvatar?.(file);
  };

  if (!safePhoto) {
    return (
      <label
        className={`flex h-20 w-20 shrink-0 cursor-pointer flex-col items-center justify-center border-2 border-dashed text-center text-[10px] font-medium transition ${shape} ${
          inverted
            ? "border-white/70 bg-white/10 text-white hover:bg-white/20"
            : "border-slate-300 bg-slate-100/70 text-ink-500 hover:border-brand-600 hover:text-brand-700"
        }`}
      >
        <span>+ Ảnh thẻ</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Tải ảnh đại diện CV"
          className="sr-only"
          onChange={handleFile}
        />
      </label>
    );
  }

  return (
    <div className="group/avatar relative shrink-0">
      <img
        src={safePhoto}
        alt="Ảnh đại diện CV"
        style={{ borderColor: inverted ? "#ffffff" : accent }}
        className={`h-20 w-20 border-2 object-cover shadow-xs ${shape}`}
      />
      {editable && (
        <div className="absolute inset-x-0 -bottom-2 flex justify-center gap-1 opacity-0 transition group-hover/avatar:opacity-100 group-focus-within/avatar:opacity-100">
          <label className="cursor-pointer rounded bg-ink-900/90 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-ink-900">
            Đổi
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="Đổi ảnh đại diện CV"
              className="sr-only"
              onChange={handleFile}
            />
          </label>
          {onRemoveAvatar && (
            <button
              type="button"
              onClick={onRemoveAvatar}
              className="cursor-pointer rounded bg-rose-700/95 px-1.5 py-0.5 text-[9px] font-semibold text-white hover:bg-rose-800"
            >
              Xóa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const inlineFieldBase =
  "w-full rounded border border-transparent bg-transparent px-1 -mx-1 transition hover:border-dashed hover:border-slate-300 focus:border-solid focus:border-brand-600 focus:bg-white/95 focus:text-ink-900 focus:outline-none";

function RichHtmlText({ text, fontSize, lineHeight }: { text: string; fontSize: string; lineHeight: string }) {
  const lines = parseRichTextLines(text);
  return (
    <div style={{ fontSize, lineHeight }} className="space-y-0.5 text-ink-800">
      {lines.map((line, i) => {
        const inline = line.runs.map((run, idx) => {
          if (run.bold) return <strong key={idx}>{run.text}</strong>;
          if (run.italic) return <em key={idx}>{run.text}</em>;
          return <span key={idx}>{run.text}</span>;
        });
        if (line.isBullet) {
          return (
            <div key={i} className="flex items-start gap-1.5">
              <span aria-hidden="true" className="shrink-0">•</span>
              <span className="min-w-0 flex-1">{inline}</span>
            </div>
          );
        }
        return (
          <p key={i} className="m-0">
            {inline}
          </p>
        );
      })}
    </div>
  );
}

function RichInlineTextarea({
  ariaLabel,
  value,
  maxLength,
  placeholder,
  rows,
  fontSize,
  lineHeight,
  onChangeValue,
}: {
  ariaLabel: string;
  value: string;
  maxLength: number;
  placeholder: string;
  rows: number;
  fontSize: string;
  lineHeight: string;
  onChangeValue: (next: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const handleFormat = (action: RichFormatAction) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const result = applyRichFormatToText(value, start, end, action);
    onChangeValue(result.nextValue);
    requestAnimationFrame(() => {
      if (!ref.current) return;
      ref.current.focus();
      ref.current.setSelectionRange(result.nextStart, result.nextEnd);
    });
  };

  return (
    <div className="group/rich relative">
      <div className="mb-0.5 flex items-center justify-end gap-1 opacity-0 transition group-focus-within/rich:opacity-100 group-hover/rich:opacity-100">
        <button
          type="button"
          title="In đậm (**text**)"
          aria-label={`In đậm ${ariaLabel}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => handleFormat("bold")}
          className="cursor-pointer rounded border border-border-subtle bg-white px-1.5 py-0.5 text-[10px] font-bold text-ink-700 hover:bg-slate-100"
        >
          B
        </button>
        <button
          type="button"
          title="In nghiêng (*text*)"
          aria-label={`In nghiêng ${ariaLabel}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => handleFormat("italic")}
          className="cursor-pointer rounded border border-border-subtle bg-white px-1.5 py-0.5 text-[10px] italic text-ink-700 hover:bg-slate-100"
        >
          I
        </button>
        <button
          type="button"
          title="Danh sách dấu đầu dòng (• )"
          aria-label={`Danh sách ${ariaLabel}`}
          onMouseDown={e => e.preventDefault()}
          onClick={() => handleFormat("bullet")}
          className="cursor-pointer rounded border border-border-subtle bg-white px-1.5 py-0.5 text-[10px] font-semibold text-ink-700 hover:bg-slate-100"
        >
          • List
        </button>
      </div>
      <textarea
        ref={ref}
        aria-label={ariaLabel}
        rows={rows}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={e => onChangeValue(e.target.value)}
        style={{ fontSize, lineHeight }}
        className={`${inlineFieldBase} resize-y text-ink-800 placeholder:text-ink-400`}
      />
    </div>
  );
}

function entryPlaceholder(section: Section, language: CvLanguage) {
  if (language === "en") {
    switch (section) {
      case "experiences":
        return { title: "Job Title (e.g. Backend Engineer)", subtitle: "Company Name" };
      case "education":
        return { title: "Degree / Major", subtitle: "University / School" };
      case "projects":
        return { title: "Project Name", subtitle: "Role & Team Size" };
      case "certificates":
        return { title: "Certificate Title", subtitle: "Issuing Organization" };
      case "languages":
        return { title: "Language (e.g. English)", subtitle: "Proficiency (e.g. IELTS 7.0)" };
      case "awards":
        return { title: "Award / Honor", subtitle: "Issuing Organization" };
      case "activities":
        return { title: "Club / Volunteer Role", subtitle: "Organization / Event" };
      case "hobbies":
        return { title: "Hobby / Personal Interest", subtitle: "Short note (optional)" };
    }
  }
  switch (section) {
    case "experiences":
      return { title: "Vị trí công việc (VD: Kỹ sư Backend)", subtitle: "Tên công ty / Tổ chức" };
    case "education":
      return { title: "Chuyên ngành / Bằng cấp", subtitle: "Trường học / Cơ sở đào tạo" };
    case "projects":
      return { title: "Tên dự án", subtitle: "Vai trò · Quy mô nhóm" };
    case "certificates":
      return { title: "Tên chứng chỉ / Bằng cấp", subtitle: "Đơn vị cấp" };
    case "languages":
      return { title: "Ngoại ngữ (VD: Tiếng Anh)", subtitle: "Trình độ (VD: IELTS 7.0)" };
    case "awards":
      return { title: "Tên giải thưởng / Danh hiệu", subtitle: "Đơn vị trao giải" };
    case "activities":
      return { title: "Vai trò / Hoạt động ngoại khóa", subtitle: "CLB / Tổ chức" };
    case "hobbies":
      return { title: "Sở thích (VD: Đọc sách công nghệ, Chạy bộ)", subtitle: "Mô tả ngắn (không bắt buộc)" };
  }
}

function SectionBlock({
  section,
  doc,
  accent,
  minimal = false,
  sidebar = false,
  editable = false,
  interactive,
  orderIndex,
  totalSections,
  isDragged,
  isDropTarget,
  onChangeDoc,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onMoveSection,
  onRequestSuggestion,
}: {
  section: BodySection;
  doc: CvDocument;
  accent: string;
  minimal?: boolean;
  sidebar?: boolean;
  editable?: boolean;
  interactive: boolean;
  orderIndex: number;
  totalSections: number;
  isDragged: boolean;
  isDropTarget: boolean;
  onChangeDoc?: (next: CvDocument) => void;
  onDragStart?: (index: number) => (event: DragEvent<HTMLElement>) => void;
  onDragOver?: (index: number) => (event: DragEvent<HTMLElement>) => void;
  onDrop?: (index: number) => (event: DragEvent<HTMLElement>) => void;
  onDragEnd?: () => void;
  onMoveSection?: (index: number, direction: -1 | 1) => void;
  onRequestSuggestion?: (section: BodySection) => void;
}) {
  if (!editable && !hasSectionContent(doc, section)) return null;

  const typo = FONT_SIZE_CSS[doc.fontSize];
  const lineHeight = LINE_HEIGHT_CSS[doc.lineSpacing];
  const label = getSectionLabel(section, doc.language, doc.sectionTitles);
  const stableLabel = SECTION_LABELS[section];
  const isEntrySection = section !== "introduction" && section !== "skills";
  const isTimeline = !minimal && !sidebar && (section === "experiences" || section === "projects" || section === "activities");

  const wrapperClass = interactive
    ? `group/sec relative rounded-lg p-1.5 -m-1.5 transition ${
        isDragged
          ? "opacity-50"
          : isDropTarget
            ? "bg-brand-50/50 ring-2 ring-brand-500"
            : "hover:bg-slate-50/75 hover:ring-1 hover:ring-slate-300"
      }`
    : "";

  const dragProps = interactive
    ? {
        draggable: !editable,
        onDragOver: onDragOver?.(orderIndex),
        onDrop: onDrop?.(orderIndex),
        onDragEnd,
      }
    : {};

  function addEntryToSection(target: Section) {
    if (!onChangeDoc) return;
    onChangeDoc({ ...doc, [target]: [...doc[target], createCvEntry()] });
  }

  function hideSection() {
    if (!onChangeDoc) return;
    onChangeDoc({ ...doc, hiddenSections: toggleSectionVisibility(doc.hiddenSections, section) });
  }

  return (
    <section className={`space-y-1.5 ${wrapperClass}`} {...dragProps}>
      {interactive && (
        <div
          className={`flex flex-wrap items-center gap-0.5 rounded-md border border-border-subtle bg-white/95 px-1.5 py-0.5 text-[10px] text-ink-700 shadow-xs transition ${
            editable
              ? "mb-1 justify-end opacity-90 group-hover/sec:opacity-100 group-focus-within/sec:opacity-100"
              : "absolute right-1.5 top-1 z-10 opacity-0 group-hover/sec:opacity-100 group-focus-within/sec:opacity-100"
          }`}
        >
          <span
            draggable
            onDragStart={onDragStart?.(orderIndex)}
            className="cursor-grab px-1 font-bold text-ink-400 select-none"
            title="Kéo khối để đổi vị trí"
            aria-hidden="true"
          >
            ⋮⋮
          </span>
          {onMoveSection && (
            <>
              <button
                type="button"
                disabled={orderIndex === 0}
                aria-label={`Đưa mục ${stableLabel} lên`}
                onClick={() => onMoveSection(orderIndex, -1)}
                className="cursor-pointer rounded px-1 py-0.5 font-semibold hover:bg-slate-100 disabled:opacity-35"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={orderIndex === totalSections - 1}
                aria-label={`Đưa mục ${stableLabel} xuống`}
                onClick={() => onMoveSection(orderIndex, 1)}
                className="cursor-pointer rounded px-1 py-0.5 font-semibold hover:bg-slate-100 disabled:opacity-35"
              >
                ↓
              </button>
            </>
          )}
          {editable && isEntrySection && onChangeDoc && (
            <button
              type="button"
              onClick={() => addEntryToSection(section as Section)}
              className="cursor-pointer rounded px-1.5 py-0.5 font-semibold text-brand-700 hover:bg-brand-50"
            >
              + Thêm
            </button>
          )}
          {editable && onRequestSuggestion && (section === "introduction" || section === "skills" || section === "experiences" || section === "projects") && (
            <button
              type="button"
              onClick={() => onRequestSuggestion(section)}
              className="cursor-pointer rounded px-1.5 py-0.5 font-medium text-ink-600 hover:bg-slate-100"
            >
              Gợi ý
            </button>
          )}
          {editable && onChangeDoc && (
            <button
              type="button"
              aria-label={`Ẩn mục ${stableLabel}`}
              onClick={hideSection}
              className="cursor-pointer rounded px-1.5 py-0.5 font-medium text-ink-500 hover:bg-rose-50 hover:text-rose-700"
            >
              Ẩn
            </button>
          )}
        </div>
      )}

      <div
        style={{ borderBottomColor: minimal ? accent : "#e2e8f0" }}
        className="flex items-center gap-1.5 border-b pb-1"
      >
        {!minimal && (
          <span
            aria-hidden="true"
            className="inline-block h-3.5 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: accent }}
          />
        )}
        {editable && onChangeDoc ? (
          <input
            type="text"
            aria-label={`Tiêu đề mục ${stableLabel}`}
            maxLength={MAX_SECTION_TITLE_LENGTH}
            value={doc.sectionTitles[section] ?? ""}
            placeholder={SECTION_LABELS_BY_LANG[doc.language][section]}
            onChange={e =>
              onChangeDoc({
                ...doc,
                sectionTitles: {
                  ...doc.sectionTitles,
                  [section]: e.target.value,
                },
              })
            }
            style={{
              color: minimal ? "#0f172a" : accent,
              fontSize: typo.heading,
              letterSpacing: minimal ? "0.06em" : undefined,
            }}
            className={`${inlineFieldBase} font-bold placeholder:opacity-100 ${minimal ? "uppercase" : ""}`}
          />
        ) : (
          <h4
            style={{
              color: minimal ? "#0f172a" : accent,
              fontSize: typo.heading,
              letterSpacing: minimal ? "0.06em" : undefined,
            }}
            className={`m-0 font-bold ${minimal ? "uppercase" : ""}`}
          >
            {label}
          </h4>
        )}
      </div>

      {section === "introduction" && (
        editable && onChangeDoc ? (
          <RichInlineTextarea
            ariaLabel="Giới thiệu"
            rows={Math.max(3, Math.min(8, doc.introduction.split("\n").length + 1))}
            maxLength={scalarLimits.introduction}
            value={doc.introduction}
            placeholder={
              doc.language === "en"
                ? "Click to summarize your experience, core strengths and career goals..."
                : "Nhấp để viết mục tiêu nghề nghiệp, thế mạnh chuyên môn và giá trị bạn mang lại..."
            }
            fontSize={typo.body}
            lineHeight={lineHeight}
            onChangeValue={next => onChangeDoc({ ...doc, introduction: next })}
          />
        ) : (
          <RichHtmlText text={doc.introduction.trim()} fontSize={typo.body} lineHeight={lineHeight} />
        )
      )}

      {section === "skills" && (
        editable && onChangeDoc ? (
          <textarea
            aria-label="Kỹ năng"
            rows={Math.max(3, Math.min(8, doc.skills.split("\n").length + 1))}
            maxLength={scalarLimits.skills}
            value={doc.skills}
            placeholder={
              doc.language === "en"
                ? "Click to enter skills (comma-separated tags or grouped lines)..."
                : "Nhấp để nhập kỹ năng chuyên môn (phân cách bằng dấu phẩy hoặc theo từng dòng)..."
            }
            onChange={event => onChangeDoc({ ...doc, skills: event.target.value })}
            style={{ fontSize: typo.body, lineHeight }}
            className={`${inlineFieldBase} resize-y text-ink-800 placeholder:text-ink-400`}
          />
        ) : (
          (() => {
            const raw = doc.skills.trim();
            const lines = raw.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
            const isTagList = lines.length === 1 && raw.includes(",") && raw.length <= 220;
            if (isTagList && !sidebar) {
              return (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {raw.split(",").map(s => s.trim()).filter(Boolean).slice(0, 24).map((tag, i) => (
                    <span
                      key={i}
                      style={{ borderColor: accent, fontSize: typo.meta }}
                      className="rounded border bg-slate-50 px-2 py-0.5 font-medium text-ink-800"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              );
            }
            return (
              <p style={{ fontSize: typo.body, lineHeight }} className="m-0 whitespace-pre-line text-ink-800">
                {raw}
              </p>
            );
          })()
        )
      )}

      {isEntrySection && (
        <div className="space-y-2.5 pt-0.5">
          {editable && onChangeDoc ? (
            <>
              {(doc[section as Section]).length === 0 ? (
                <button
                  type="button"
                  onClick={() => addEntryToSection(section as Section)}
                  className="w-full cursor-pointer rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-left text-xs font-medium text-ink-500 transition hover:border-brand-600 hover:bg-brand-50/40 hover:text-brand-700"
                >
                  + Thêm mục {label.toLowerCase()}
                </button>
              ) : (
                doc[section as Section].map((entry, idx, arr) => {
                  const ph = entryPlaceholder(section as Section, doc.language);
                  const updateEntry = (patch: Partial<CvEntry>) =>
                    onChangeDoc({
                      ...doc,
                      [section]: arr.map(item => (item.id === entry.id ? { ...item, ...patch } : item)),
                    });
                  const moveEntry = (dir: -1 | 1) =>
                    onChangeDoc({
                      ...doc,
                      [section]: reorderArray(arr, idx, idx + dir),
                    });
                  const removeEntry = () =>
                    onChangeDoc({
                      ...doc,
                      [section]: arr.filter(item => item.id !== entry.id),
                    });

                  return (
                    <div
                      key={entry.id}
                      className={`group/entry relative space-y-1 rounded-md p-1.5 -mx-1.5 transition hover:bg-slate-50/90 ${
                        isTimeline ? "border-l-2 border-slate-200 pl-3 ml-0" : ""
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <input
                            type="text"
                            aria-label={`${label} ${idx + 1} - Tiêu đề`}
                            value={entry.title}
                            maxLength={240}
                            placeholder={ph.title}
                            onChange={e => updateEntry({ title: e.target.value })}
                            style={{ fontSize: typo.title }}
                            className={`${inlineFieldBase} font-bold text-ink-900 placeholder:font-normal placeholder:text-ink-400`}
                          />
                          <input
                            type="text"
                            aria-label={`${label} ${idx + 1} - Tổ chức`}
                            value={entry.subtitle}
                            maxLength={240}
                            placeholder={ph.subtitle}
                            onChange={e => updateEntry({ subtitle: e.target.value })}
                            style={{ fontSize: typo.subtitle }}
                            className={`${inlineFieldBase} font-medium text-ink-600 placeholder:text-ink-400`}
                          />
                        </div>
                        {section !== "languages" && (
                          <div className="flex flex-wrap items-center gap-1 text-[10px] text-ink-600">
                            <input
                              type="text"
                              aria-label={`${label} ${idx + 1} - Bắt đầu`}
                              placeholder="YYYY-MM"
                              maxLength={7}
                              value={entry.startMonth}
                              onChange={e => updateEntry({ startMonth: e.target.value })}
                              className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-dashed hover:border-slate-300 focus:border-brand-600 focus:bg-white focus:outline-none"
                            />
                            <span>–</span>
                            {entry.current ? (
                              <span className="px-1 font-medium text-ink-700">
                                {doc.language === "en" ? "Present" : "Hiện tại"}
                              </span>
                            ) : (
                              <input
                                type="text"
                                aria-label={`${label} ${idx + 1} - Kết thúc`}
                                placeholder="YYYY-MM"
                                maxLength={7}
                                value={entry.endMonth}
                                onChange={e => updateEntry({ endMonth: e.target.value })}
                                className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-right hover:border-dashed hover:border-slate-300 focus:border-brand-600 focus:bg-white focus:outline-none"
                              />
                            )}
                            <label className="inline-flex cursor-pointer items-center gap-1 rounded px-1 text-[10px] text-ink-500 hover:bg-slate-100">
                              <input
                                type="checkbox"
                                checked={entry.current}
                                onChange={e =>
                                  updateEntry({
                                    current: e.target.checked,
                                    endMonth: e.target.checked ? "" : entry.endMonth,
                                  })
                                }
                              />
                              <span>{doc.language === "en" ? "Now" : "Nay"}</span>
                            </label>
                          </div>
                        )}
                      </div>

                      <RichInlineTextarea
                        ariaLabel={`${label} ${idx + 1} - Mô tả`}
                        rows={Math.max(2, Math.min(6, (entry.description || "").split("\n").length))}
                        maxLength={8000}
                        value={entry.description}
                        placeholder={
                          doc.language === "en"
                            ? "• Key responsibilities & measurable achievements..."
                            : "• Mô tả công việc chính và thành tích nổi bật..."
                        }
                        fontSize={typo.body}
                        lineHeight={lineHeight}
                        onChangeValue={nextVal => updateEntry({ description: nextVal })}
                      />

                      <div className="flex items-center justify-end gap-1 opacity-0 transition group-hover/entry:opacity-100 group-focus-within/entry:opacity-100">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveEntry(-1)}
                          className="cursor-pointer rounded border border-border-subtle bg-white px-1.5 py-0.5 text-[10px] text-ink-600 hover:bg-slate-100 disabled:opacity-35"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === arr.length - 1}
                          onClick={() => moveEntry(1)}
                          className="cursor-pointer rounded border border-border-subtle bg-white px-1.5 py-0.5 text-[10px] text-ink-600 hover:bg-slate-100 disabled:opacity-35"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={removeEntry}
                          className="cursor-pointer rounded border border-rose-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-rose-700 hover:bg-rose-50"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </>
          ) : (
            doc[section as Section].filter(hasContent).map(entry => {
              const period = formatDates(entry, doc.language);
              return (
                <div
                  key={entry.id}
                  className={`space-y-0.5 ${isTimeline ? "border-l-2 border-slate-200 pl-3" : ""}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    {entry.title.trim() && (
                      <div style={{ fontSize: typo.title }} className="font-bold text-ink-900">
                        {entry.title.trim()}
                      </div>
                    )}
                    {period && (
                      <div style={{ fontSize: typo.meta }} className="font-medium text-ink-500">
                        {period}
                      </div>
                    )}
                  </div>
                  {entry.subtitle.trim() && (
                    <div style={{ fontSize: typo.subtitle }} className="font-medium text-ink-600">
                      {entry.subtitle.trim()}
                    </div>
                  )}
                  {entry.description.trim() && (
                    <RichHtmlText text={entry.description.trim()} fontSize={typo.body} lineHeight={lineHeight} />
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}

export function CvLivePreview({
  doc,
  editable = false,
  disabled = false,
  onChangeDoc,
  onReorderSection,
  onMoveSection,
  onUploadAvatar,
  onRemoveAvatar,
  onRequestSuggestion,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const interactive = Boolean(editable || onReorderSection || onMoveSection);
  const accent = doc.accentColor;
  const fullName = doc.fullName.trim() || "Họ và tên ứng viên";
  const hiddenSet = new Set(doc.hiddenSections);
  const visibleSections = doc.sectionOrder.filter(section => !hiddenSet.has(section));
  const hasAnyBody = visibleSections.some(section => hasSectionContent(doc, section));
  const typo = FONT_SIZE_CSS[doc.fontSize];

  const handleReorder = (fromIndex: number, toIndex: number) => {
    if (onReorderSection) {
      onReorderSection(fromIndex, toIndex);
    } else if (onChangeDoc) {
      onChangeDoc({ ...doc, sectionOrder: reorderSectionOrder(doc.sectionOrder, fromIndex, toIndex) });
    }
  };

  const handleMoveVisible = (visibleIdx: number, direction: -1 | 1) => {
    const targetVisibleIdx = visibleIdx + direction;
    if (visibleIdx < 0 || targetVisibleIdx < 0 || targetVisibleIdx >= visibleSections.length) return;
    const fromFull = doc.sectionOrder.indexOf(visibleSections[visibleIdx]);
    const toFull = doc.sectionOrder.indexOf(visibleSections[targetVisibleIdx]);
    if (onMoveSection && fromFull >= 0 && Math.abs(fromFull - toFull) === 1) {
      onMoveSection(fromFull, fromFull < toFull ? 1 : -1);
    } else if (fromFull >= 0 && toFull >= 0) {
      handleReorder(fromFull, toFull);
    }
  };

  const makeDragStart = (fullIndex: number) => (event: DragEvent<HTMLElement>) => {
    setDragIndex(fullIndex);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(fullIndex));
  };

  const makeDragOver = (fullIndex: number) => (event: DragEvent<HTMLElement>) => {
    if (dragIndex === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dropIndex !== fullIndex) setDropIndex(fullIndex);
  };

  const makeDrop = (fullIndex: number) => (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const raw = event.dataTransfer.getData("text/plain");
    const from = dragIndex ?? (raw !== "" ? Number(raw) : -1);
    if (from >= 0 && from !== fullIndex) {
      handleReorder(from, fullIndex);
    }
    setDragIndex(null);
    setDropIndex(null);
  };

  const clearDrag = () => {
    setDragIndex(null);
    setDropIndex(null);
  };

  const renderSection = (section: BodySection, opts: { minimal?: boolean; sidebar?: boolean } = {}) => {
    const fullIndex = doc.sectionOrder.indexOf(section);
    const visibleIndex = visibleSections.indexOf(section);
    return (
      <SectionBlock
        key={section}
        section={section}
        doc={doc}
        accent={accent}
        minimal={opts.minimal}
        sidebar={opts.sidebar}
        editable={editable}
        interactive={interactive}
        orderIndex={visibleIndex}
        totalSections={visibleSections.length}
        isDragged={dragIndex === fullIndex}
        isDropTarget={dropIndex === fullIndex && dragIndex !== fullIndex}
        onChangeDoc={onChangeDoc}
        onDragStart={() => makeDragStart(fullIndex)}
        onDragOver={() => makeDragOver(fullIndex)}
        onDrop={() => makeDrop(fullIndex)}
        onDragEnd={clearDrag}
        onMoveSection={handleMoveVisible}
        onRequestSuggestion={onRequestSuggestion}
      />
    );
  };

  const renderContactFields = (iconColor: string, textClass: string, stacked = true) => {
    if (editable && onChangeDoc) {
      return (
        <div className={stacked ? "space-y-1.5" : "grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2"}>
          <label className="flex items-center gap-1.5">
            <ContactGlyph kind="email" color={iconColor} />
            <input
              type="email"
              aria-label="Email liên hệ"
              maxLength={scalarLimits.email}
              value={doc.email}
              placeholder="email@example.com"
              onChange={e => onChangeDoc({ ...doc, email: e.target.value })}
              style={{ fontSize: typo.meta }}
              className={`${inlineFieldBase} ${textClass} placeholder:text-ink-400`}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <ContactGlyph kind="phone" color={iconColor} />
            <input
              type="text"
              aria-label="Số điện thoại"
              maxLength={scalarLimits.phone}
              value={doc.phone}
              placeholder="09xx xxx xxx"
              onChange={e => onChangeDoc({ ...doc, phone: e.target.value })}
              style={{ fontSize: typo.meta }}
              className={`${inlineFieldBase} ${textClass} placeholder:text-ink-400`}
            />
          </label>
          <label className="flex items-center gap-1.5">
            <ContactGlyph kind="location" color={iconColor} />
            <input
              type="text"
              aria-label="Địa điểm"
              maxLength={scalarLimits.location}
              value={doc.location}
              placeholder={doc.language === "en" ? "City, Country" : "Quận/Huyện, Tỉnh/Thành phố"}
              onChange={e => onChangeDoc({ ...doc, location: e.target.value })}
              style={{ fontSize: typo.meta }}
              className={`${inlineFieldBase} ${textClass} placeholder:text-ink-400`}
            />
          </label>
          <label className="flex items-start gap-1.5">
            <ContactGlyph kind="link" color={iconColor} />
            <input
              type="text"
              aria-label="Liên kết cá nhân"
              maxLength={scalarLimits.links}
              value={doc.links}
              placeholder="github.com/... · linkedin.com/in/..."
              onChange={e => onChangeDoc({ ...doc, links: e.target.value })}
              style={{ fontSize: typo.meta }}
              className={`${inlineFieldBase} ${textClass} placeholder:text-ink-400`}
            />
          </label>
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            <input
              type="text"
              aria-label="Ngày sinh"
              maxLength={optionalScalarLimits.dateOfBirth}
              value={doc.dateOfBirth}
              placeholder={doc.language === "en" ? "DOB (optional)" : "Ngày sinh (DD/MM/YYYY)"}
              onChange={e => onChangeDoc({ ...doc, dateOfBirth: e.target.value })}
              style={{ fontSize: typo.meta }}
              className={`${inlineFieldBase} ${textClass} placeholder:text-ink-400`}
            />
            <input
              type="text"
              aria-label="Giới tính"
              maxLength={optionalScalarLimits.gender}
              value={doc.gender}
              placeholder={doc.language === "en" ? "Gender (optional)" : "Giới tính"}
              onChange={e => onChangeDoc({ ...doc, gender: e.target.value })}
              style={{ fontSize: typo.meta }}
              className={`${inlineFieldBase} ${textClass} placeholder:text-ink-400`}
            />
          </div>
        </div>
      );
    }

    const items: { kind: "email" | "phone" | "location" | "link"; value: string }[] = [];
    if (doc.email.trim()) items.push({ kind: "email", value: doc.email.trim() });
    if (doc.phone.trim()) items.push({ kind: "phone", value: doc.phone.trim() });
    if (doc.location.trim()) items.push({ kind: "location", value: doc.location.trim() });
    if (doc.links.trim()) items.push({ kind: "link", value: doc.links.trim() });
    const personal = [doc.dateOfBirth.trim(), doc.gender.trim()].filter(Boolean).join(" · ");
    if (items.length === 0 && !personal) return null;

    return (
      <div className={stacked ? "space-y-1.5" : "flex flex-wrap gap-x-4 gap-y-1"}>
        {items.map((item, i) => (
          <div key={i} style={{ fontSize: typo.meta }} className={`flex items-start gap-1.5 break-words ${textClass}`}>
            <ContactGlyph kind={item.kind} color={iconColor} />
            <span className="whitespace-pre-line">{item.value}</span>
          </div>
        ))}
        {personal && (
          <div style={{ fontSize: typo.meta }} className={`${textClass}`}>
            {personal}
          </div>
        )}
      </div>
    );
  };

  const renderIdentityHeader = (inverted = false, centered = false) => (
    <div className={`min-w-0 flex-1 ${centered ? "text-center" : ""}`}>
      {editable && onChangeDoc ? (
        <>
          <input
            type="text"
            aria-label="Họ và tên"
            maxLength={scalarLimits.fullName}
            value={doc.fullName}
            placeholder={doc.language === "en" ? "YOUR FULL NAME" : "HỌ VÀ TÊN ỨNG VIÊN"}
            onChange={e => onChangeDoc({ ...doc, fullName: e.target.value })}
            className={`${inlineFieldBase} text-xl font-bold leading-snug ${
              centered ? "text-center" : ""
            } ${inverted ? "text-white placeholder:text-white/75" : "text-ink-900 placeholder:text-ink-400"}`}
          />
          <input
            type="text"
            aria-label="Vị trí / tiêu đề nghề nghiệp"
            maxLength={scalarLimits.headline}
            value={doc.headline}
            placeholder={doc.language === "en" ? "Target Position / Job Title" : "Vị trí ứng tuyển / Chức danh"}
            onChange={e => onChangeDoc({ ...doc, headline: e.target.value })}
            style={inverted ? undefined : { color: doc.templateId === "minimal" ? "#475569" : accent }}
            className={`${inlineFieldBase} mt-1 text-xs font-semibold ${
              centered ? "text-center" : ""
            } ${inverted ? "text-white/95 placeholder:text-white/70" : "placeholder:text-ink-400"}`}
          />
        </>
      ) : (
        <>
          <h3 className={`m-0 text-xl font-bold leading-snug ${inverted ? "text-white" : "text-ink-900"}`}>{fullName}</h3>
          {doc.headline.trim() && (
            <p
              style={inverted ? undefined : { color: doc.templateId === "minimal" ? "#475569" : accent }}
              className={`m-0 mt-1 text-xs font-semibold ${inverted ? "text-white/95" : ""}`}
            >
              {doc.headline.trim()}
            </p>
          )}
        </>
      )}
    </div>
  );

  const wrapEditable = (node: ReactNode) =>
    editable ? (
      <fieldset disabled={disabled} className="m-0 min-w-0 border-0 p-0">
        {node}
      </fieldset>
    ) : (
      <>{node}</>
    );

  const paperFont = { fontFamily: FONT_FAMILY_CSS[doc.fontFamily] };

  if (doc.templateId === "executive") {
    const sidebarSet = new Set<BodySection>(["skills", "languages", "certificates", "hobbies"]);
    const sidebarSections = visibleSections.filter(section => sidebarSet.has(section));
    const mainSections = visibleSections.filter(section => !sidebarSet.has(section));
    return wrapEditable(
      <article
        aria-label="Bản xem nhanh CV Executive"
        style={paperFont}
        className="overflow-hidden rounded-lg border border-border-subtle bg-white shadow-sm"
      >
        <header
          style={{ backgroundColor: accent }}
          className="flex flex-wrap items-center gap-4 px-6 py-5 text-white"
        >
          <AvatarSlot
            photoDataUrl={doc.photoDataUrl}
            accent="#ffffff"
            round
            inverted
            editable={editable}
            onUploadAvatar={onUploadAvatar}
            onRemoveAvatar={onRemoveAvatar}
          />
          {renderIdentityHeader(true)}
        </header>
        <div className="grid min-h-[540px] grid-cols-1 sm:grid-cols-3">
          <aside className="space-y-4 border-b border-border-subtle bg-slate-50/90 p-5 sm:border-r sm:border-b-0">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1">
                <span className="inline-block h-3.5 w-1 rounded-full" style={{ backgroundColor: accent }} />
                <h4 style={{ color: accent, fontSize: typo.heading }} className="m-0 font-bold">
                  {doc.language === "en" ? "Contact" : "Liên hệ"}
                </h4>
              </div>
              {renderContactFields(accent, "text-ink-700", true)}
            </div>
            {sidebarSections.map(section => renderSection(section, { sidebar: true }))}
          </aside>
          <div className="space-y-4 p-6 sm:col-span-2">
            {editable || hasAnyBody ? (
              mainSections.map(section => renderSection(section))
            ) : (
              <p className="m-0 text-xs text-ink-400">Nhập giới thiệu, kinh nghiệm hoặc dự án để xem bố cục cột chính…</p>
            )}
          </div>
        </div>
      </article>,
    );
  }

  if (doc.templateId === "modern") {
    const sidebarSet = new Set<BodySection>(["skills", "languages", "certificates", "hobbies"]);
    const sidebarSections = visibleSections.filter(section => sidebarSet.has(section));
    const mainSections = visibleSections.filter(section => !sidebarSet.has(section));
    return wrapEditable(
      <article
        aria-label="Bản xem nhanh CV Modern"
        style={paperFont}
        className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-lg border border-border-subtle bg-white shadow-sm sm:grid-cols-3"
      >
        <aside
          style={{ borderTopColor: accent }}
          className="space-y-4 border-t-4 border-b border-border-subtle bg-slate-50 p-4 sm:border-r sm:border-b-0"
        >
          <div className="flex flex-col items-center gap-2.5 text-center">
            <AvatarSlot
              photoDataUrl={doc.photoDataUrl}
              accent={accent}
              round
              editable={editable}
              onUploadAvatar={onUploadAvatar}
              onRemoveAvatar={onRemoveAvatar}
            />
            {renderIdentityHeader(false, true)}
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 border-b border-slate-200 pb-1">
              <span className="inline-block h-3.5 w-1 rounded-full" style={{ backgroundColor: accent }} />
              <h4 style={{ color: accent, fontSize: typo.heading }} className="m-0 font-bold">
                {doc.language === "en" ? "Contact" : "Liên hệ"}
              </h4>
            </div>
            {renderContactFields(accent, "text-ink-700", true)}
          </div>
          {sidebarSections.map(section => renderSection(section, { sidebar: true }))}
        </aside>
        <div className="space-y-4 p-5 sm:col-span-2">
          {editable || hasAnyBody ? (
            mainSections.map(section => renderSection(section))
          ) : (
            <p className="m-0 text-xs text-ink-400">Nhập giới thiệu, kinh nghiệm hoặc dự án để xem bố cục cột chính…</p>
          )}
        </div>
      </article>,
    );
  }

  const minimal = doc.templateId === "minimal";
  return wrapEditable(
    <article
      aria-label={`Bản xem nhanh CV ${minimal ? "Minimal" : "Classic"}`}
      style={paperFont}
      className="min-h-[560px] space-y-4 rounded-lg border border-border-subtle bg-white p-6 shadow-sm"
    >
      <header
        style={minimal ? { borderLeftColor: accent } : { borderBottomColor: accent }}
        className={`flex flex-wrap items-center justify-between gap-4 ${
          minimal ? "border-l-4 pl-3.5" : "border-b-2 pb-3.5"
        }`}
      >
        <div className="min-w-0 flex-1 space-y-2">
          {renderIdentityHeader(false)}
          {renderContactFields(accent, "text-ink-600", false)}
        </div>
        <AvatarSlot
          photoDataUrl={doc.photoDataUrl}
          accent={accent}
          round={minimal}
          editable={editable}
          onUploadAvatar={onUploadAvatar}
          onRemoveAvatar={onRemoveAvatar}
        />
      </header>
      <div className="space-y-4">
        {editable || hasAnyBody ? (
          visibleSections.map(section => renderSection(section, { minimal }))
        ) : (
          <p className="m-0 text-xs text-ink-400">Nội dung bạn nhập sẽ hiển thị trực tiếp tại đây…</p>
        )}
      </div>
    </article>,
  );
}
