import { CheckCircleIcon } from "../../shared/components/Icon";
import { PageControls } from "../../shared/components/PageControls";
import { Badge, Button, Card, CardContent, EmptyState, ErrorBanner, Skeleton } from "../../shared/ui";
import { MatchBreakdown } from "../application/MatchBreakdown";
import { MatchRating } from "../application/MatchRating";
import { matchSummary } from "../application/matchPresentation";
import {
  APPLICATION_STATUS_OPTIONS,
  Application,
  StatusChange,
  applicationStatusLabel,
  applicationStatusTone,
  inputClass
} from "./candidateJobTypes";

/** Candidate applications list with status filtering, rubric match detail, timeline, and CV/withdraw controls. */
export function CandidateApplicationsSection({
  applicationsOnly,
  applications,
  histories,
  selectedApplicationId,
  workingApplicationId,
  page,
  size,
  total,
  loading,
  error,
  missingInitialJobNotice,
  message,
  bannerError,
  appQuery,
  appStatus,
  appSort,
  onAppQueryChange,
  onAppStatusChange,
  onAppSortChange,
  onPageChange,
  onRefresh,
  onToggleDetail,
  onOpenJobDetail,
  onPreviewCv,
  onRevokeCvAccess,
  onWithdraw
}: {
  applicationsOnly: boolean;
  applications: Application[];
  histories: Record<string, StatusChange[]>;
  selectedApplicationId: string | null;
  workingApplicationId: string | null;
  page: number;
  size: number;
  total: number;
  loading: boolean;
  error: string | null;
  missingInitialJobNotice: string | null;
  message: string | null;
  bannerError: string | null;
  appQuery: string;
  appStatus: string;
  appSort: string;
  onAppQueryChange: (value: string) => void;
  onAppStatusChange: (value: string) => void;
  onAppSortChange: (value: string) => void;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onToggleDetail: (applicationId: string) => void;
  onOpenJobDetail: (jobId: string) => void;
  onPreviewCv: (payload: { cvId: string; cvVersionId?: string; title?: string; page?: number }) => void;
  onRevokeCvAccess: (application: Application) => void;
  onWithdraw: (application: Application) => void;
}) {
  return (
    <section className="space-y-5">
      {applicationsOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-border-subtle">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
              Theo dõi ứng tuyển
            </p>
            <h2 className="text-xl font-bold text-ink-900 m-0 mt-0.5">Việc làm đã ứng tuyển</h2>
            <p className="text-xs sm:text-sm text-ink-500 m-0 mt-1">
              Kiểm tra trạng thái xét tuyển, kết quả đối chiếu kỹ năng 1–5 sao và quản lý quyền truy cập CV của từng hồ sơ.
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={onRefresh}>
            Làm mới
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <div>
            <h2 className="text-lg font-bold text-ink-900 m-0">Hồ sơ đã ứng tuyển</h2>
            <p className="text-xs sm:text-sm text-ink-500 m-0 mt-0.5">
              Theo dõi tiến trình xử lý, kết quả đối chiếu kỹ năng và quyền truy cập CV.
            </p>
          </div>
          <Badge tone="neutral">{total} hồ sơ</Badge>
        </div>
      )}

      {applicationsOnly && (
        <>
          {missingInitialJobNotice && <ErrorBanner tone="info" message={missingInitialJobNotice} />}
          {message && <ErrorBanner tone="success" message={message} />}
          {bannerError && <ErrorBanner tone="error" message={bannerError} />}
        </>
      )}

      <Card>
        <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-[1fr_200px_170px] gap-3">
          <label className="block space-y-1.5 text-xs font-semibold text-ink-700">
            <span>Tìm kiếm hồ sơ</span>
            <input
              type="search"
              value={appQuery}
              onChange={(event) => onAppQueryChange(event.target.value)}
              placeholder="Lọc theo từ khóa…"
              className={inputClass}
            />
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-ink-700">
            <span>Trạng thái</span>
            <select value={appStatus} onChange={(event) => onAppStatusChange(event.target.value)} className={inputClass}>
              {APPLICATION_STATUS_OPTIONS.map((item) => (
                <option key={item.value || "ALL"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1.5 text-xs font-semibold text-ink-700">
            <span>Sắp xếp</span>
            <select value={appSort} onChange={(event) => onAppSortChange(event.target.value)} className={inputClass}>
              <option value="newest">Mới nhất</option>
              <option value="oldest">Cũ nhất</option>
            </select>
          </label>
        </CardContent>
      </Card>

      {error && <ErrorBanner tone="error" message={error} />}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : applications.length === 0 ? (
        <EmptyState
          icon={<CheckCircleIcon size={24} />}
          title="Chưa có hồ sơ ứng tuyển"
          description="Khi bạn nộp CV cho một vị trí, trạng thái xét tuyển và lịch sử thay đổi sẽ hiển thị tại đây."
        />
      ) : (
        <div className="space-y-4">
          {applications.map((application) => {
            const expanded = selectedApplicationId === application.applicationId;
            const history = histories[application.applicationId];
            const isBusy = workingApplicationId === application.applicationId;
            const isWithdrawn = application.status === "WITHDRAWN";

            return (
              <Card key={application.applicationId} className="application-detail">
                <CardContent className="pt-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold text-ink-900">{application.jobTitle || `Vị trí #${application.jobId}`}</span>
                        <Badge tone={applicationStatusTone(application.status)}>
                          {applicationStatusLabel(application.status)}
                        </Badge>
                        {application.cvAccessGranted === false && application.status !== "WITHDRAWN" && (
                          <Badge tone="neutral">
                            {application.status === "REJECTED" ? "Đã đóng quyền xem CV" : "Đã thu hồi quyền CV"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-ink-500 m-0">
                        {application.companyName || `Hồ sơ #${application.applicationId}`} · Nộp ngày {new Date(application.appliedAt).toLocaleDateString("vi-VN")}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {application.match &&
                        application.cvAccessGranted !== false &&
                        application.matchingSupported !== false && <MatchRating match={application.match} compact />}
                      <span className="text-xs font-medium text-ink-600">{matchSummary(application)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border-subtle">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => onToggleDetail(application.applicationId)}
                      >
                        {expanded ? "Thu gọn chi tiết" : "Xem chi tiết & lịch sử"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenJobDetail(application.jobId)}
                      >
                        Xem tin tuyển dụng
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={workingApplicationId !== null || application.cvAccessGranted === false || isWithdrawn}
                        onClick={() => onRevokeCvAccess(application)}
                      >
                        Thu hồi quyền xem CV
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={workingApplicationId !== null || !["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "OFFERED"].includes(application.status)}
                        onClick={() => onWithdraw(application)}
                      >
                        Rút hồ sơ
                      </Button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="pt-4 border-t border-border-subtle space-y-4">
                      {application.match && application.cvAccessGranted !== false ? (
                        <MatchBreakdown
                          match={application.match}
                          onViewCv={
                            application.cvId
                              ? (pageNumber) =>
                                  onPreviewCv({
                                    cvId: application.cvId!,
                                    cvVersionId: application.cvVersionId,
                                    title: `CV hồ sơ #${application.applicationId}`,
                                    page: pageNumber
                                  })
                              : undefined
                          }
                        />
                      ) : (
                        <p className="text-xs text-ink-500 m-0">{matchSummary(application)}</p>
                      )}

                      {history && history.length > 0 && (
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-ink-500 mb-2">
                            Lịch sử trạng thái
                          </p>
                          <ol className="status-timeline space-y-2 border-l-2 border-brand-200 pl-4 m-0 list-none">
                            {history.map((change) => (
                              <li key={change.statusChangeId} className="text-xs text-ink-700 space-y-0.5">
                                <div className="font-semibold text-ink-900">
                                  {change.fromStatus ? `${applicationStatusLabel(change.fromStatus)} → ` : ""}
                                  {applicationStatusLabel(change.toStatus)}
                                </div>
                                <div className="text-ink-500">
                                  {new Date(change.occurredAt).toLocaleString("vi-VN")}
                                  {change.reason ? ` · Lý do: ${change.reason}` : ""}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <PageControls
            page={page}
            size={size}
            total={total}
            loading={loading}
            onPageChange={onPageChange}
            label="Phân trang hồ sơ đã ứng tuyển"
          />
        </div>
      )}
    </section>
  );
}
