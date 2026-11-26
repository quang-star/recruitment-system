import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ApiClientError, apiRequest, refreshCurrentSession } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { CheckCircleIcon, CompanyIcon } from "../../shared/components/Icon";
import { routes } from "../../shared/router";
import { Button, Card, ErrorBanner } from "../../shared/ui";

type AcceptResult = { companyId: string; role: string; status: string };

export function AcceptCompanyInvitationPage({
  session,
  onLogout,
  isNarrowViewport
}: {
  session: AuthSession;
  onLogout: () => void;
  isNarrowViewport: boolean;
}) {
  const token = new URLSearchParams(useLocation().search).get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AcceptResult | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "Thiếu mã lời mời công ty.");

  async function accept() {
    if (!token || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (!result) {
        const accepted = await apiRequest<AcceptResult>("/api/v2/auth/company-invitations/accept", {
          method: "POST",
          accessToken: session.accessToken,
          body: JSON.stringify({ token })
        });
        setResult(accepted);
      }
      try {
        const refreshed = await refreshCurrentSession(session.accessToken);
        if (!refreshed.roles.includes("RECRUITER")) throw new Error("Recruiter role is not available in this session");
        setWorkspaceReady(true);
      } catch {
        setError("Bạn đã tham gia công ty. Hãy thử cập nhật phiên đăng nhập để mở không gian tuyển dụng.");
      }
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        onLogout();
        return;
      }
      setError(
        requestError instanceof ApiClientError
          ? requestError.error.message
          : "Không thể chấp nhận lời mời. Lời mời có thể đã hết hạn."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
      <Card padding="lg" className="w-full max-w-md space-y-5">
        <div className="flex items-center gap-2.5">
          <CompanyIcon size={18} className="text-brand-700 shrink-0" aria-hidden="true" />
          <h1 className="text-xl font-bold text-ink-900 m-0">Lời mời tham gia công ty</h1>
        </div>

        <p className="text-sm text-ink-600 m-0">
          Xác nhận lời mời để tham gia đội ngũ tuyển dụng của doanh nghiệp bằng tài khoản hiện tại.
        </p>
        {session.email && <p className="text-sm text-ink-700 break-all m-0">{session.email}</p>}

        {result && (
          <div
            className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            <CheckCircleIcon size={18} className="shrink-0 mt-0.5 text-emerald-600" />
            <span>Bạn đã tham gia công ty #{result.companyId} với vai trò {result.role}.</span>
          </div>
        )}

        {error && <ErrorBanner tone="error" message={error} />}

        <div className="flex flex-wrap gap-2.5 pt-2">
          {workspaceReady ? (
            <Link
              to={routes.recruiter.dashboard}
              className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors no-underline"
            >
              {isNarrowViewport ? "Xem yêu cầu mở trên máy tính" : "Mở không gian tuyển dụng"}
            </Link>
          ) : (
            <Button
              type="button"
              className="flex-1 justify-center"
              disabled={!token || submitting}
              onClick={() => void accept()}
            >
              {submitting ? "Đang xử lý…" : result ? "Cập nhật phiên đăng nhập" : "Chấp nhận lời mời"}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={onLogout}>
            Đăng xuất
          </Button>
        </div>
      </Card>
    </div>
  );
}
