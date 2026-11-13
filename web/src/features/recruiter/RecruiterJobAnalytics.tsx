import { useEffect, useState } from "react";
import { apiRequest } from "../../shared/api/client";
import { Button, Card, Skeleton, cn } from "../../shared/ui";

type Props = {
  jobId: string;
  jobTitle: string;
  openings: number;
  accessToken: string;
  onOpenPipeline: () => void;
};

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

export function RecruiterJobAnalytics({ jobId, jobTitle, openings, accessToken, onOpenPipeline }: Props) {
  const [apps, setApps] = useState<Array<{ applicationId: string; status: string; appliedAt: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest<{ items: Array<{ applicationId: string; status: string; appliedAt: string }>; total: number }>(
      `/api/v2/recruiter/applications?jobId=${jobId}&page=0&size=100`,
      { accessToken }
    )
      .then((data) => {
        if (active) setApps(data.items);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jobId, accessToken]);

  const total = apps.length;
  const submitted = apps.filter((a) => a.status === "SUBMITTED").length;
  const underReview = apps.filter((a) => a.status === "UNDER_REVIEW").length;
  const shortlisted = apps.filter((a) => a.status === "SHORTLISTED").length;
  const rejected = apps.filter((a) => a.status === "REJECTED").length;
  const interviews = apps.filter((a) => a.status === "INTERVIEW").length;
  const offered = apps.filter((a) => a.status === "OFFERED").length;
  const hired = apps.filter((a) => a.status === "HIRED").length;
  const conversionRate = pct(shortlisted, total);
  const pending = submitted + underReview;

  const kpis = [
    {
      icon: "👥",
      value: total,
      label: "Tổng hồ sơ nộp",
      sub: `${openings} chỉ tiêu tuyển`,
      toneClass: "border-border-subtle bg-white"
    },
    {
      icon: "⚡",
      value: pending,
      label: "Chờ xử lý",
      sub: `${submitted} mới, ${underReview} xem xét`,
      toneClass: "border-amber-200/80 bg-amber-50/40"
    },
    {
      icon: "⭐",
      value: shortlisted,
      label: "Vào Shortlist",
      sub: `Tỷ lệ: ${conversionRate}%`,
      toneClass: "border-emerald-200/80 bg-emerald-50/40"
    },
    {
      icon: "📊",
      value: total > 0 ? (total / Math.max(1, openings)).toFixed(1) : "0",
      label: "Ứng viên / chỉ tiêu",
      sub: `${rejected} hồ sơ từ chối`,
      toneClass: "border-slate-200 bg-slate-50/70"
    }
  ];

  const steps = [
    { num: 1, name: "Mới nộp", val: submitted, rate: pct(submitted, total), barClass: "bg-sky-500" },
    { num: 2, name: "Đang xem xét", val: underReview, rate: pct(underReview, total), barClass: "bg-amber-500" },
    { num: 3, name: "Shortlist", val: shortlisted, rate: conversionRate, barClass: "bg-emerald-500" },
    { num: 4, name: "Phỏng vấn", val: interviews, rate: pct(interviews, total), barClass: "bg-violet-500" },
    { num: 5, name: "Đề nghị tuyển dụng", val: offered, rate: pct(offered, total), barClass: "bg-orange-500" },
    { num: 6, name: "Đã tuyển dụng", val: hired, rate: pct(hired, total), barClass: "bg-green-600" },
    { num: 7, name: "Từ chối", val: rejected, rate: pct(rejected, total), barClass: "bg-slate-400" }
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
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((item) => (
            <div key={item.label} className={cn("rounded-2xl border p-4 space-y-2 shadow-xs", item.toneClass)}>
              <div className="flex items-center justify-between">
                <span className="text-lg" aria-hidden="true">
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
      )}

      <div className="rounded-2xl border border-border-subtle bg-slate-50/70 p-4 space-y-3">
        <h4 className="text-sm font-bold text-ink-900 m-0">Phễu chuyển đổi ứng viên</h4>
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
    </Card>
  );
}
