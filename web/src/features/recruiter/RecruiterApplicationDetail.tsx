import { Badge, Button, ErrorBanner } from "../../shared/ui";
import { MatchBreakdown } from "../application/MatchBreakdown";
import { matchSummary } from "../application/matchPresentation";
import {
  Application,
  RecruiterTransition,
  nextRecruitmentStage,
  ApplicationWithMatch,
  StatusChange,
  candidateDisplayName,
  candidateInitials,
  statusTone,
  translateApplicationStatus
} from "./recruiterApplicationTypes";

/** Detailed candidate dossier, cover letter, rubric match evidence, and ATS stage actions. */
export function RecruiterApplicationDetail({
  application,
  history,
  canTransition,
  workingApplicationId,
  onPreviewCv,
  onDownloadCv,
  onViewCvEvidence,
  onLoadHistory,
  onRefreshMatches,
  onTransition,
  onRequestReject
}: {
  application: ApplicationWithMatch;
  history?: StatusChange[];
  canTransition: boolean;
  workingApplicationId: string | null;
  onPreviewCv: (target: { path: string; filename: string; title: string; page?: number }) => void;
  onDownloadCv: (applicationId: string) => void;
  onViewCvEvidence: (applicationId: string, page: number) => void;
  onLoadHistory: (applicationId: string) => void;
  onRefreshMatches: () => void;
  onTransition: (application: Application, status: RecruiterTransition) => void;
  onRequestReject: (application: Application) => void;
}) {
  const isBusy = workingApplicationId === application.applicationId;

  return (
    <article
      key={application.applicationId}
      className="application-detail rounded-2xl border border-border-subtle bg-white p-5 shadow-xs space-y-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle pb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800">
            {candidateInitials(application)}
          </div>
          <div className="min-w-0 space-y-1">
            <strong className="block text-base font-bold text-ink-900">{candidateDisplayName(application)}</strong>
            {application.candidateHeadline && (
              <p className="text-xs font-medium text-ink-600 m-0">{application.candidateHeadline}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
              <span>Nộp ngày {new Date(application.appliedAt).toLocaleString("vi-VN")}</span>
              {application.candidateEmail && <Badge tone="neutral">✉️ {application.candidateEmail}</Badge>}
              {application.candidatePhone && <Badge tone="neutral">📞 {application.candidatePhone}</Badge>}
              <span>· Mã: {application.applicationId.slice(0, 8)}</span>
            </div>
          </div>
        </div>
        <Badge tone={statusTone(application.status)}>{translateApplicationStatus(application.status)}</Badge>
      </div>

      {application.coverLetter && (
        <div className="rounded-xl border border-border-subtle bg-slate-50/80 p-3.5 space-y-1">
          <strong className="block text-xs font-semibold uppercase tracking-wide text-ink-600">
            Thư ứng tuyển:
          </strong>
          <p className="text-sm text-ink-800 m-0 leading-relaxed whitespace-pre-line">{application.coverLetter}</p>
        </div>
      )}

      {application.match ? (
        <div className="rounded-xl border border-border-subtle bg-slate-50/50 p-4">
          <MatchBreakdown
            match={application.match}
            onViewCv={(page) => onViewCvEvidence(application.applicationId, page)}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-border-subtle bg-slate-50 px-4 py-3 text-sm text-ink-600">
          {application.cvAccessGranted === false
            ? "Ứng viên đã thu hồi quyền xem CV và điểm."
            : application.matchingSupported === false
              ? "Ngành này chưa hỗ trợ AI; xem xét hồ sơ thủ công."
              : matchSummary(application)}
        </div>
      )}

      {application.matchState === "error" && (
        <ErrorBanner
          tone="error"
          message="Không tải được kết quả đối chiếu."
          action={
            <Button variant="secondary" size="sm" onClick={onRefreshMatches}>
              Thử lại điểm
            </Button>
          }
        />
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <Button
          variant="primary"
          size="sm"
          disabled={isBusy || application.cvAccessGranted === false}
          onClick={() =>
            onPreviewCv({
              path: `/api/v2/recruiter/applications/${application.applicationId}/cv`,
              filename: `ung-vien-${application.candidateUserId.slice(0, 8)}.pdf`,
              title: `CV ${candidateDisplayName(application)}`
            })
          }
        >
          📄 Xem CV trực tiếp
        </Button>

        <Button
          variant="secondary"
          size="sm"
          disabled={isBusy || application.cvAccessGranted === false}
          onClick={() => onDownloadCv(application.applicationId)}
        >
          Tải CV đã nộp
        </Button>

        <Button variant="secondary" size="sm" disabled={isBusy} onClick={() => onLoadHistory(application.applicationId)}>
          Xem tiến trình
        </Button>

        {canTransition && application.status === "SUBMITTED" && (
          <Button variant="subtle" size="sm" disabled={isBusy} onClick={() => onTransition(application, "UNDER_REVIEW")}>
            Bắt đầu xem xét
          </Button>
        )}

        {canTransition && application.status === "UNDER_REVIEW" && (
          <Button variant="primary" size="sm" disabled={isBusy} onClick={() => onTransition(application, "SHORTLISTED")}>
            Đưa vào shortlist
          </Button>
        )}

        {canTransition && ["SHORTLISTED", "INTERVIEW", "OFFERED"].includes(application.status) && (
          <Button variant="primary" size="sm" disabled={workingApplicationId === application.applicationId}
            onClick={() => onTransition(application, nextRecruitmentStage[application.status]!)}>
            {translateApplicationStatus(nextRecruitmentStage[application.status]!)}
          </Button>
        )}
        {canTransition && ["SUBMITTED", "UNDER_REVIEW", "SHORTLISTED", "INTERVIEW", "OFFERED"].includes(application.status) && (
          <Button variant="danger" size="sm" disabled={isBusy} onClick={() => onRequestReject(application)}>
            Từ chối
          </Button>
        )}
      </div>

      {history && (
        <ol className="space-y-2 border-t border-border-subtle pt-4 pl-4 m-0 text-xs text-ink-600 list-decimal">
          {history.map((change) => (
            <li key={change.statusChangeId} className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-ink-900">{translateApplicationStatus(change.toStatus)}</strong>
                <span className="text-ink-500">{new Date(change.occurredAt).toLocaleString("vi-VN")}</span>
              </div>
              {change.reason && <small className="block text-ink-600">Lý do: {change.reason}</small>}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}
