import { useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

type Dashboard = { audience: "CANDIDATE" | "RECRUITER"; metrics: Record<string, number>; };
type Props = { session: AuthSession; companyId?: string | null; onLogout: () => void; };

const labels: Record<string, string> = {
  cvs: "CV", applications: "Hồ sơ ứng tuyển", underReview: "Đang xem xét",
  shortlisted: "Shortlist", jobs: "Tin tuyển dụng", publishedJobs: "Đang đăng",
  unreadNotifications: "Thông báo chưa đọc"
};

export function DashboardPanel({ session, companyId, onLogout }: Props) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (session.roles.includes("RECRUITER") && !companyId) { setDashboard(null); return () => { active = false; }; }
    const path = companyId ? `/api/v1/dashboard?companyId=${companyId}` : "/api/v1/dashboard";
    void apiRequest<Dashboard>(path, { accessToken: session.accessToken })
      .then((result) => { if (active) setDashboard(result); })
      .catch((requestError) => {
        if (!active) return;
        if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
        else setError(requestError instanceof ApiClientError ? requestError.error.message : "Không thể tải dashboard.");
      });
    return () => { active = false; };
  }, [companyId, onLogout, session.accessToken, session.roles]);

  if (!dashboard && !error) return <section className="workspace-panel"><p className="muted">Đang tải dashboard…</p></section>;
  return <section className="workspace-panel dashboard-panel" aria-labelledby="dashboard-title">
    <div className="section-heading"><div><p className="eyebrow">{dashboard?.audience ?? "Dashboard"}</p><h3 id="dashboard-title">Tổng quan nhanh</h3></div></div>
    {dashboard && <div className="metric-grid">{Object.entries(dashboard.metrics).map(([key, value]) => <div className="metric-card" key={key}><strong>{value}</strong><span>{labels[key] ?? key}</span></div>)}</div>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}

