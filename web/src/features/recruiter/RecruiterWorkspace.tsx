import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { RecruiterJobBoard } from "./RecruiterJobBoard";
import { AccountSecurityPanel } from "../auth/AccountSecurityPanel";
import { CompanyAccessPanel, CompanyMember } from "./CompanyAccessPanel";
import { NotificationCenter } from "../notification/NotificationCenter";
import { DashboardPanel } from "../system/DashboardPanel";
import { WorkspaceNavItem, WorkspaceShell } from "../../shared/layout/WorkspaceShell";

type RecruiterProfile = {
  recruiterProfileId: string;
  userId: string;
  displayName: string;
  businessTitle: string | null;
  businessPhone: string | null;
  version: number;
};

type Company = {
  companyId: string;
  legalName: string;
  displayName: string;
  slug: string;
  description: string | null;
  websiteUrl: string | null;
  countryCode: string;
  registrationNumber: string | null;
  sizeRange: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "CLOSED";
  verificationStatus: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  createdByUserId: string;
  version: number;
};

type RecruiterWorkspaceProps = {
  session: AuthSession;
  onLogout: () => void;
};

type ProfileForm = {
  displayName: string;
  businessTitle: string;
  businessPhone: string;
};

type CompanyForm = {
  legalName: string;
  displayName: string;
  slug: string;
  description: string;
  websiteUrl: string;
  countryCode: string;
  registrationNumber: string;
  sizeRange: string;
};

const emptyProfile: ProfileForm = { displayName: "", businessTitle: "", businessPhone: "" };
const emptyCompany: CompanyForm = {
  legalName: "",
  displayName: "",
  slug: "",
  description: "",
  websiteUrl: "",
  countryCode: "VN",
  registrationNumber: "",
  sizeRange: ""
};

type RecruiterView = "dashboard" | "jobs" | "company" | "profile" | "notifications" | "security";
const recruiterNav: WorkspaceNavItem<RecruiterView>[] = [
  { id: "dashboard", label: "Tổng quan", icon: "⌂" },
  { id: "jobs", label: "Tin & ứng viên", icon: "▦" },
  { id: "company", label: "Công ty & thành viên", icon: "◇" },
  { id: "profile", label: "Hồ sơ recruiter", icon: "◉" },
  { id: "notifications", label: "Thông báo", icon: "●" },
  { id: "security", label: "Bảo mật", icon: "⚿" }
];

