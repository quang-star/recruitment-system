import { FC, useEffect, useRef } from "react";
import { PublicJob } from "./types";
import { resolveCompanyMeta } from "./companyData";
import { CompanyCover } from "./CompanyCover";
import { SparklesIcon } from "../../shared/components/Icon";
import { PreApplyMatchWidget } from "../application/PreApplyMatchWidget";
import { AuthSession } from "../../shared/auth/session";

type Props = {
  job: PublicJob | null;
  session?: AuthSession | null;
  onClose: () => void;
  onApply: (job: PublicJob) => void;
  onRequireLogin?: () => void;
  onOpenCvLibrary?: () => void;
};

export const JobDetailDrawer: FC<Props> = ({
  job,
  session,
  onClose,
  onApply,
  onRequireLogin,
  onOpenCvLibrary,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!job) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [job]);
  if (!job) return null;
  const meta = resolveCompanyMeta(job.companyId, job.companyName);
  const logo = job.companyLogo || meta.logo;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="modal-card job-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="public-job-detail-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); onClose(); }
          if (event.key !== "Tab") return;
          const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
          const first = buttons?.[0];
          const last = buttons?.[buttons.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first?.focus();
          }
        }}
      >
        <CompanyCover src={meta.coverImage} className="drawer-company-cover-banner">
          <div className="drawer-cover-overlay">
            <span className="drawer-cover-badge">{meta.shortName}</span>
          </div>
        </CompanyCover>

        <div className="section-heading">
          <div className="job-drawer-company-row">
            <img src={logo} alt={`${meta.shortName} logo`} className="drawer-company-logo" />
            <div>
              <span className="section-kicker">{meta.name}</span>
              <h2 id="public-job-detail-title">{job.title}</h2>
            </div>
          </div>
          <button type="button" className="icon-button secondary-button" aria-label="Đóng" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="job-quick-meta">
          <span className="meta-badge">{job.locationText ?? "Linh hoạt"}</span>
          <span className="meta-badge">{job.workMode ?? "Toàn thời gian"}</span>
          <span className="meta-badge">{job.openings} vị trí</span>
          {job.matchingSupported === true && <span className="meta-badge highlight-badge">
            <SparklesIcon size={14} /> Hỗ trợ đối chiếu CV
          </span>}
        </div>

        <div className="job-detail-body">
          <section className="detail-section">
            <h4>Mô tả công việc</h4>
            <p className="detail-text">{job.description}</p>
          </section>

          <section className="detail-section">
            <h4>Yêu cầu ứng viên</h4>
            <p className="detail-text">{job.requirementsText}</p>
          </section>

          {job.benefitsText && (
            <section className="detail-section">
              <h4>Quyền lợi được hưởng</h4>
              <p className="detail-text">{job.benefitsText}</p>
            </section>
          )}

          {job.matchingSupported === true && (
            <PreApplyMatchWidget
              job={job}
              session={session}
              onApplyJob={(appliedJob) => {
                onClose();
                onApply(appliedJob);
              }}
              onRequireLogin={() => {
                onClose();
                onRequireLogin?.();
              }}
              onOpenCvLibrary={() => {
                onClose();
                onOpenCvLibrary?.();
              }}
            />
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Đóng
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              onClose();
              onApply(job);
            }}
          >
            Ứng tuyển vị trí này
          </button>
        </div>
      </div>
    </div>
  );
};
