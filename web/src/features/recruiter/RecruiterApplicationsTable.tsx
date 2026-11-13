import { Badge, cn } from "../../shared/ui";
import { MatchRating } from "../application/MatchRating";
import {
  ApplicationWithMatch,
  candidateDisplayName,
  candidateInitials,
  statusTone,
  translateApplicationStatus
} from "./recruiterApplicationTypes";

/** Master candidate table with selectable rows, match star ratings, and status badges. */
export function RecruiterApplicationsTable({
  applications,
  selectedId,
  onSelect
}: {
  applications: ApplicationWithMatch[];
  selectedId: string | null;
  onSelect: (applicationId: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-subtle bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">Danh sách ứng viên</caption>
        <thead>
          <tr className="border-b border-border-subtle bg-slate-50/90 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
            <th className="px-4 py-3">Hồ sơ</th>
            <th className="px-3 py-3">Ngày nộp</th>
            <th className="px-3 py-3">Trạng thái</th>
            <th className="px-4 py-3">Mức độ phù hợp</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {applications.map((application) => {
            const isSelected = (selectedId ?? applications[0]?.applicationId) === application.applicationId;
            return (
              <tr
                key={application.applicationId}
                className={cn("transition-colors hover:bg-slate-50/80", isSelected && "bg-brand-50/40")}
              >
                <td className="px-4 py-3 align-top">
                  <div className="flex items-start gap-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800">
                      {candidateInitials(application)}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="text-left text-sm font-semibold text-ink-900 hover:text-brand-700 cursor-pointer"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(application.applicationId)}
                      >
                        {candidateDisplayName(application)}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {application.candidateHeadline && (
                          <span className="text-xs text-ink-600">{application.candidateHeadline}</span>
                        )}
                        <small className="text-[11px] text-ink-500">Hồ sơ {application.applicationId.slice(0, 8)}</small>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3 align-top text-xs text-ink-600 whitespace-nowrap">
                  {new Date(application.appliedAt).toLocaleDateString("vi-VN")}
                </td>
                <td className="px-3 py-3 align-top">
                  <Badge tone={statusTone(application.status)}>{translateApplicationStatus(application.status)}</Badge>
                </td>
                <td className="px-4 py-3 align-top">
                  <MatchRating {...application} compact />
                  {application.match?.status === "DEGRADED" && (
                    <small className="mt-1 block text-[11px] font-medium text-amber-700">Cần kiểm tra thêm</small>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
