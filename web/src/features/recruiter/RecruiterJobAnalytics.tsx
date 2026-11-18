import { useEffect, useState } from "react";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { BarChartIcon, ClockIcon, StarIcon, UsersIcon } from "../../shared/components/Icon";
import { Button, Card, ErrorBanner, Skeleton, cn } from "../../shared/ui";

type Props = {
  jobId: string;
  jobTitle: string;
  openings: number;
  accessToken: string;
  onOpenPipeline: () => void;
};

type JobAnalyticsResponse = {
  total: number;
  pending: number;
  currentSubmitted: number;
  currentUnderReview: number;
  reachedUnderReview: number;
  reachedShortlisted: number;
  rejected: number;
  withdrawn: number;
};

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function RecruiterJobAnalytics({ jobId, jobTitle, openings, accessToken, onOpenPipeline }: Props) {
  const [analytics, setAnalytics] = useState<JobAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    apiRequest<JobAnalyticsResponse>(`/api/v2/jobs/${encodeURIComponent(jobId)}/analytics`, { accessToken })
      .then((data) => {
        if (active) setAnalytics(data);
      })
      .catch((failure) => {
        if (active) {
          setAnalytics(null);
          setError(
            failure instanceof ApiClientError
              ? failure.error.message
              : "Không tải được báo cáo thống kê. Vui lòng thử lại."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jobId, accessToken, attempt]);

  const total = analytics?.total ?? 0;
  const submitted = analytics?.currentSubmitted ?? 0;
  const underReview = analytics?.currentUnderReview ?? 0;
  const pending = analytics?.pending ?? 0;
  const reachedUnderReview = analytics?.reachedUnderReview ?? 0;
  const reachedShortlisted = analytics?.reachedShortlisted ?? 0;
  const rejected = analytics?.rejected ?? 0;
  const withdrawn = analytics?.withdrawn ?? 0;
  const conversionRate = pct(reachedShortlisted, total);

  const kpis = [
    {
      icon: <UsersIcon size={16} />,
      iconClass: "text-ink-500",
      value: total,
      label: "Tổng hồ sơ nộp",
      sub: `${openings} chỉ tiêu tuyển`,
      toneClass: "border-border-subtle bg-white"
    },
    {
      icon: <ClockIcon size={16} />,
      iconClass: "text-amber-600",
      value: pending,
      label: "Chờ xử lý",
      sub: `${submitted} mới, ${underReview} xem xét`,
      toneClass: "border-amber-200/80 bg-amber-50/40"
    },
    {
      icon: <StarIcon size={16} />,
      iconClass: "text-emerald-600",
      value: reachedShortlisted,
      label: "Vào Shortlist",
      sub: `Tỷ lệ: ${conversionRate}%`,
      toneClass: "border-emerald-200/80 bg-emerald-50/40"
    },
    {
      icon: <BarChartIcon size={16} />,
      iconClass: "text-ink-500",
      value: total > 0 ? (total / Math.max(1, openings)).toFixed(1) : "0",
      label: "Ứng viên / chỉ tiêu",
      sub: `${rejected} từ chối · ${withdrawn} đã rút`,
      toneClass: "border-slate-200 bg-slate-50/70"
    }
  ];

  const steps = [
    { num: 1, name: "Đã nộp hồ sơ", val: total, rate: total > 0 ? 100 : 0, barClass: "bg-sky-500" },
    { num: 2, name: "Qua sơ loại", val: reachedUnderReview, rate: pct(reachedUnderReview, total), barClass: "bg-amber-500" },
    { num: 3, name: "Vào Shortlist", val: reachedShortlisted, rate: conversionRate, barClass: "bg-emerald-500" },
    { num: 4, name: "Đã từ chối", val: rejected, rate: pct(rejected, total), barClass: "bg-slate-400" },
    { num: 5, name: "Ứng viên rút", val: withdrawn, rate: pct(withdrawn, total), barClass: "bg-rose-300" }
  ];

  return (
    <Card as="section" padding="lg" className="space-y-5" aria-label="Báo cáo thống kê tin tuyển dụng">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">HIỆU QUẢ TUYỂN DỤNG</p>
          <h3 className="text-lg font-bold text-ink-900 m-0 mt-0.5">Báo cáo thống kê: {jobTitle}</h3>
        </div>
        <Button variant="primary" size="sm" onClick={onOpenPipeline}>
          Xem Kanban Pipeline →
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : error ? (
        <ErrorBanner
          tone="error"
          message={error}
          action={
            <Button type="button" size="sm" variant="secondary" onClick={() => setAttempt((v) => v + 1)}>
              Thử lại
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((item) => (
              <div key={item.label} className={cn("rounded-xl border p-4 space-y-2 shadow-xs", item.toneClass)}>
                <div className="flex items-center justify-between gap-2">
                  <span className={cn("inline-flex items-center", item.iconClass)} aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="text-xs font-medium text-ink-500">{item.sub}</span>
                </div>
                <div>
                  <strong className="block text-2xl font-bold text-ink-900 tabular-nums-kpi">{item.value}</strong>
                  <p className="text-xs font-semibold text-ink-700 m-0 mt-0.5">{item.label}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border-subtle bg-slate-50/70 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-ink-900 m-0">Phễu chuyển đổi ứng viên</h4>
              <span className="text-xs text-ink-500">Số liệu cộng dồn các hồ sơ đã từng bước qua từng vòng</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step) => (
                <div key={step.num} className="rounded-xl border border-border-subtle bg-white p-3.5 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-ink-600">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-ink-800">
                      {step.num}
                    </span>
                    <span>{step.name}</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <strong className="text-xl font-bold text-ink-900 tabular-nums-kpi">{step.val}</strong>
                    <small className="text-xs font-medium text-ink-500 tabular-nums-kpi">{step.rate}%</small>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                    <div className={`h-full rounded-full ${step.barClass}`} style={{ width: `${step.rate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
