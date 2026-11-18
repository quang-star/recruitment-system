import { useEffect, useState } from "react";

import { ApiClientError, apiDownload, apiRequest } from "../../shared/api/client";
import { usePagedResource } from "../../shared/api/pagination";
import { AuthSession } from "../../shared/auth/session";
import { CvIcon, KanbanIcon, ListIcon, SparklesIcon } from "../../shared/components/Icon";
import { PageControls } from "../../shared/components/PageControls";
import { ReasonDialog } from "../../shared/components/ReasonDialog";
import { Badge, Button, Card, EmptyState, ErrorBanner, cn } from "../../shared/ui";
import { ApplicationMatch } from "../application/MatchBreakdown";
import { RecruiterApplicationDetail } from "./RecruiterApplicationDetail";
import { RecruiterApplicationsTable } from "./RecruiterApplicationsTable";
import { RecruiterDossierSplitDrawer } from "./RecruiterDossierSplitDrawer";
import { RecruiterKanbanBoard } from "./RecruiterKanbanBoard";
import {
  Application,
  ApplicationWithMatch,
  PIPELINE_STAGES,
  PipelineStage,
  RecruiterTransition,
  nextRecruitmentStage,
  STAGE_PILLS,
  StatusChange,
  canRejectApplication,
  candidateDisplayName,
  controlClass,
  getErrorMessage,
  screeningStageFor,
  translateApplicationStatus
} from "./recruiterApplicationTypes";

