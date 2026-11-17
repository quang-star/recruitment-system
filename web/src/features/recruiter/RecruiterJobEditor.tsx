import { FormEvent } from "react";
import { ExternalAiConsent } from "../../shared/components/ExternalAiConsent";
import { SparklesIcon } from "../../shared/components/Icon";
import { AuthSession } from "../../shared/auth/session";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";
import { CareerCategorySuggestions } from "./CareerCategorySuggestions";
import { CategoryChoice, JobCategoryFields } from "./JobCategoryFields";
import { Job, JobForm } from "./recruiterJobTypes";

type Props = {
  form: JobForm;
  selectedJob: Job | null;
  selectedJobId: string | null;
  companyId: string;
  session: AuthSession;
  canRecruit: boolean;
  canPublish: boolean;
  saving: boolean;
  message: string | null;
  error: string | null;
  onUpdateForm: <K extends keyof JobForm>(key: K, value: JobForm[K]) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChangeState: (job: Job, action: "publish" | "close") => void;
  onSuggestionApplied: (category: CategoryChoice) => void;
};

const fieldClass =
  "mt-1 h-10 w-full rounded-xl border border-border-strong bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-ink-500";
const textareaClass =
  "mt-1 w-full rounded-xl border border-border-strong bg-white p-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-ink-500 leading-relaxed";
const labelClass = "block text-xs font-semibold text-ink-700";

