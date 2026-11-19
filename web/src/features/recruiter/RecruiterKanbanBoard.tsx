import {
  ArrowRightIcon,
  BanIcon,
  CloseIcon,
  EyeIcon,
  InboxIcon,
  SearchIcon,
  StarIcon
} from "../../shared/components/Icon";
import { Button, cn } from "../../shared/ui";
import { MatchRating } from "../application/MatchRating";
import {
  Application,
  RecruiterTransition,
  ApplicationWithMatch,
  PIPELINE_STAGES,
  PipelineStage,
  canRejectApplication,
  candidateDisplayName,
  candidateInitials,
  screeningStageFor
} from "./recruiterApplicationTypes";

const STAGE_ICONS = {
  SUBMITTED: InboxIcon,
  UNDER_REVIEW: SearchIcon,
  SHORTLISTED: StarIcon,
  REJECTED: BanIcon
} as const;

/** Drag-and-drop four-stage recruiter Kanban board with inline stage transitions. */
export function RecruiterKanbanBoard({
  applications,
  selectedId,
  dragOverStage,
  canTransition,
  workingApplicationId,
  onSelect,
  onDragOverStageChange,
  onDragStart,
  onDrop,
  onPreviewCv,
  onTransition,
  onRequestReject
}: {
  applications: ApplicationWithMatch[];
  selectedId: string | null;
  dragOverStage: string | null;
  canTransition: boolean;
  workingApplicationId: string | null;
  onSelect: (applicationId: string) => void;
  onDragOverStageChange: (stage: string | null) => void;
  onDragStart: (event: React.DragEvent, application: Application) => void;
  onDrop: (event: React.DragEvent, targetStatus: PipelineStage["key"]) => void;
  onPreviewCv: (target: { path: string; filename: string; title: string }) => void;
  onTransition: (application: Application, status: RecruiterTransition) => void;
  onRequestReject: (application: Application) => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" role="region" aria-label="Bảng Kanban tuyển dụng">
      {PIPELINE_STAGES.map((stage) => {
        const stageApps = applications.filter((app) => screeningStageFor(app.status) === stage.key);
        const isOver = dragOverStage === stage.key;
        const StageIcon = STAGE_ICONS[stage.key];
        return (
          <div
            key={stage.key}
            data-stage={stage.key}
            onDragOver={(e) => {
              e.preventDefault();
              onDragOverStageChange(stage.key);
            }}
            onDragLeave={() => {
              if (dragOverStage === stage.key) onDragOverStageChange(null);
            }}
            onDrop={(e) => onDrop(e, stage.key)}
            className={cn(
              "flex flex-col rounded-lg border border-border-subtle border-t-4 bg-slate-50/80 p-3 min-h-[260px] transition-colors",
              stage.topBorderClass,
              isOver && "ring-2 ring-brand-500/40 bg-brand-50/40"
            )}
          >
            <div className="flex items-center justify-between gap-2 pb-3 mb-2 border-b border-border-subtle">
              <div className="flex items-center gap-1.5">
                <StageIcon size={14} className={stage.iconColorClass} aria-hidden="true" />
                <h4 className="text-xs font-bold uppercase tracking-wide text-ink-800 m-0">{stage.label}</h4>
              </div>
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-sm border px-1.5 text-[11px] font-bold tabular-nums-kpi",
                  stage.countClass
                )}
              >
                {stageApps.length}
              </span>
            </div>

            <div className="space-y-2.5 flex-1">
              {stageApps.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border-subtle bg-white/60 py-6 text-center text-xs text-ink-400">
                  Chưa có hồ sơ
                </div>
              ) : (
                stageApps.map((application) => (
                  <div
                    key={application.applicationId}
                    data-stage={stage.key}
                    draggable={canTransition && canRejectApplication(application.status)}
                    onDragStart={(e) => onDragStart(e, application)}
                    onClick={() => onSelect(application.applicationId)}
                    className={cn(
                      "rounded-lg border bg-white p-3 shadow-xs space-y-2.5 transition-all cursor-pointer",
                      selectedId === application.applicationId
                        ? "border-brand-600 ring-2 ring-brand-500/20"
                        : "border-border-subtle hover:border-border-strong",
                      workingApplicationId === application.applicationId && "opacity-60"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                        {candidateInitials(application)}
                      </div>
                      <div className="min-w-0">
                        <strong className="block text-sm font-semibold text-ink-900 truncate">
                          {candidateDisplayName(application)}
                        </strong>
                        {application.candidateHeadline && (
                          <span className="block text-xs text-ink-600 truncate">{application.candidateHeadline}</span>
                        )}
                        <small className="block text-[11px] text-ink-500">
                          {new Date(application.appliedAt).toLocaleDateString("vi-VN")}
                        </small>
                      </div>
                    </div>

                    <div>
                      <MatchRating {...application} compact />
                      {application.match?.status === "DEGRADED" && (
                        <small className="mt-1 block text-[11px] font-medium text-amber-700">
                          Chưa đủ căn cứ chấm điểm · Cần xem thủ công
                        </small>
                      )}
                    </div>

                    {application.coverLetter && (
                      <p className="text-xs italic text-ink-600 bg-slate-50 rounded-lg px-2.5 py-1.5 m-0 line-clamp-2">
                        "{application.coverLetter.slice(0, 75)}
                        {application.coverLetter.length > 75 ? "…" : ""}"
                      </p>
                    )}

                    <div className="flex flex-wrap gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        title="Xem CV PDF trực tiếp"
                        disabled={
                          workingApplicationId === application.applicationId || application.cvAccessGranted === false
                        }
                        onClick={() =>
                          onPreviewCv({
                            path: `/api/v2/recruiter/applications/${application.applicationId}/cv`,
                            filename: `ung-vien-${application.candidateUserId.slice(0, 8)}.pdf`,
                            title: `CV Ứng viên ${application.candidateUserId.slice(0, 8)}…`
                          })
                        }
                      >
                        <EyeIcon size={14} aria-hidden="true" />
                        <span>CV</span>
                      </Button>

                      {canTransition && application.status === "SUBMITTED" && (
                        <Button
                          variant="subtle"
                          size="sm"
                          disabled={workingApplicationId === application.applicationId}
                          onClick={() => onTransition(application, "UNDER_REVIEW")}
                          title="Chuyển sang Đang xem xét"
                        >
                          <span>Xem xét</span>
                          <ArrowRightIcon size={14} aria-hidden="true" />
                        </Button>
                      )}

                      {canTransition && application.status === "UNDER_REVIEW" && (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={workingApplicationId === application.applicationId}
                          onClick={() => onTransition(application, "SHORTLISTED")}
                          title="Chuyển vào Danh sách rút gọn"
                        >
                          <StarIcon size={14} aria-hidden="true" />
                          <span>Shortlist</span>
                        </Button>
                      )}

                      {canTransition && canRejectApplication(application.status) && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={workingApplicationId === application.applicationId}
                          onClick={() => onRequestReject(application)}
                          title="Từ chối hồ sơ này"
                        >
                          <CloseIcon size={14} aria-hidden="true" />
                          <span>Từ chối</span>
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
