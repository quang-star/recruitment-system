import { useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { CompanyMember } from "./CompanyAccessPanel";

type Props = { session: AuthSession; onLogout: () => void; };
type State = { type: "idle" } | { type: "submitting" } | { type: "success"; member: CompanyMember } | { type: "error"; message: string };

export function AcceptCompanyInvitationPage({ session, onLogout }: Props) {
  const token = new URLSearchParams(window.location.search).get("token");
  const [state, setState] = useState<State>({ type: "idle" });

  async function accept() {
    if (!token || state.type === "submitting") return;
    setState({ type: "submitting" });
    try {
      const member = await apiRequest<CompanyMember>("/api/v1/companies/invitations/accept", {
        method: "POST", accessToken: session.accessToken, body: JSON.stringify({ token })
      });
      setState({ type: "success", member });
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) { onLogout(); return; }
      setState({ type: "error", message: requestError instanceof ApiClientError
        ? requestError.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại." });
    }
  }

  return <section className="verification-card" aria-live="polite">
    <p className="eyebrow">Company invitation</p><h2>Tham gia công ty</h2>
    {!token && <p className="error-message">Liên kết không chứa mã lời mời hợp lệ.</p>}
    {token && state.type === "idle" && <><p>Lời mời chỉ được chấp nhận khi email đăng nhập trùng với email người được mời.</p><button type="button" onClick={() => void accept()}>Chấp nhận lời mời</button></>}
    {state.type === "submitting" && <p>Đang xác nhận lời mời…</p>}
    {state.type === "error" && <><p className="error-message">{state.message}</p><button type="button" onClick={() => void accept()}>Thử lại</button></>}
    {state.type === "success" && <><p className="success-message">Bạn đã tham gia công ty với vai trò {state.member.role}.</p><a href="/">Mở recruiter workspace</a></>}
  </section>;
}
