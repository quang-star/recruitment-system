import { useEffect, useState } from "react";

import { apiRequest } from "../../shared/api/client";
import { PageResult } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { Button, Card, EmptyState, ErrorBanner, Skeleton } from "../../shared/ui";
import { RecruiterApplicationsPanel } from "./RecruiterApplicationsPanel";
import { Job, jobStatusLabel } from "./recruiterJobTypes";

type RecruiterCandidatesViewProps = {
  session: AuthSession;
  companyId: string | null;
  canRecruit: boolean;
  initialJobId?: string | null;
  onOpenJobs: () => void;
};

/** Standalone ATS pipeline view scoped to a selected company job. */
export function RecruiterCandidatesView({
  session,
  companyId,
  canRecruit,
  initialJobId,
  onOpenJobs
}: RecruiterCandidatesViewProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(initialJobId ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedJobId(initialJobId ?? null);
  }, [initialJobId]);

  useEffect(() => {
    if (!companyId) {
      setJobs([]);
      setSelectedJobId(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void apiRequest<PageResult<Job>>(
      `/api/v2/companies/${encodeURIComponent(companyId)}/jobs?page=0&size=50&sort=newest`,
      { accessToken: session.accessToken }
    )
      .then((result) => {
        if (!active) return;
        const items = result.items ?? [];
        setJobs(items);
        setSelectedJobId((current) => {
          if (current && items.some((j) => j.jobId === current)) return current;
          return items[0]?.jobId ?? null;
        });
      })
      .catch(() => {
        if (active) setError("Không tải được danh sách tin tuyển dụng của công ty.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [companyId, session.accessToken]);

  if (!companyId) {
    return (
      <Card padding="lg">
        <EmptyState
          title="Chưa chọn công ty"
          description="Vui lòng tạo hoặc chọn công ty trong mục Công ty & Đội ngũ để xem hồ sơ ứng viên."
        />
      </Card>
    );
  }

  if (loading && jobs.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return <ErrorBanner tone="error" message={error} />;
  }

  if (jobs.length === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          title="Chưa có tin tuyển dụng"
          description="Tạo tin tuyển dụng đầu tiên để bắt đầu tiếp nhận và sàng lọc hồ sơ ứng viên."
          action={
            <Button variant="primary" size="sm" onClick={onOpenJobs}>
              Đi tới Tin tuyển dụng
            </Button>
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <label htmlFor="recruiter-pipeline-job-select" className="text-xs font-semibold text-ink-600 shrink-0">
            Tin tuyển dụng
          </label>
          <select
            id="recruiter-pipeline-job-select"
            aria-label="Chọn tin tuyển dụng"
            className="h-9 min-w-[260px] max-w-md rounded-lg border border-border-strong bg-white px-3 text-sm font-medium text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            value={selectedJobId ?? ""}
            onChange={(event) => setSelectedJobId(event.target.value || null)}
          >
            {jobs.map((job) => (
              <option key={job.jobId} value={job.jobId}>
                {job.title} ({jobStatusLabel(job.status)})
              </option>
            ))}
          </select>
        </div>
        <Button variant="secondary" size="sm" onClick={onOpenJobs}>
          Quản lý tin
        </Button>
      </div>

      <RecruiterApplicationsPanel
        session={session}
        jobId={selectedJobId}
        canTransition={canRecruit}
      />
    </div>
  );
}
