import { FormEvent } from "react";
import { ExternalAiConsent } from "../../shared/components/ExternalAiConsent";
import { LayersIcon } from "../../shared/components/Icon";
import { RichTextEditor } from "../../shared/components/RichTextEditor";
import { AuthSession } from "../../shared/auth/session";
import { VIETNAM_PROVINCES, normalizeProvinceName } from "../../shared/constants/provinces";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";
import { CareerCategorySuggestions } from "./CareerCategorySuggestions";
import { CategoryChoice, JobCategoryFields } from "./JobCategoryFields";
import { Job, JobForm } from "./recruiterJobTypes";

type EditorCompanyOption = {
  companyId: string;
  displayName: string;
};

type Props = {
  form: JobForm;
  selectedJob: Job | null;
  selectedJobId: string | null;
  companyId: string;
  companyName?: string | null;
  companies?: EditorCompanyOption[];
  onSelectDraftCompany?: (companyId: string) => void;
  session: AuthSession;
  canRecruit: boolean;
  canPublish: boolean;
  saving: boolean;
  message: string | null;
  error: string | null;
  onUpdateForm: <K extends keyof JobForm>(key: K, value: JobForm[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChangeState: (job: Job, action: "publish" | "close") => void;
  onDuplicate?: (job: Job) => void;
  onSuggestionApplied: (category: CategoryChoice) => void;
};

const fieldClass =
  "mt-1 h-10 w-full rounded-md border border-border-strong bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-ink-500";
const labelClass = "block text-xs font-semibold text-ink-700";

const SENIORITY_OPTIONS = [
  { value: "INTERN", label: "Thực tập (Intern)" },
  { value: "FRESHER", label: "Fresher" },
  { value: "JUNIOR", label: "Junior" },
  { value: "MIDDLE", label: "Chuyên viên (Middle)" },
  { value: "SENIOR", label: "Senior" },
  { value: "LEAD", label: "Trưởng nhóm (Lead)" },
  { value: "MANAGER", label: "Quản lý (Manager)" }
];

export function RecruiterJobEditor({
  form,
  selectedJob,
  selectedJobId,
  companyId,
  companyName = null,
  companies = [],
  onSelectDraftCompany,
  session,
  canRecruit,
  canPublish,
  saving,
  message,
  error,
  onUpdateForm,
  onSubmit,
  onChangeState,
  onDuplicate,
  onSuggestionApplied
}: Props) {
  const lockedNonDraft = Boolean(selectedJob && selectedJob.status !== "DRAFT");
  const fieldsDisabled = !canRecruit || lockedNonDraft;
  const knownSeniority = !form.seniorityLevel || SENIORITY_OPTIONS.some((item) => item.value === form.seniorityLevel);
  const normalizedProvince = normalizeProvinceName(form.province);
  const knownProvince = !normalizedProvince || VIETNAM_PROVINCES.some((item) => item === normalizedProvince);

  return (
    <Card padding="lg">
      <form className="space-y-6" onSubmit={onSubmit}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">
              {selectedJobId ? "Biên tập tin tuyển dụng" : "Tạo tin mới"}
            </p>
            <h3 className="text-lg font-bold text-ink-900 m-0 mt-0.5">
              {selectedJobId ? "Biên tập tin tuyển dụng" : "Tạo tin tuyển dụng mới"}
            </h3>
          </div>
          {selectedJobId ? (
            <Badge tone="brand">Phiên bản v{selectedJob?.jobVersionNumber}</Badge>
          ) : (
            <Badge tone="warning">Bản nháp mới</Badge>
          )}
        </div>

        {lockedNonDraft && (
          <ErrorBanner
            tone="info"
            message={
              selectedJob?.status === "PUBLISHED"
                ? "Tin đang đăng chỉ xem ở chế độ chỉ đọc để bảo toàn dữ liệu cho hồ sơ đã nộp."
                : "Tin đã đóng chỉ xem ở chế độ chỉ đọc."
            }
          />
        )}

        {message && <ErrorBanner tone="success" message={message} />}
        {error && <ErrorBanner tone="error" message={error} />}

        <fieldset className="border-0 p-0 m-0 min-w-0 space-y-6" disabled={fieldsDisabled}>
          <section className="rounded-lg border border-border-subtle bg-slate-50/50 p-5 space-y-4">
            <h4 className="text-sm font-bold text-ink-900 m-0">1. Thông tin chung</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(companies.length > 0 || companyName) && (
                <label className={labelClass + " sm:col-span-2 lg:col-span-4"}>
                  Công ty
                  {!selectedJobId && companies.length > 1 && onSelectDraftCompany ? (
                    <select
                      className={fieldClass}
                      value={companyId}
                      onChange={(e) => onSelectDraftCompany(e.target.value)}
                    >
                      {companies.map((company) => (
                        <option key={company.companyId} value={company.companyId}>
                          {company.displayName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={fieldClass}
                      type="text"
                      readOnly
                      disabled
                      value={
                        companies.find((company) => company.companyId === companyId)?.displayName ??
                        companyName ??
                        ""
                      }
                    />
                  )}
                </label>
              )}

              <label className={labelClass + " sm:col-span-2"}>
                Tiêu đề
                <input
                  className={fieldClass}
                  required
                  maxLength={240}
                  placeholder="Ví dụ: Senior Backend Java Engineer"
                  value={form.title}
                  onChange={(e) => onUpdateForm("title", e.target.value)}
                />
              </label>

              <label className={labelClass}>
                Tỉnh / Thành phố
                <select
                  className={fieldClass}
                  value={normalizedProvince}
                  onChange={(e) => onUpdateForm("province", e.target.value)}
                >
                  <option value="">Chọn tỉnh / thành phố</option>
                  {!knownProvince && (
                    <option value={normalizedProvince}>{normalizedProvince}</option>
                  )}
                  {VIETNAM_PROVINCES.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass}>
                Quốc gia
                <input
                  className={fieldClass}
                  pattern="[A-Z]{2}"
                  maxLength={2}
                  value={form.countryCode}
                  onChange={(e) => onUpdateForm("countryCode", e.target.value.toUpperCase())}
                />
              </label>

              <label className={labelClass + " sm:col-span-2"}>
                Địa chỉ cụ thể
                <input
                  className={fieldClass}
                  maxLength={300}
                  placeholder="Ví dụ: Tòa FPT Tower, Cầu Giấy"
                  value={form.locationText}
                  onChange={(e) => onUpdateForm("locationText", e.target.value)}
                />
              </label>

              <label className={labelClass}>
                Hình thức
                <select
                  className={fieldClass}
                  value={form.workMode}
                  onChange={(e) => onUpdateForm("workMode", e.target.value)}
                >
                  <option value="">Chọn hình thức</option>
                  <option value="ONSITE">Tại văn phòng</option>
                  <option value="HYBRID">Hybrid (Linh hoạt)</option>
                  <option value="REMOTE">Từ xa (Remote)</option>
                </select>
              </label>

              <label className={labelClass}>
                Loại hợp đồng
                <select
                  className={fieldClass}
                  value={form.employmentType}
                  onChange={(e) => onUpdateForm("employmentType", e.target.value)}
                >
                  <option value="FULL_TIME">Toàn thời gian</option>
                  <option value="PART_TIME">Bán thời gian</option>
                  <option value="CONTRACT">Hợp đồng</option>
                  <option value="INTERNSHIP">Thực tập</option>
                </select>
              </label>

              <label className={labelClass}>
                Cấp độ
                <select
                  className={fieldClass}
                  value={form.seniorityLevel}
                  onChange={(e) => onUpdateForm("seniorityLevel", e.target.value)}
                >
                  <option value="">Không yêu cầu cụ thể</option>
                  {!knownSeniority && (
                    <option value={form.seniorityLevel}>{form.seniorityLevel}</option>
                  )}
                  {SENIORITY_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={labelClass}>
                Số vị trí
                <input
                  className={fieldClass}
                  type="number"
                  min={1}
                  required
                  value={form.openings}
                  onChange={(e) => onUpdateForm("openings", Number(e.target.value))}
                />
              </label>

              <label className={labelClass + " sm:col-span-2 lg:col-span-2"}>
                Hạn nhận hồ sơ
                <input
                  className={fieldClass}
                  type="datetime-local"
                  value={form.applicationDeadline}
                  onChange={(e) => onUpdateForm("applicationDeadline", e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-border-subtle bg-slate-50/50 p-5 space-y-4">
            <h4 className="text-sm font-bold text-ink-900 m-0">2. Bản mô tả &amp; Tiêu chuẩn ứng viên</h4>
            <div className="space-y-4">
              <div className={labelClass}>
                <span>Mô tả công việc</span>
                <RichTextEditor
                  label="Mô tả công việc"
                  disabled={fieldsDisabled}
                  placeholder="Mô tả trách nhiệm công việc chính, dự án tham gia..."
                  value={form.description}
                  onChange={(html) => onUpdateForm("description", html)}
                />
              </div>

              <div className={labelClass}>
                <span>Yêu cầu</span>
                <RichTextEditor
                  label="Yêu cầu"
                  disabled={fieldsDisabled}
                  placeholder="Kỹ năng kỹ thuật, số năm kinh nghiệm, bằng cấp liên quan..."
                  value={form.requirementsText}
                  onChange={(html) => onUpdateForm("requirementsText", html)}
                />
              </div>

              <div className={labelClass}>
                <span>Quyền lợi</span>
                <RichTextEditor
                  label="Quyền lợi"
                  disabled={fieldsDisabled}
                  minHeightClass="min-h-[96px]"
                  placeholder="Chế độ đãi ngộ, bảo hiểm, thưởng, laptop..."
                  value={form.benefitsText}
                  onChange={(html) => onUpdateForm("benefitsText", html)}
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-border-subtle bg-slate-50/50 p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-ink-900 m-0">3. Mức lương &amp; Đãi ngộ</h4>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.salaryNegotiable}
                  onChange={(e) => onUpdateForm("salaryNegotiable", e.target.checked)}
                  className="h-4 w-4 rounded border-border-strong text-brand-600 focus:ring-brand-500"
                />
                <span>Lương thỏa thuận</span>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className={labelClass}>
                Lương tối thiểu
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  disabled={form.salaryNegotiable}
                  placeholder="25000000"
                  value={form.salaryMin}
                  onChange={(e) => onUpdateForm("salaryMin", e.target.value)}
                />
              </label>

              <label className={labelClass}>
                Lương tối đa
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
                  disabled={form.salaryNegotiable}
                  placeholder="45000000"
                  value={form.salaryMax}
                  onChange={(e) => onUpdateForm("salaryMax", e.target.value)}
                />
              </label>

              <label className={labelClass}>
                Tiền tệ
                <select
                  className={fieldClass}
                  disabled={form.salaryNegotiable}
                  value={form.salaryCurrency}
                  onChange={(e) => onUpdateForm("salaryCurrency", e.target.value)}
                >
                  <option value="VND">VND</option>
                  <option value="USD">USD</option>
                </select>
              </label>

              <label className={labelClass}>
                Kỳ lương
                <select
                  className={fieldClass}
                  disabled={form.salaryNegotiable}
                  value={form.salaryPeriod}
                  onChange={(e) => onUpdateForm("salaryPeriod", e.target.value)}
                >
                  <option value="MONTH">Hàng tháng</option>
                  <option value="YEAR">Hàng năm</option>
                  <option value="HOUR">Theo giờ</option>
                </select>
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-brand-200/80 bg-white p-5 space-y-4">
            <div className="flex items-center gap-2">
              <LayersIcon size={16} className="text-brand-700 shrink-0" aria-hidden="true" />
              <h4 className="text-sm font-bold text-ink-900 m-0">4. Ngành nghề &amp; Hỗ trợ sàng lọc tự động</h4>
            </div>

            <JobCategoryFields value={form.category} onChange={(value) => onUpdateForm("category", value)} />

            {selectedJob?.matchingSupported === false && (
              <p role="status" className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 m-0">
                Tin này không áp dụng chấm điểm AI; xem hồ sơ thủ công.
              </p>
            )}

            <div className="rounded-lg border border-border-subtle bg-slate-50/70 p-3.5">
              <ExternalAiConsent
                checked={form.externalAiConsent}
                disabled={saving}
                onChange={(value) => onUpdateForm("externalAiConsent", value)}
              />
            </div>

            <CareerCategorySuggestions
              draft={form}
              userId={session.userId}
              companyId={companyId}
              jobId={selectedJobId}
              jobVersionId={selectedJob?.jobVersionId ?? null}
              accessToken={session.accessToken}
              disabled={fieldsDisabled || saving}
              onApply={onSuggestionApplied}
            />
          </section>

          {!lockedNonDraft && (
            <div className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle pt-4">
              <Button type="submit" variant="primary" size="md" disabled={saving} loading={saving}>
                {saving ? "Đang lưu…" : selectedJobId ? "Lưu JD" : "Tạo bản nháp"}
              </Button>

              {selectedJobId && selectedJob?.status === "DRAFT" && (
                <Button variant="subtle" size="md" type="button" disabled={!canPublish || saving} onClick={() => onChangeState(selectedJob, "publish")}>
                  Đăng JD
                </Button>
              )}
            </div>
          )}
        </fieldset>

        {canRecruit && selectedJobId && selectedJob && ((lockedNonDraft && Boolean(onDuplicate)) || selectedJob.status === "PUBLISHED") && (
          <div className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle pt-4">
            {lockedNonDraft && onDuplicate && (
              <Button variant="secondary" size="md" type="button" disabled={saving} onClick={() => onDuplicate(selectedJob)}>
                Nhân bản thành bản nháp
              </Button>
            )}
            {selectedJob.status === "PUBLISHED" && (
              <Button variant="danger" size="md" type="button" disabled={saving} onClick={() => onChangeState(selectedJob, "close")}>
                Đóng JD
              </Button>
            )}
          </div>
        )}
      </form>
    </Card>
  );
}