export function RecruiterJobEditor({
  form,
  selectedJob,
  selectedJobId,
  companyId,
  session,
  canRecruit,
  canPublish,
  saving,
  message,
  error,
  onUpdateForm,
  onSubmit,
  onChangeState,
  onSuggestionApplied
}: Props) {
  return (
    <Card padding="lg">
      <form className="space-y-6" onSubmit={onSubmit}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">
              {selectedJobId ? "Job Editor" : "New Job"}
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

        <fieldset className="border-0 p-0 m-0 min-w-0 space-y-6" disabled={!canRecruit}>
          <section className="rounded-2xl border border-border-subtle bg-slate-50/50 p-5 space-y-4">
            <h4 className="text-sm font-bold text-ink-900 m-0">1. Thông tin chung</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

              <label className={labelClass + " sm:col-span-2"}>
                Địa điểm
                <input
                  className={fieldClass}
                  maxLength={300}
                  placeholder="Ví dụ: Tòa FPT Tower, Cầu Giấy, Hà Nội"
                  value={form.locationText}
                  onChange={(e) => onUpdateForm("locationText", e.target.value)}
                />
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

              <label className={labelClass}>
                Hình thức
                <select
                  className={fieldClass}
                  value={form.workMode}
                  onChange={(e) => onUpdateForm("workMode", e.target.value)}
                >
                  <option value="">Chọn</option>
                  <option>ONSITE</option>
                  <option>HYBRID</option>
                  <option>REMOTE</option>
                </select>
              </label>

              <label className={labelClass}>
                Loại hợp đồng
                <select
                  className={fieldClass}
                  value={form.employmentType}
                  onChange={(e) => onUpdateForm("employmentType", e.target.value)}
                >
                  <option>FULL_TIME</option>
                  <option>PART_TIME</option>
                  <option>CONTRACT</option>
                  <option>INTERNSHIP</option>
                </select>
              </label>

              <label className={labelClass}>
                Cấp độ
                <input
                  className={fieldClass}
                  maxLength={30}
                  placeholder="Senior, Lead, Mid..."
                  value={form.seniorityLevel}
                  onChange={(e) => onUpdateForm("seniorityLevel", e.target.value)}
                />
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

              <label className={labelClass + " sm:col-span-2 lg:col-span-3"}>
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

          <section className="rounded-2xl border border-border-subtle bg-slate-50/50 p-5 space-y-4">
            <h4 className="text-sm font-bold text-ink-900 m-0">2. Bản mô tả &amp; Tiêu chuẩn ứng viên</h4>
            <div className="space-y-4">
              <label className={labelClass}>
                Mô tả công việc
                <textarea
                  className={textareaClass}
                  required
                  rows={5}
                  placeholder="Mô tả trách nhiệm công việc chính, dự án tham gia..."
                  value={form.description}
                  onChange={(e) => onUpdateForm("description", e.target.value)}
                />
              </label>

              <label className={labelClass}>
                Yêu cầu
                <textarea
                  className={textareaClass}
                  required
                  rows={5}
                  placeholder="Kỹ năng kỹ thuật, số năm kinh nghiệm, bằng cấp liên quan..."
                  value={form.requirementsText}
                  onChange={(e) => onUpdateForm("requirementsText", e.target.value)}
                />
              </label>

              <label className={labelClass}>
                Quyền lợi
                <textarea
                  className={textareaClass}
                  rows={3}
                  placeholder="Chế độ đãi ngộ, bảo hiểm, thưởng, laptop..."
                  value={form.benefitsText}
                  onChange={(e) => onUpdateForm("benefitsText", e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-border-subtle bg-slate-50/50 p-5 space-y-4">
            <h4 className="text-sm font-bold text-ink-900 m-0">3. Mức lương &amp; Đãi ngộ</h4>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className={labelClass}>
                Lương tối thiểu
                <input
                  className={fieldClass}
                  type="number"
                  min={0}
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
                  placeholder="45000000"
                  value={form.salaryMax}
                  onChange={(e) => onUpdateForm("salaryMax", e.target.value)}
                />
              </label>

              <label className={labelClass}>
                Tiền tệ
                <input
                  className={fieldClass}
                  maxLength={3}
                  value={form.salaryCurrency}
                  onChange={(e) => onUpdateForm("salaryCurrency", e.target.value.toUpperCase())}
                />
              </label>

              <label className={labelClass}>
                Kỳ lương
                <select
                  className={fieldClass}
                  value={form.salaryPeriod}
                  onChange={(e) => onUpdateForm("salaryPeriod", e.target.value)}
                >
                  <option>HOUR</option>
                  <option>MONTH</option>
                  <option>YEAR</option>
                </select>
              </label>
            </div>
          </section>

          {message && <ErrorBanner tone="success" message={message} />}
          {error && <ErrorBanner tone="error" message={error} />}

          <section className="rounded-2xl border border-brand-200/80 bg-white p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-white">
                <SparklesIcon size={14} />
              </span>
              <h4 className="text-sm font-bold text-ink-900 m-0">4. Ngành nghề &amp; Hỗ trợ sàng lọc tự động</h4>
            </div>

            <JobCategoryFields value={form.category} onChange={(value) => onUpdateForm("category", value)} />

            {selectedJob?.matchingSupported === false && (
              <p role="status" className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 m-0">
                Tin này không áp dụng chấm điểm AI; xem hồ sơ thủ công.
              </p>
            )}

            <div className="rounded-xl border border-border-subtle bg-slate-50/70 p-3.5">
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
              disabled={!canRecruit || saving || (!!selectedJob && selectedJob.status !== "DRAFT")}
              onApply={onSuggestionApplied}
            />
          </section>

          <div className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle pt-4">
            <Button type="submit" variant="primary" size="md" disabled={saving} loading={saving}>
              {saving ? "Đang lưu…" : selectedJobId ? "Lưu JD" : "Tạo bản nháp"}
            </Button>

            {selectedJobId && selectedJob?.status === "DRAFT" && (
              <Button variant="subtle" size="md" type="button" disabled={!canPublish || saving} onClick={() => onChangeState(selectedJob, "publish")}>
                Đăng JD
              </Button>
            )}

            {selectedJobId && selectedJob?.status === "PUBLISHED" && (
              <Button variant="danger" size="md" type="button" onClick={() => onChangeState(selectedJob, "close")}>
                Đóng JD
              </Button>
            )}
          </div>
        </fieldset>
      </form>
    </Card>
  );
}
