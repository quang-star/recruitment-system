import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

export type CompanyMember = {
  memberId: string;
  companyId: string;
  userId: string;
  role: "OWNER" | "COMPANY_ADMIN" | "RECRUITER" | "VIEWER";
  status: "ACTIVE" | "SUSPENDED" | "LEFT";
  joinedAt: string;
  version: number;
};

type CompanyInvitation = {
  invitationId: string;
  companyId: string;
  email: string;
  role: "COMPANY_ADMIN" | "RECRUITER" | "VIEWER";
  invitedByUserId: string;
  expiresAt: string;
  acceptedByUserId: string | null;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  version: number;
};

type Props = {
  session: AuthSession;
  companyId: string;
  members: CompanyMember[];
  canManage: boolean;
  onMemberUpdated: (member: CompanyMember) => void;
  onLogout: () => void;
};

export function CompanyAccessPanel({ session, companyId, members, canManage, onMemberUpdated, onLogout }: Props) {
  const [invitations, setInvitations] = useState<CompanyInvitation[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CompanyInvitation["role"]>("RECRUITER");
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!canManage) { setInvitations([]); return () => { active = false; }; }
    setLoadingInvitations(true);
    void apiRequest<CompanyInvitation[]>(`/api/v1/companies/${companyId}/invitations`, {
      accessToken: session.accessToken
    }).then((result) => { if (active) setInvitations(result); })
      .catch((requestError) => {
        if (!active) return;
        if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
        else setError(errorMessage(requestError));
      })
      .finally(() => { if (active) setLoadingInvitations(false); });
    return () => { active = false; };
  }, [canManage, companyId, onLogout, session.accessToken]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inviting) return;
    setInviting(true);
    clearFeedback();
    try {
      const created = await apiRequest<CompanyInvitation>(`/api/v1/companies/${companyId}/invitations`, {
        method: "POST", accessToken: session.accessToken,
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      setInvitations((current) => [created, ...current]);
      setInviteEmail("");
      setMessage("Lời mời đã được gửi qua email và có hiệu lực trong 7 ngày.");
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setInviting(false);
    }
  }

  async function revoke(invitation: CompanyInvitation) {
    if (busyId) return;
    setBusyId(invitation.invitationId);
    clearFeedback();
    try {
      await apiRequest<void>(`/api/v1/companies/${companyId}/invitations/${invitation.invitationId}?version=${invitation.version}`, {
        method: "DELETE", accessToken: session.accessToken
      });
      setInvitations((current) => current.map((value) => value.invitationId === invitation.invitationId
        ? { ...value, revokedAt: new Date().toISOString(), version: value.version + 1 }
        : value));
      setMessage("Lời mời đã được thu hồi.");
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setBusyId(null);
    }
  }

  async function updateMember(member: CompanyMember, role: CompanyMember["role"], status: CompanyMember["status"]) {
    if (busyId || member.role === "OWNER" || member.status === "LEFT") return;
    setBusyId(member.memberId);
    clearFeedback();
    try {
      const updated = await apiRequest<CompanyMember>(`/api/v1/companies/${companyId}/members/${member.memberId}`, {
        method: "PATCH", accessToken: session.accessToken,
        body: JSON.stringify({ role, status, version: member.version })
      });
      onMemberUpdated(updated);
      setMessage("Quyền thành viên đã được cập nhật.");
    } catch (requestError) {
      handleError(requestError);
    } finally {
      setBusyId(null);
    }
  }

  function clearFeedback() { setMessage(null); setError(null); }
  function handleError(requestError: unknown) {
    if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
    else setError(errorMessage(requestError));
  }

  return <section className="workspace-panel company-access-panel">
    <div className="section-heading"><h3>Thành viên công ty</h3><span>{members.length}</span></div>
    {members.length === 0 ? <p className="muted">Đang tải hoặc chưa có thành viên.</p> : <div className="member-list">
      {members.map((member) => <div className="member-row member-management-row" key={member.memberId}>
        <span><strong>{member.userId === session.userId ? "Bạn" : `${member.userId.slice(0, 8)}…`}</strong>
          <small>Tham gia {new Date(member.joinedAt).toLocaleDateString("vi-VN")} · v{member.version}</small></span>
        {canManage && member.role !== "OWNER" && member.status !== "LEFT" ? <div className="member-controls">
          <label>Vai trò<select aria-label={`Vai trò ${member.userId}`} value={member.role} disabled={busyId === member.memberId}
            onChange={(event) => void updateMember(member, event.target.value as CompanyMember["role"], member.status)}>
            <option value="COMPANY_ADMIN">COMPANY_ADMIN</option><option value="RECRUITER">RECRUITER</option><option value="VIEWER">VIEWER</option>
          </select></label>
          <label>Trạng thái<select aria-label={`Trạng thái ${member.userId}`} value={member.status} disabled={busyId === member.memberId}
            onChange={(event) => void updateMember(member, member.role, event.target.value as CompanyMember["status"])}>
            <option value="ACTIVE">ACTIVE</option><option value="SUSPENDED">SUSPENDED</option><option value="LEFT">LEFT</option>
          </select></label>
        </div> : <span className="status-pill">{member.role} · {member.status}</span>}
      </div>)}
    </div>}
    {!canManage && <p className="muted">Chỉ OWNER hoặc COMPANY_ADMIN mới được mời và quản lý thành viên.</p>}

    {canManage && <>
      <div className="section-heading"><div><p className="eyebrow">Company invitations</p><h3>Mời thành viên</h3></div></div>
      <form className="invite-form" onSubmit={invite}>
        <label>Email recruiter<input type="email" value={inviteEmail} maxLength={320} required
          onChange={(event) => setInviteEmail(event.target.value)} /></label>
        <label>Vai trò<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as CompanyInvitation["role"])}>
          <option value="COMPANY_ADMIN">Quản trị công ty</option><option value="RECRUITER">Nhà tuyển dụng</option><option value="VIEWER">Chỉ xem</option>
        </select></label>
        <button type="submit" disabled={inviting}>{inviting ? "Đang gửi…" : "Gửi lời mời"}</button>
      </form>
      {loadingInvitations ? <p className="muted">Đang tải lời mời…</p> : invitations.length === 0 ? <p className="muted">Chưa có lời mời nào.</p> : <div className="invitation-list">
        {invitations.map((invitation) => {
          const status = invitationStatus(invitation);
          return <div className="invitation-row" key={invitation.invitationId}>
            <span><strong>{invitation.email}</strong><small>{invitation.role} · hết hạn {new Date(invitation.expiresAt).toLocaleString("vi-VN")}</small></span>
            <div className="button-row"><span className="status-pill">{status}</span>{status === "PENDING" && <button className="danger-button" type="button"
              disabled={busyId === invitation.invitationId} onClick={() => void revoke(invitation)}>Thu hồi</button>}</div>
          </div>;
        })}
      </div>}
    </>}
    {message && <p className="success-message" role="status">{message}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
  </section>;
}

function invitationStatus(invitation: CompanyInvitation): "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED" {
  if (invitation.acceptedAt) return "ACCEPTED";
  if (invitation.revokedAt) return "REVOKED";
  if (new Date(invitation.expiresAt).getTime() <= Date.now()) return "EXPIRED";
  return "PENDING";
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}