/** Recruiter ATS pipeline panel coordinating list/Kanban views, match enrichment, and status transitions. */
export function RecruiterApplicationsPanel({
  session,
  jobId,
  canTransition
}: {
  session: AuthSession;
  jobId: string | null;
  canTransition: boolean;
}) {
  const [applications, setApplications] = useState<ApplicationWithMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [histories, setHistories] = useState<Record<string, StatusChange[]>>({});
  const [workingApplicationId, setWorkingApplicationId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "score">("newest");
  const [rejectTarget, setRejectTarget] = useState<Application | null>(null);
  const [previewCvTarget, setPreviewCvTarget] = useState<{
    path: string;
    filename: string;
    title: string;
    page?: number;
  } | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "kanban">("table");
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("application"));
  const [linkedApplicationId, setLinkedApplicationId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("application"));
  const [query, setQuery] = useState("");
  const results = usePagedResource<Application>(
    jobId ? "/api/v2/recruiter/applications" : null,
    { jobId: jobId ?? "", status: viewMode === "kanban" ? "" : statusFilter, sort: sortBy, q: query, applicationId: linkedApplicationId },
    session.accessToken,
    viewMode === "kanban" ? 100 : 10
  );
  const loading = results.loading;

  useEffect(() => {
    let active = true;
    setApplications(results.items.map((item) => ({ ...item, matchState: "loading" })));
    setError(null);
    void (async () => {
      const withMatches = await Promise.all(
        results.items.map(async (application) => {
          if (application.matchingSupported === false || application.cvAccessGranted === false) {
            return { ...application, match: null };
          }
          try {
            const match = await apiRequest<ApplicationMatch>(`/api/v2/applications/${application.applicationId}/match`, {
              accessToken: session.accessToken
            });
            return { ...application, match, matchState: "ready" as const };
          } catch (failure) {
            return {
              ...application,
              match: null,
              matchState: failure instanceof ApiClientError && failure.status === 404 ? ("waiting" as const) : ("error" as const)
            };
          }
        })
      );
      if (active) setApplications(withMatches);
    })().catch((requestError) => {
      if (active) setError(getErrorMessage(requestError));
    });
    return () => {
      active = false;
    };
  }, [results.items, session.accessToken]);

  async function loadHistory(applicationId: string) {
    setWorkingApplicationId(applicationId);
    setError(null);
    try {
      const history = await apiRequest<StatusChange[]>(`/api/v2/applications/${applicationId}/history`, {
        accessToken: session.accessToken
      });
      setHistories((current) => ({ ...current, [applicationId]: history }));
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorkingApplicationId(null);
    }
  }

  async function transition(
    application: Application,
    status: RecruiterTransition | "REJECTED",
    reason: string | null = null
  ) {
    setRejectTarget(null);
    setWorkingApplicationId(application.applicationId);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiRequest<Application>(`/api/v2/recruiter/applications/${application.applicationId}/status`, {
        method: "PATCH",
        accessToken: session.accessToken,
        body: JSON.stringify({ status, reason, version: application.version })
      });
      setApplications((current) =>
        current.map((item) => (item.applicationId === updated.applicationId ? { ...item, ...updated } : item))
      );
      setMessage(`Đã chuyển hồ sơ sang ${translateApplicationStatus(status)}.`);
      await loadHistory(application.applicationId);
      results.refresh();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorkingApplicationId(null);
    }
  }

  async function downloadCv(applicationId: string) {
    setWorkingApplicationId(applicationId);
    setError(null);
    try {
      const download = await apiDownload(`/api/v2/recruiter/applications/${applicationId}/cv`, {
        accessToken: session.accessToken
      });
      const objectUrl = URL.createObjectURL(download.blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = download.filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setWorkingApplicationId(null);
    }
  }

  function viewCvEvidence(applicationId: string, page: number) {
    setPreviewCvTarget({
      path: `/api/v2/recruiter/applications/${applicationId}/cv`,
      filename: `ung-vien-${applicationId.slice(0, 8)}.pdf`,
      title: `CV Ứng viên (Bằng chứng trang ${page})`,
      page
    });
  }

  function handleDragStart(e: React.DragEvent, application: Application) {
    e.dataTransfer.setData("text/plain", application.applicationId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDrop(e: React.DragEvent, targetStatus: PipelineStage["key"]) {
    e.preventDefault();
    setDragOverStage(null);
    const applicationId = e.dataTransfer.getData("text/plain");
    const app = applications.find((a) => a.applicationId === applicationId);
    if (!app || !canTransition || !canRejectApplication(app.status) || screeningStageFor(app.status) === targetStatus) return;

    const nextStatus = nextRecruitmentStage[app.status];
    if (targetStatus === "REJECTED") {
      setRejectTarget(app);
    } else if (targetStatus === nextStatus) {
      void transition(app, nextStatus);
    } else {
      setError(
        `Không thể chuyển trực tiếp từ ${translateApplicationStatus(app.status)} sang ${translateApplicationStatus(targetStatus)}.`
      );
    }
  }

  if (!jobId) return null;

  const visibleApplications = applications.filter((item) =>
    results.items.some((row) => row.applicationId === item.applicationId)
  );
  const activeSelectedApp =
    visibleApplications.find((item) => item.applicationId === selectedId) ?? visibleApplications[0];
  const hasMultiplePages = results.total > results.size;
  const hasFilters = query.trim() !== "" || (viewMode === "table" && statusFilter !== "");
  const withdrawnCount = visibleApplications.filter((app) => app.status === "WITHDRAWN").length;

  const renderDetail = (application: ApplicationWithMatch) => (
    <RecruiterApplicationDetail
      application={application}
      history={histories[application.applicationId]}
      canTransition={canTransition}
      workingApplicationId={workingApplicationId}
      onPreviewCv={setPreviewCvTarget}
      onDownloadCv={(id) => void downloadCv(id)}
      onViewCvEvidence={viewCvEvidence}
      onLoadHistory={(id) => void loadHistory(id)}
      onRefreshMatches={results.refresh}
      onTransition={(app, status) => void transition(app, status)}
      onRequestReject={setRejectTarget}
    />
  );

  return (
    <Card padding="lg" className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">SÀNG LỌC HỒ SƠ</p>
          <h3 className="text-lg font-bold text-ink-900 m-0 mt-0.5">Ứng viên</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="inline-flex rounded-xl border border-border-subtle bg-slate-100 p-1"
            role="group"
            aria-label="Chế độ xem"
          >
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                viewMode === "table" ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900"
              )}
              onClick={() => setViewMode("table")}
            >
              <ListIcon size={14} aria-hidden="true" />
              <span>Danh sách</span>
            </button>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                viewMode === "kanban" ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900"
              )}
              onClick={() => setViewMode("kanban")}
            >
              <KanbanIcon size={14} aria-hidden="true" />
              <span>Bảng Kanban</span>
            </button>
          </div>

          <Badge tone="brand">{results.total} hồ sơ</Badge>
          {linkedApplicationId && <Button variant="secondary" size="sm" onClick={() => {
            setLinkedApplicationId(null);
            const url = new URL(window.location.href);
            url.searchParams.delete("application");
            window.history.replaceState(null, "", url);
          }}>Xem tất cả ứng viên</Button>}
          <Button variant="secondary" size="sm" onClick={results.refresh}>
            Làm mới
          </Button>
        </div>
      </div>

      {viewMode === "table" && (
        <div className="flex flex-wrap gap-2">
          {STAGE_PILLS.map((pill) => {
            const active = statusFilter === pill.value;
            return (
              <button
                key={pill.value || "all"}
                type="button"
                onClick={() => setStatusFilter(pill.value)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
                  active
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-border-subtle bg-white text-ink-600 hover:border-border-strong hover:text-ink-900"
                )}
              >
                {pill.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
        <label className="block text-xs font-semibold text-ink-700">
          Tìm hồ sơ
          <input
            className={controlClass}
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tên, email, mã ứng viên hoặc thư ứng tuyển"
          />
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Trạng thái
          <select
            className={controlClass}
            value={viewMode === "kanban" ? "" : statusFilter}
            disabled={viewMode === "kanban"}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">Tất cả</option>
            {PIPELINE_STAGES.map(({ key, label }) => <option key={key} value={key}>{label}</option>)}
            <option value="WITHDRAWN">Đã rút</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-ink-700">
          Sắp xếp
          <select
            className={controlClass}
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as "newest" | "score")}
          >
            <option value="newest">Mới nhất</option>
            <option value="score">Mức độ phù hợp</option>
          </select>
        </label>
      </div>

      {(hasMultiplePages || loading) && (
        <PageControls {...results} onPageChange={results.setPage} label="Phân trang ứng viên" />
      )}
      {viewMode === "kanban" && hasMultiplePages && (
        <p className="text-xs text-ink-500">
          Bảng hiển thị {results.items.length}/{results.total} hồ sơ. Dùng phân trang để xem thêm.
        </p>
      )}
      {results.error && <ErrorBanner tone="error" message={results.error} />}

      {results.items.some((item) => item.matchingSupported !== false && item.cvAccessGranted !== false) && (
        <div className="flex items-start gap-2.5 rounded-xl border border-brand-200/70 bg-brand-50/50 px-3.5 py-2.5 text-xs text-ink-700">
          <SparklesIcon size={15} className="text-brand-700 shrink-0 mt-0.5" />
          <p className="m-0 leading-relaxed">
            Mức độ phù hợp với vị trí trên thang 1–5 sao hỗ trợ xem hồ sơ, không phải xác suất trúng tuyển. Quyết định tuyển dụng do bạn thực hiện.
          </p>
        </div>
      )}

      {error && <ErrorBanner tone="error" message={error} />}
      {message && <ErrorBanner tone="success" message={message} />}
      {!loading && !error && !results.error && results.total === 0 && (
        <EmptyState
          icon={<CvIcon size={24} />}
          title={hasFilters
            ? "Không có hồ sơ phù hợp bộ lọc hiện tại."
            : linkedApplicationId ? "Không tìm thấy hồ sơ ứng tuyển." : "Chưa có hồ sơ ứng tuyển"}
          action={hasFilters && (
            <Button variant="secondary" size="sm" onClick={() => {
              setQuery("");
              setStatusFilter("");
            }}>
              Xóa bộ lọc
            </Button>
          )}
        />
      )}

      {viewMode === "table" && visibleApplications.length > 0 && (
        <div className="grid gap-5 xl:grid-cols-[1.15fr_1fr] items-start">
          <RecruiterApplicationsTable
            applications={visibleApplications}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <div aria-label="Hồ sơ ứng viên đã chọn">
            {activeSelectedApp && renderDetail(activeSelectedApp)}
          </div>
        </div>
      )}

      {viewMode === "kanban" && visibleApplications.length > 0 && (
        <div className="space-y-6">
          {withdrawnCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-ink-700">
              <span>
                Có{" "}
                <strong>{withdrawnCount}</strong>{" "}
                hồ sơ ứng viên đã rút.
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setViewMode("table");
                  setStatusFilter("WITHDRAWN");
                }}
              >
                Xem hồ sơ đã rút
              </Button>
            </div>
          )}
          {withdrawnCount < visibleApplications.length && (
            <RecruiterKanbanBoard
              applications={visibleApplications}
              selectedId={selectedId}
              dragOverStage={dragOverStage}
              canTransition={canTransition}
              workingApplicationId={workingApplicationId}
              onSelect={setSelectedId}
              onDragOverStageChange={setDragOverStage}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onPreviewCv={setPreviewCvTarget}
              onTransition={(app, status) => void transition(app, status)}
              onRequestReject={setRejectTarget}
            />
          )}

          {activeSelectedApp && (
            <div className="space-y-3 pt-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">
                  CHI TIẾT HỒ SƠ ĐÃ CHỌN
                </p>
                <h4 className="text-base font-bold text-ink-900 m-0 mt-0.5">
                  {candidateDisplayName(activeSelectedApp)}
                </h4>
              </div>
              {renderDetail(activeSelectedApp)}
            </div>
          )}
        </div>
      )}

      <ReasonDialog
        open={rejectTarget !== null}
        title="Từ chối hồ sơ"
        confirmLabel="Xác nhận từ chối"
        description="Lý do sẽ được lưu trong lịch sử và hiển thị cho ứng viên."
        onCancel={() => setRejectTarget(null)}
        onConfirm={(reason) => {
          if (rejectTarget) void transition(rejectTarget, "REJECTED", reason);
        }}
      />

      {(() => {
        const dossierApp = previewCvTarget
          ? visibleApplications.find(
              (item) => `/api/v2/recruiter/applications/${item.applicationId}/cv` === previewCvTarget.path
            ) ?? activeSelectedApp
          : null;
        return (
          <RecruiterDossierSplitDrawer
            open={previewCvTarget !== null}
            onClose={() => setPreviewCvTarget(null)}
            candidateName={dossierApp ? candidateDisplayName(dossierApp) : (previewCvTarget?.title ?? "Hồ sơ ứng viên")}
            stageLabel={dossierApp ? translateApplicationStatus(dossierApp.status) : ""}
            cvAccessGranted={dossierApp ? dossierApp.cvAccessGranted !== false : true}
            downloadPath={previewCvTarget?.path ?? ""}
            accessToken={session.accessToken}
            page={previewCvTarget?.page}
          >
            {dossierApp && renderDetail(dossierApp)}
          </RecruiterDossierSplitDrawer>
        );
      })()}
    </Card>
  );
}
