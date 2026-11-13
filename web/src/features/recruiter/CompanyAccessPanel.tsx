import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { Badge, Button, Card, ErrorBanner } from "../../shared/ui";

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
    void apiRequest<CompanyInvitation[]>(`/api/v2/companies/${companyId}/invitations`, {
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
      const created = await apiRequest<CompanyInvitation>(`/api/v2/companies/${companyId}/invitations`, {
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
      await apiRequest<void>(`/api/v2/companies/${companyId}/invitations/${invitation.invitationId}?version=${invitation.version}`, {
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
      const updated = await apiRequest<CompanyMember>(`/api/v2/companies/${companyId}/members/${member.memberId}`, {
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

  const fieldClass =
    "mt-1 h-9 w-full rounded-xl border border-border-strong bg-white px-3 text-sm text-ink-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-ink-400";

  return (
    <Card padding="lg" className="space-y-6">
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">Access control</p>
          <h3 className="text-lg font-bold text-ink-900 m-0 mt-0.5">Thành viên công ty</h3>
        </div>
        <Badge tone="neutral">{members.length} thành viên</Badge>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-ink-500 m-0">Đang tải hoặc chưa có thành viên.</p>
      ) : (
        <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-slate-50/50">
          {members.map((member) => (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={member.memberId}>
              <div>
                <p className="text-sm font-semibold text-ink-900 m-0">
                  {member.userId === session.userId ? "Bạn" : `${member.userId.slice(0, 8)}…`}
                </p>
                <p className="text-xs text-ink-500 m-0 mt-0.5">
                  Tham gia {new Date(member.joinedAt).toLocaleDateString("vi-VN")} · v{member.version}
                </p>
              </div>
              {canManage && member.role !== "OWNER" && member.status !== "LEFT" ? (
                <div className="grid grid-cols-2 gap-2.5 sm:w-auto w-full">
                  <label className="text-xs font-medium text-ink-600">
                    Vai trò
                    <select
                      aria-label={`Vai trò ${member.userId}`}
                      className={fieldClass}
                      value={member.role}
                      disabled={busyId === member.memberId}
                      onChange={(event) => void updateMember(member, event.target.value as CompanyMember["role"], member.status)}
                    >
                      <option value="COMPANY_ADMIN">COMPANY_ADMIN</option>
                      <option value="RECRUITER">RECRUITER</option>
                      <option value="VIEWER">VIEWER</option>
                    </select>
                  </label>
                  <label className="text-xs font-medium text-ink-600">
                    Trạng thái
                    <select
                      aria-label={`Trạng thái ${member.userId}`}
                      className={fieldClass}
                      value={member.status}
                      disabled={busyId === member.memberId}
                      onChange={(event) => void updateMember(member, member.role, event.target.value as CompanyMember["status"])}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="SUSPENDED">SUSPENDED</option>
                      <option value="LEFT">LEFT</option>
                    </select>
                  </label>
                </div>
              ) : (
                <Badge tone={member.status === "ACTIVE" ? "brand" : "neutral"}>
                  {member.role} · {member.status}
                </Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {!canManage && (
        <p className="text-xs text-ink-500 m-0">Chỉ OWNER hoặc COMPANY_ADMIN mới được mời và quản lý thành viên.</p>
      )}

      {canManage && (
        <div className="space-y-4 border-t border-border-subtle pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">Company invitations</p>
            <h3 className="text-base font-bold text-ink-900 m-0 mt-0.5">Mời thành viên</h3>
          </div>
          <form className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end" onSubmit={invite}>
            <label className="block text-xs font-semibold text-ink-700">
              Email recruiter
              <input
                type="email"
                className={fieldClass}
                value={inviteEmail}
                maxLength={320}
                required
                placeholder="recruiter@company.vn"
                onChange={(event) => setInviteEmail(event.target.value)}
              />
            </label>
            <label className="block text-xs font-semibold text-ink-700">
              Vai trò
              <select
                className={fieldClass}
                value={inviteRole}
                onChange={(event) => setInviteRole(event.target.value as CompanyInvitation["role"])}
              >
                <option value="COMPANY_ADMIN">Quản trị công ty</option>
                <option value="RECRUITER">Nhà tuyển dụng</option>
                <option value="VIEWER">Chỉ xem</option>
              </select>
            </label>
            <Button type="submit" disabled={inviting} loading={inviting} size="md">
              {inviting ? "Đang gửi…" : "Gửi lời mời"}
            </Button>
          </form>

          {loadingInvitations ? (
            <p className="text-sm text-ink-500 m-0">Đang tải lời mời…</p>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-ink-500 m-0">Chưa có lời mời nào.</p>
          ) : (
            <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-white">
              {invitations.map((invitation) => {
                const status = invitationStatus(invitation);
                const statusTone =
                  status === "ACCEPTED" ? "success" : status === "PENDING" ? "brand" : status === "REVOKED" ? "danger" : "neutral";
                return (
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={invitation.invitationId}>
                    <div>
                      <p className="text-sm font-semibold text-ink-900 m-0">{invitation.email}</p>
                      <p className="text-xs text-ink-500 m-0 mt-0.5">
                        {invitation.role} · hết hạn {new Date(invitation.expiresAt).toLocaleString("vi-VN")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={statusTone}>{status}</Badge>
                      {status === "PENDING" && (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busyId === invitation.invitationId}
                          onClick={() => void revoke(invitation)}
                        >
                          Thu hồi
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {message && <ErrorBanner tone="success" message={message} />}
      {error && <ErrorBanner tone="error" message={error} />}
    </Card>
  );
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

