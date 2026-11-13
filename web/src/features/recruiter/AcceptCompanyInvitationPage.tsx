import { useState } from "react";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { CheckCircleIcon, CompanyIcon } from "../../shared/components/Icon";
import { Button, Card, ErrorBanner } from "../../shared/ui";

type AcceptResult = { companyId: string; role: string; status: string };

export function AcceptCompanyInvitationPage({
  session,
  onLogout
}: {
  session: AuthSession;
  onLogout: () => void;
}) {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AcceptResult | null>(null);
  const [error, setError] = useState<string | null>(token ? null : "Thiếu mã lời mời công ty.");

  async function accept() {
    if (!token || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const accepted = await apiRequest<AcceptResult>("/api/v2/companies/invitations/accept", {
        method: "POST",
        accessToken: session.accessToken,
        body: JSON.stringify({ token })
      });
      setResult(accepted);
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
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white shadow-xs">
            <CompanyIcon size={20} />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
              Cộng tác viên doanh nghiệp
            </p>
            <h1 className="text-xl font-bold text-ink-900 m-0">Lời mời tham gia công ty</h1>
          </div>
        </div>

        <p className="text-sm text-ink-600 m-0">
          Xác nhận lời mời để tham gia đội ngũ tuyển dụng của doanh nghiệp bằng tài khoản hiện tại.
        </p>

        {result && (
          <div
            className="flex items-start gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            <CheckCircleIcon size={18} className="shrink-0 mt-0.5 text-emerald-600" />
            <span>Bạn đã tham gia công ty #{result.companyId} với vai trò {result.role}.</span>
          </div>
        )}

        {error && <ErrorBanner tone="error" message={error} />}

        <div className="flex flex-wrap gap-2.5 pt-2">
          {result ? (
            <a
              href="/"
              className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors no-underline"
            >
              Mở không gian tuyển dụng
            </a>
          ) : (
            <Button
              type="button"
              className="flex-1 justify-center"
              disabled={!token || submitting}
              onClick={() => void accept()}
            >
              {submitting ? "Đang xử lý…" : "Chấp nhận lời mời"}
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
