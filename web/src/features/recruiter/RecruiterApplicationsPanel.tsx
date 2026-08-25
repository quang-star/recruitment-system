import { useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

type Application = { applicationId: string; candidateUserId: string; status: string; appliedAt: string; version: number; };
type Match = { status: string; finalScore: number; qualityFlags: string; };

export function RecruiterApplicationsPanel({ session, jobId }: { session: AuthSession; jobId: string | null }) {
  const [applications, setApplications] = useState<Array<Application & { match?: Match | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!jobId) { setApplications([]); return () => { active = false; }; }
    setLoading(true); setError(null);
    void apiRequest<Application[]>(`/api/v1/recruiter/applications?jobId=${jobId}`, { accessToken: session.accessToken })
      .then(async (items) => {
        const withMatches = await Promise.all(items.map(async (application) => {
          try {
            const match = await apiRequest<Match>(`/api/v1/applications/${application.applicationId}/match`, { accessToken: session.accessToken });
            return { ...application, match };
          } catch { return { ...application, match: null }; }
        }));
        if (active) setApplications(withMatches);
      })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [jobId, session.accessToken]);

  if (!jobId) return null;
  return <div className="workspace-panel recruiter-applications">
    <div className="section-heading"><div><p className="eyebrow">Pipeline</p><h3>Ứng viên</h3></div><span>{applications.length}</span></div>
    {loading && <p className="muted">Đang tải hồ sơ…</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    {!loading && !error && applications.length === 0 && <p className="muted">Chưa có ứng viên cho JD này.</p>}
    {applications.map((application) => <div className="application-item" key={application.applicationId}>
      <span><strong>{application.candidateUserId.slice(0, 8)}…</strong><small>{new Date(application.appliedAt).toLocaleString()}</small></span>
      <span className="status-pill">{application.status}</span>
      {application.match && <span className="match-score">{application.match.finalScore.toFixed(1)}/100</span>}
    </div>)}
  </div>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể tải danh sách ứng viên.";
}