export function RecruiterWorkspace({ session, onLogout }: RecruiterWorkspaceProps) {
  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfile);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompany);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<RecruiterView>("dashboard");

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [profileResult, companiesResult] = await Promise.all([
          apiRequest<RecruiterProfile>("/api/v1/recruiter/profile", { accessToken: session.accessToken })
            .catch((requestError) => {
              if (requestError instanceof ApiClientError && requestError.status === 404) return null;
              throw requestError;
            }),
          apiRequest<Company[]>("/api/v1/companies", { accessToken: session.accessToken })
        ]);
        if (!active) return;
        if (profileResult) {
          setProfile(profileResult);
          setProfileForm(toProfileForm(profileResult));
        }
        setCompanies(companiesResult);
        if (companiesResult[0]) {
          setSelectedCompanyId(companiesResult[0].companyId);
          setCompanyForm(toCompanyForm(companiesResult[0]));
        }
      } catch (requestError) {
        if (!active) return;
        if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
        else if (requestError instanceof ApiClientError && requestError.status !== 404) setError(getErrorMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [onLogout, session.accessToken]);

  useEffect(() => {
    let active = true;
    if (!selectedCompanyId) { setMembers([]); return () => { active = false; }; }
    void apiRequest<CompanyMember[]>(`/api/v1/companies/${selectedCompanyId}/members`, {
      accessToken: session.accessToken
    }).then((result) => { if (active) setMembers(result); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); });
    return () => { active = false; };
  }, [selectedCompanyId, session.accessToken]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    clearFeedback();
    try {
      const updated = await apiRequest<RecruiterProfile>("/api/v1/recruiter/profile", {
        method: "PUT",
        accessToken: session.accessToken,
        body: JSON.stringify({
          ...profileForm,
          businessTitle: profileForm.businessTitle || null,
          businessPhone: profileForm.businessPhone || null,
          ...(profile ? { version: profile.version } : {})
        })
      });
      setProfile(updated);
      setProfileForm(toProfileForm(updated));
      setMessage("Hồ sơ recruiter đã được lưu.");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingCompany) return;
    setSavingCompany(true);
    clearFeedback();
    try {
      const payload = {
        ...companyForm,
        description: companyForm.description || null,
        websiteUrl: companyForm.websiteUrl || null,
        registrationNumber: companyForm.registrationNumber || null,
        sizeRange: companyForm.sizeRange || null,
        ...(selectedCompanyId && companies.find((company) => company.companyId === selectedCompanyId)
          ? { version: companies.find((company) => company.companyId === selectedCompanyId)?.version }
          : {})
      };
      const method = selectedCompanyId ? "PUT" : "POST";
      const path = selectedCompanyId ? `/api/v1/companies/${selectedCompanyId}` : "/api/v1/companies";
      const saved = await apiRequest<Company>(path, {
        method,
        accessToken: session.accessToken,
        body: JSON.stringify(payload)
      });
      setCompanies((current) => selectedCompanyId
        ? current.map((company) => company.companyId === saved.companyId ? saved : company)
        : [...current, saved]);
      setSelectedCompanyId(saved.companyId);
      setCompanyForm(toCompanyForm(saved));
      setMessage(selectedCompanyId ? "Thông tin công ty đã được cập nhật." : "Công ty đã được tạo.");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setSavingCompany(false);
    }
  }

  function handleRequestError(requestError: unknown) {
    if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
    else setError(getErrorMessage(requestError));
  }

  function clearFeedback() {
    setMessage(null);
    setError(null);
  }

  function selectCompany(company: Company) {
    clearFeedback();
    setSelectedCompanyId(company.companyId);
    setCompanyForm(toCompanyForm(company));
  }

  const currentMembership = members.find((member) => member.userId === session.userId && member.status === "ACTIVE");
  const canManageCompany = !selectedCompanyId || ["OWNER", "COMPANY_ADMIN"].includes(currentMembership?.role ?? "");
  const canRecruit = ["OWNER", "COMPANY_ADMIN", "RECRUITER"].includes(currentMembership?.role ?? "");

  if (loading) return <section className="profile-card"><p>Đang tải recruiter workspace…</p></section>;

  return (
    <WorkspaceShell activeItem={activeView} brandLabel="Recruiter" eyebrow="Không gian nhà tuyển dụng"
      navItems={recruiterNav} onLogout={onLogout} onNavigate={setActiveView}
      title={recruiterNav.find((item) => item.id === activeView)?.label ?? "Tổng quan"}
      userLabel={profile?.displayName || "Recruiter"} variant="recruiter">
      {activeView === "dashboard" && <DashboardPanel session={session} companyId={selectedCompanyId} onLogout={onLogout} />}
      {activeView === "profile" && <form className="workspace-panel" onSubmit={saveProfile}>
        <div className="section-heading"><div><p className="eyebrow">Recruiter profile</p><h2>Hồ sơ recruiter</h2></div><span>{profile ? `v${profile.version}` : "Mới"}</span></div>
        <div className="form-grid">
          <label>Tên hiển thị<input value={profileForm.displayName} maxLength={160} required
            onChange={(event) => setProfileForm({ ...profileForm, displayName: event.target.value })} /></label>
          <label>Chức danh<input value={profileForm.businessTitle} maxLength={160}
            onChange={(event) => setProfileForm({ ...profileForm, businessTitle: event.target.value })} /></label>
          <label>Số điện thoại<input value={profileForm.businessPhone} maxLength={32}
            onChange={(event) => setProfileForm({ ...profileForm, businessPhone: event.target.value })} /></label>
        </div>
        {message && <p className="success-message" role="status">{message}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button type="submit" disabled={savingProfile}>{savingProfile ? "Đang lưu…" : "Lưu hồ sơ"}</button>
      </form>}
      {activeView === "company" && <>
      <div className="workspace-grid company-overview-grid">
        <div className="workspace-panel">
          <div className="section-heading"><h3>Công ty của tôi</h3><span>{companies.length} công ty</span></div>
          {companies.length === 0 ? <p className="muted">Chưa có công ty. Tạo công ty đầu tiên ở bên cạnh.</p> : (
            <div className="company-list">
              {companies.map((company) => (
                <button key={company.companyId} type="button"
                  className={`company-option ${company.companyId === selectedCompanyId ? "selected" : ""}`}
                  onClick={() => selectCompany(company)}>
                  <span><strong>{company.displayName}</strong><small>{company.slug}</small></span>
                  <span className="status-pill">{company.verificationStatus}</span>
                </button>
              ))}
            </div>
          )}
          <button className="secondary-button" type="button" onClick={() => {
            clearFeedback();
            setSelectedCompanyId(null);
            setCompanyForm(emptyCompany);
          }}>+ Tạo công ty mới</button>
        </div>
      </div>

      <form className="workspace-panel company-form" onSubmit={saveCompany}>
        <div className="section-heading"><div><p className="eyebrow">Company profile</p><h3>{selectedCompanyId ? "Cập nhật công ty" : "Tạo công ty"}</h3></div></div>
        <fieldset className="permission-fieldset" disabled={!canManageCompany}><div className="form-grid">
          <label>Tên pháp lý<input value={companyForm.legalName} maxLength={240} required
            onChange={(event) => setCompanyForm({ ...companyForm, legalName: event.target.value })} /></label>
          <label>Tên hiển thị<input value={companyForm.displayName} maxLength={240} required
            onChange={(event) => setCompanyForm({ ...companyForm, displayName: event.target.value })} /></label>
          <label>Slug<input value={companyForm.slug} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={160} required
            onChange={(event) => setCompanyForm({ ...companyForm, slug: event.target.value })} /></label>
          <label>Quốc gia<input value={companyForm.countryCode} pattern="[A-Z]{2}" maxLength={2} required
            onChange={(event) => setCompanyForm({ ...companyForm, countryCode: event.target.value.toUpperCase() })} /></label>
          <label>Quy mô<input value={companyForm.sizeRange} maxLength={30} placeholder="11-50"
            onChange={(event) => setCompanyForm({ ...companyForm, sizeRange: event.target.value })} /></label>
          <label>Website<input type="url" value={companyForm.websiteUrl} maxLength={500} placeholder="https://…"
            onChange={(event) => setCompanyForm({ ...companyForm, websiteUrl: event.target.value })} /></label>
        </div>
        <label>Mô tả<textarea value={companyForm.description} maxLength={10000} rows={4}
          onChange={(event) => setCompanyForm({ ...companyForm, description: event.target.value })} /></label>
        <label>Mã đăng ký<input value={companyForm.registrationNumber} maxLength={80}
          onChange={(event) => setCompanyForm({ ...companyForm, registrationNumber: event.target.value })} /></label>
        {message && <p className="success-message" role="status">{message}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        {canManageCompany && <button type="submit" disabled={savingCompany}>{savingCompany ? "Đang lưu…" : selectedCompanyId ? "Cập nhật công ty" : "Tạo công ty"}</button>}
        </fieldset>
      </form>
      {selectedCompanyId && <CompanyAccessPanel session={session} companyId={selectedCompanyId}
        members={members} canManage={canManageCompany} onLogout={onLogout}
        onMemberUpdated={(updated) => setMembers((current) => current.map((member) => member.memberId === updated.memberId ? updated : member))} />}
      </>}
      {activeView === "jobs" && <RecruiterJobBoard session={session} companyId={selectedCompanyId} canRecruit={canRecruit} />}
      {activeView === "notifications" && <NotificationCenter session={session} onLogout={onLogout} />}
      {activeView === "security" && <AccountSecurityPanel session={session} onLogout={onLogout} />}
    </WorkspaceShell>
  );
}

function toProfileForm(profile: RecruiterProfile): ProfileForm {
  return { displayName: profile.displayName, businessTitle: profile.businessTitle ?? "", businessPhone: profile.businessPhone ?? "" };
}

function toCompanyForm(company: Company): CompanyForm {
  return {
    legalName: company.legalName,
    displayName: company.displayName,
    slug: company.slug,
    description: company.description ?? "",
    websiteUrl: company.websiteUrl ?? "",
    countryCode: company.countryCode,
    registrationNumber: company.registrationNumber ?? "",
    sizeRange: company.sizeRange ?? ""
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
