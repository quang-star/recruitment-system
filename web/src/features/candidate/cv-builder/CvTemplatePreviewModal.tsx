import { useEffect, useMemo, useRef, useState } from "react";
import { ApiClientError, apiRequest } from "../../../shared/api/client";
import type { AuthSession } from "../../../shared/auth/session";
import { Button, ErrorBanner, Modal } from "../../../shared/ui";
import type { CandidateCvRecord } from "../CandidateCvPanel";
import type { CandidateProfile } from "../CandidateProfilePage";
import type { ParsedCvReviewData } from "../ParsedCvReview";
import {
  ACCENT_PRESETS,
  createCvDocument,
  scalarLimits,
  type CvDocument,
  type CvDraftRecord,
  type TemplateId,
} from "./cvDocument";
import { CvImportLimitError, importParsedCv, prefillCvProfile } from "./cvImport";
import { CvLivePreview } from "./CvLivePreview";
import { cloneDraftToTemplate, createSampleCvDocument, CV_TEMPLATE_CATALOG } from "./cvTemplates";

type SourceOption = "sample" | "draft" | "existing" | "blank";

type Props = {
  open: boolean;
  templateId: TemplateId | null;
  initialAccentColor: string;
  session: AuthSession;
  cvs: CandidateCvRecord[];
  serverDrafts: CvDraftRecord[];
  onClose: () => void;
  onCreate: (doc: CvDocument) => void;
  onLogout?: () => void;
};

export function CvTemplatePreviewModal({
  open,
  templateId,
  initialAccentColor,
  session,
  cvs,
  serverDrafts,
  onClose,
  onCreate,
  onLogout,
}: Props) {
  const [accentColor, setAccentColor] = useState(initialAccentColor);
  const [source, setSource] = useState<SourceOption>("sample");
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [selectedExisting, setSelectedExisting] = useState("profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const importableCvs = useMemo(
    () => cvs.filter(cv => cv.status === "ACTIVE" && cv.activeVersion.processingStatus === "CONFIRMED"),
    [cvs],
  );

  const templateMeta = useMemo(
    () => CV_TEMPLATE_CATALOG.find(item => item.id === templateId) ?? CV_TEMPLATE_CATALOG[0],
    [templateId],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setAccentColor(initialAccentColor);
    setSource("sample");
    setSelectedDraftId(serverDrafts[0]?.draftId ?? "");
    setSelectedExisting("profile");
    setError(null);
    setBusy(false);
  }, [open, initialAccentColor, templateId, serverDrafts]);

  const sampleDoc = useMemo(
    () => createSampleCvDocument(templateId ?? "classic", accentColor),
    [templateId, accentColor],
  );

  if (!open || !templateId) return null;

  async function handleCreate() {
    if (!templateId || busy) return;
    setError(null);

    if (source === "blank") {
      const blank = createCvDocument();
      blank.templateId = templateId;
      blank.accentColor = accentColor;
      onCreate(blank);
      return;
    }

    if (source === "sample") {
      onCreate(createSampleCvDocument(templateId, accentColor));
      return;
    }

    if (source === "draft") {
      const chosen = serverDrafts.find(item => item.draftId === selectedDraftId);
      if (!chosen) {
        setError("Vui lòng chọn một bản nháp đã lưu.");
        return;
      }
      onCreate(cloneDraftToTemplate(chosen, templateId, accentColor));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);

    try {
      const baseDoc = createCvDocument();
      baseDoc.templateId = templateId;
      baseDoc.accentColor = accentColor;

      if (selectedExisting === "profile") {
        const profile = await apiRequest<CandidateProfile>("/api/v2/candidates/me", {
          accessToken: session.accessToken,
          signal: controller.signal,
        });
        if (!mountedRef.current || controller.signal.aborted) return;
        onCreate(prefillCvProfile(baseDoc, profile));
        return;
      }

      const cv = importableCvs.find(item => item.cvId === selectedExisting);
      if (!cv) {
        setError("Vui lòng chọn một CV đã xác nhận.");
        return;
      }
      const parsed = await apiRequest<ParsedCvReviewData>(`/api/v2/parsed-cvs/${cv.activeVersion.cvVersionId}`, {
        accessToken: session.accessToken,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      if (parsed.status !== "CONFIRMED" || parsed.cvVersionId !== cv.activeVersion.cvVersionId) {
        throw new Error("Source changed");
      }
      const imported = importParsedCv(baseDoc, parsed.payload);
      imported.title = cv.title.slice(0, scalarLimits.title);
      onCreate(imported);
    } catch (failure) {
      if (!mountedRef.current || controller.signal.aborted) return;
      if (failure instanceof ApiClientError && failure.status === 401) {
        onLogout?.();
      } else if (failure instanceof CvImportLimitError) {
        setError(failure.message);
      } else if (failure instanceof ApiClientError) {
        setError(failure.error.message);
      } else {
        setError("Không lấy được dữ liệu nguồn. Bạn có thể chọn tạo từ đầu hoặc thử lại.");
      }
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mẫu CV ${templateMeta.title}`}
      eyebrow={templateMeta.subtitle}
      description={templateMeta.description}
      size="full"
      closeDisabled={busy}
      closeLabel="Đóng xem trước mẫu CV"
    >
      <div className="grid min-w-0 gap-6 py-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-slate-50 px-3.5 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-ink-700">Thử màu nhấn:</span>
              {ACCENT_PRESETS.map(preset => {
                const selected = accentColor === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    aria-label={`Xem thử màu ${preset.label}`}
                    aria-pressed={selected}
                    onClick={() => setAccentColor(preset.id)}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs cursor-pointer ${
                      selected ? "border-ink-900 bg-white font-semibold shadow-2xs" : "border-border-subtle bg-white text-ink-600"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 rounded-full border border-black/10"
                      style={{ backgroundColor: preset.id }}
                    />
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1">
              {templateMeta.tags.map(tag => (
                <span key={tag} className="rounded bg-white px-2 py-0.5 text-[11px] font-medium text-ink-600 border border-border-subtle">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="max-h-[64vh] overflow-y-auto rounded-lg border border-border-subtle bg-slate-100 p-3">
            <CvLivePreview doc={sampleDoc} />
          </div>
        </div>

        <aside className="flex flex-col justify-between gap-4 rounded-lg border border-border-subtle bg-slate-50/70 p-4 lg:col-span-5">
          <div className="space-y-3">
            <h3 className="m-0 text-base font-bold text-brand-700">Bạn muốn tạo CV từ?</h3>
            {error && <ErrorBanner message={error} />}

            <div className="space-y-2.5" role="radiogroup" aria-label="Bạn muốn tạo CV từ?">
              <label
                className={`block rounded-lg border bg-white p-3.5 transition cursor-pointer ${
                  source === "sample" ? "border-brand-600 ring-1 ring-brand-600" : "border-border-subtle hover:border-border-strong"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="cv-template-source"
                    checked={source === "sample"}
                    onChange={() => setSource("sample")}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-semibold text-ink-900">Nội dung CV mẫu gợi ý</div>
                    <p className="m-0 mt-0.5 text-xs text-ink-500">
                      Điền sẵn nội dung gợi ý theo mẫu để bạn chỉnh sửa nhanh thành hồ sơ của mình.
                    </p>
                  </div>
                </div>
              </label>

              <div
                className={`rounded-lg border bg-white p-3.5 transition ${
                  source === "draft" ? "border-brand-600 ring-1 ring-brand-600" : "border-border-subtle hover:border-border-strong"
                }`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="cv-template-source"
                    checked={source === "draft"}
                    disabled={serverDrafts.length === 0}
                    onChange={() => setSource("draft")}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink-900">Nội dung CV đã tạo trước đó</div>
                    <p className="m-0 mt-0.5 text-xs text-ink-500">
                      {serverDrafts.length > 0
                        ? "Lấy nội dung từ bản nháp tự tạo để áp sang mẫu mới."
                        : "Bạn chưa có bản nháp tự tạo nào trên tài khoản."}
                    </p>
                  </div>
                </label>
                {source === "draft" && serverDrafts.length > 0 && (
                  <select
                    aria-label="Chọn bản nháp đã lưu"
                    value={selectedDraftId}
                    onChange={event => setSelectedDraftId(event.target.value)}
                    className="mt-2.5 w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-xs text-ink-900 focus:border-brand-600 focus:outline-none"
                  >
                    {serverDrafts.map(item => (
                      <option key={item.draftId} value={item.draftId}>
                        {item.title} (v{item.version + 1})
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div
                className={`rounded-lg border bg-white p-3.5 transition ${
                  source === "existing" ? "border-brand-600 ring-1 ring-brand-600" : "border-border-subtle hover:border-border-strong"
                }`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="radio"
                    name="cv-template-source"
                    checked={source === "existing"}
                    onChange={() => setSource("existing")}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-ink-900">Hồ sơ cá nhân hoặc CV đã phân tích</div>
                    <p className="m-0 mt-0.5 text-xs text-ink-500">
                      Lấy thông tin từ hồ sơ ứng viên hoặc một bản CV PDF đã xác nhận trong thư viện.
                    </p>
                  </div>
                </label>
                {source === "existing" && (
                  <select
                    aria-label="Chọn nguồn dữ liệu sẵn có"
                    value={selectedExisting}
                    onChange={event => setSelectedExisting(event.target.value)}
                    className="mt-2.5 w-full rounded-lg border border-border-strong bg-white px-3 py-2 text-xs text-ink-900 focus:border-brand-600 focus:outline-none"
                  >
                    <option value="profile">Hồ sơ cá nhân của tôi</option>
                    {importableCvs.map(cv => (
                      <option key={cv.cvId} value={cv.cvId}>
                        CV đã xác nhận: {cv.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <label
                className={`block rounded-lg border bg-white p-3.5 transition cursor-pointer ${
                  source === "blank" ? "border-brand-600 ring-1 ring-brand-600" : "border-border-subtle hover:border-border-strong"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    name="cv-template-source"
                    checked={source === "blank"}
                    onChange={() => setSource("blank")}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-semibold text-ink-900">Tạo CV từ đầu</div>
                    <p className="m-0 mt-0.5 text-xs text-ink-500">
                      Bắt đầu từ một khung CV trắng không có nội dung gợi ý.
                    </p>
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-3">
            <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
              Đóng
            </Button>
            <Button type="button" variant="primary" disabled={busy} onClick={() => void handleCreate()}>
              {busy ? "Đang chuẩn bị CV…" : "Tạo CV"}
            </Button>
          </div>
        </aside>
      </div>
    </Modal>
  );
}
