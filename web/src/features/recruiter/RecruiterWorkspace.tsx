import { useUrlView } from "../../shared/navigation";
import { FormEvent, useEffect, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { RecruiterJobBoard } from "./RecruiterJobBoard";
import { AccountSecurityPanel } from "../auth/AccountSecurityPanel";
import { CompanyAccessPanel, CompanyMember } from "./CompanyAccessPanel";
import { NotificationCenter } from "../notification/NotificationCenter";
import { DashboardPanel } from "../system/DashboardPanel";
import { WorkspaceNavItem, WorkspaceShell } from "../../shared/layout/WorkspaceShell";
import {
  CompanyIcon,
  DashboardIcon,
  JobsIcon,
  NotificationIcon,
  ProfileIcon,
  SecurityIcon
} from "../../shared/components/Icon";
import { getCompanyLogo, getCompanyCover } from "../public/companyData";

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
  logoUrl: string | null;
  coverImageUrl: string | null;
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
  logoUrl: string;
  coverImageUrl: string;
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
  sizeRange: "",
  logoUrl: "",
  coverImageUrl: ""
};

type RecruiterView = "dashboard" | "jobs" | "company" | "profile" | "notifications" | "security";
const recruiterNav: WorkspaceNavItem<RecruiterView>[] = [
  { id: "dashboard", label: "Tổng quan", icon: <DashboardIcon size={18} /> },
  { id: "jobs", label: "Tin & ứng viên", icon: <JobsIcon size={18} /> },
  { id: "company", label: "Công ty & thành viên", icon: <CompanyIcon size={18} /> },
  { id: "profile", label: "Hồ sơ recruiter", icon: <ProfileIcon size={18} /> },
  { id: "notifications", label: "Thông báo", icon: <NotificationIcon size={18} /> },
  { id: "security", label: "Bảo mật", icon: <SecurityIcon size={18} /> }
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
  const [activeView, setActiveView] = useUrlView<RecruiterView>("recruiter", ["dashboard", "jobs", "company", "profile", "notifications", "security"], "dashboard");
  const [selectedDashboardJobId, setSelectedDashboardJobId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [profileResult, companiesResult] = await Promise.all([
          apiRequest<RecruiterProfile>("/api/v2/recruiter/profile", { accessToken: session.accessToken })
            .catch((requestError) => {
              if (requestError instanceof ApiClientError && requestError.status === 404) return null;
              throw requestError;
            }),
          apiRequest<Company[]>("/api/v2/companies", { accessToken: session.accessToken })
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
  }, [onLogout, session.userId]);

  useEffect(() => {
    let active = true;
    if (!selectedCompanyId) { setMembers([]); return () => { active = false; }; }
    void apiRequest<CompanyMember[]>(`/api/v2/companies/${selectedCompanyId}/members`, {
      accessToken: session.accessToken
    }).then((result) => { if (active) setMembers(result); })
      .catch((requestError) => { if (active) setError(getErrorMessage(requestError)); });
    return () => { active = false; };
  }, [selectedCompanyId, session.userId]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    clearFeedback();
    try {
      const updated = await apiRequest<RecruiterProfile>("/api/v2/recruiter/profile", {
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
        logoUrl: companyForm.logoUrl || null,
        coverImageUrl: companyForm.coverImageUrl || null,
        ...(selectedCompanyId && companies.find((company) => company.companyId === selectedCompanyId)
          ? { version: companies.find((company) => company.companyId === selectedCompanyId)?.version }
          : {})
      };
      const method = selectedCompanyId ? "PUT" : "POST";
      const path = selectedCompanyId ? `/api/v2/companies/${selectedCompanyId}` : "/api/v2/companies";
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
    <WorkspaceShell
      activeItem={activeView}
      brandLabel="Recruiter ATS"
      eyebrow="Không gian nhà tuyển dụng"
      navItems={recruiterNav}
      onLogout={onLogout}
      onNavigate={setActiveView}
      title={recruiterNav.find((item) => item.id === activeView)?.label ?? "Tổng quan"}
      userLabel={profile?.displayName || "Recruiter"}
      variant="recruiter"
    >
      {activeView === "dashboard" && (
        <DashboardPanel
          session={session}
          companyId={selectedCompanyId}
          onLogout={onLogout}
          onNavigate={(view) => setActiveView(view as RecruiterView)}
          onOpenJob={(jobId) => {
            setSelectedDashboardJobId(jobId);
            setActiveView("jobs");
          }}
          candidateName={profile?.displayName}
        />
      )}

      {activeView === "profile" && (
        <form className="workspace-panel profile-form modern-profile-panel" onSubmit={saveProfile}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Recruiter profile</p>
              <h2>Hồ sơ recruiter</h2>
            </div>
            <span>{profile ? `v${profile.version}` : "Mới"}</span>
          </div>
          <div className="form-grid">
            <label>
              Tên hiển thị
              <input
                value={profileForm.displayName}
                maxLength={160}
                required
                onChange={(event) => setProfileForm({ ...profileForm, displayName: event.target.value })}
              />
            </label>
            <label>
              Chức danh
              <input
                value={profileForm.businessTitle}
                maxLength={160}
                placeholder="Ví dụ: Talent Acquisition Lead"
                onChange={(event) => setProfileForm({ ...profileForm, businessTitle: event.target.value })}
              />
            </label>
            <label>
              Số điện thoại
              <input
                value={profileForm.businessPhone}
                maxLength={32}
                placeholder="+84 90 123 4567"
                onChange={(event) => setProfileForm({ ...profileForm, businessPhone: event.target.value })}
              />
            </label>
          </div>
          {message && <p className="success-message" role="status">{message}</p>}
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="button-row form-submit-bar">
            <button type="submit" className="primary-action-btn" disabled={savingProfile}>
              {savingProfile ? "Đang lưu…" : "Lưu hồ sơ"}
            </button>
          </div>
        </form>
      )}

      {activeView === "company" && (
        <div className="company-workspace-layout">
          <div className="company-workspace-sidebar">
            <div className="workspace-panel company-list-panel">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Enterprise</p>
                  <h3>Công ty của tôi</h3>
                </div>
                <span className="count-badge">{companies.length} công ty</span>
              </div>
              {companies.length === 0 ? (
                <p className="muted">Chưa có công ty. Tạo công ty đầu tiên ở bên cạnh.</p>
              ) : (
                <div className="company-list">
                  {companies.map((company) => (
                    <button
                      key={company.companyId}
                      type="button"
                      className={`company-option ${company.companyId === selectedCompanyId ? "selected" : ""}`}
                      onClick={() => selectCompany(company)}
                    >
                      <div className="company-option-main">
                        <img
                          src={getCompanyLogo(company.slug, company.displayName, company.logoUrl)}
                          alt={company.displayName}
                          className="company-thumbnail-logo"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = "/logos/smartrecruitment.svg";
                          }}
                        />
                        <div className="company-item-meta">
                          <strong>{company.displayName}</strong>
                          <small>{company.slug}</small>
                        </div>
                      </div>
                      <span className={`status-pill ${company.verificationStatus === "VERIFIED" ? "success" : "warning"}`}>
                        {company.verificationStatus}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <button
                className="secondary-button full-width"
                type="button"
                onClick={() => {
                  clearFeedback();
                  setSelectedCompanyId(null);
                  setCompanyForm(emptyCompany);
                }}
              >
                + Tạo công ty mới
              </button>
            </div>
          </div>

          <div className="company-workspace-content">
            <form className="workspace-panel company-form modern-company-form" onSubmit={saveCompany}>
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Company profile</p>
                  <h3>{selectedCompanyId ? "Cập nhật công ty" : "Tạo công ty"}</h3>
                </div>
                {selectedCompanyId && (
                  <span className="status-pill success">Đang quản lý</span>
                )}
              </div>
              <fieldset className="permission-fieldset" disabled={!canManageCompany}>
                {/* Visual Branding & Live Preview Section */}
                <div className="company-branding-card">
                  <div
                    className="company-branding-banner"
                    style={{
                      backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.25) 0%, rgba(15, 23, 42, 0.88) 100%), url("${getCompanyCover(
                        companyForm.slug,
                        companyForm.displayName,
                        companyForm.coverImageUrl
                      )}")`
                    }}
                  >
                    <div className="company-branding-avatar-wrap">
                      <img
                        src={getCompanyLogo(companyForm.slug, companyForm.displayName, companyForm.logoUrl)}
                        alt={companyForm.displayName || "Company Logo"}
                        className="company-branding-logo-img"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = "/logos/smartrecruitment.svg";
                        }}
                      />
                    </div>
                    <div className="company-branding-badge-info">
                      <h4>{companyForm.displayName || "Tên công ty hiển thị"}</h4>
                      <p>
                        <span>{companyForm.websiteUrl || "https://yourcompany.com"}</span>
                        {" • "}
                        <span>{companyForm.sizeRange ? `${companyForm.sizeRange} nhân sự` : "Quy mô chưa cập nhật"}</span>
                      </p>
                    </div>
                  </div>
                  <div className="company-branding-hint">
                    <span className="hint-icon">💡</span>
                    <span>
                      <strong>Bộ nhận diện thương hiệu:</strong> Logo và ảnh bìa này sẽ tự động xuất hiện đồng bộ trên trang thông tin công ty và <strong>toàn bộ bài đăng tuyển dụng (JD)</strong> của doanh nghiệp. Bạn không cần tải lại ảnh khi tạo từng JD.
                    </span>
                  </div>
                </div>

                <div className="company-branding-fields">
                  <div className="form-grid">
                    <label>
                      URL Logo thương hiệu
                      <input
                        type="url"
                        value={companyForm.logoUrl}
                        maxLength={1000}
                        placeholder="https://.../logo.png hoặc /logos/fpt.svg"
                        onChange={(event) => setCompanyForm({ ...companyForm, logoUrl: event.target.value })}
                      />
                    </label>
                    <label>
                      URL Ảnh bìa / Banner
                      <input
                        type="url"
                        value={companyForm.coverImageUrl}
                        maxLength={1000}
                        placeholder="https://.../cover.jpg hoặc /companies/photos/workplace.webp"
                        onChange={(event) => setCompanyForm({ ...companyForm, coverImageUrl: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="company-branding-presets">
                    <span className="presets-label">Gợi ý ảnh mẫu:</span>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        setCompanyForm((prev) => ({
                          ...prev,
                          coverImageUrl: "/companies/photos/workplace.webp"
                        }))
                      }
                    >
                      🏢 Ảnh văn phòng công nghệ
                    </button>
                    <button
                      type="button"
                      className="preset-chip"
                      onClick={() =>
                        setCompanyForm((prev) => ({
                          ...prev,
                          logoUrl: "/logos/smartrecruitment.svg"
                        }))
                      }
                    >
                      🔷 Logo SmartRecruitment
                    </button>
                    {(companyForm.logoUrl || companyForm.coverImageUrl) && (
                      <button
                        type="button"
                        className="preset-chip reset"
                        onClick={() =>
                          setCompanyForm((prev) => ({
                            ...prev,
                            logoUrl: "",
                            coverImageUrl: ""
                          }))
                        }
                      >
                        ✕ Đặt lại mặc định
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-grid">
                  <label>
                    Tên pháp lý
                    <input
                      value={companyForm.legalName}
                      maxLength={240}
                      required
                      onChange={(event) => setCompanyForm({ ...companyForm, legalName: event.target.value })}
                    />
                  </label>
                  <label>
                    Tên hiển thị
                    <input
                      value={companyForm.displayName}
                      maxLength={240}
                      required
                      onChange={(event) => setCompanyForm({ ...companyForm, displayName: event.target.value })}
                    />
                  </label>
                  <label>
                    Slug
                    <input
                      value={companyForm.slug}
                      pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                      maxLength={160}
                      required
                      onChange={(event) => setCompanyForm({ ...companyForm, slug: event.target.value })}
                    />
                  </label>
                  <label>
                    Quốc gia
                    <input
                      value={companyForm.countryCode}
                      pattern="[A-Z]{2}"
                      maxLength={2}
                      required
                      onChange={(event) => setCompanyForm({ ...companyForm, countryCode: event.target.value.toUpperCase() })}
                    />
                  </label>
                  <label>
                    Quy mô
                    <input
                      value={companyForm.sizeRange}
                      maxLength={30}
                      placeholder="51-200"
                      onChange={(event) => setCompanyForm({ ...companyForm, sizeRange: event.target.value })}
                    />
                  </label>
                  <label>
                    Website
                    <input
                      type="url"
                      value={companyForm.websiteUrl}
                      maxLength={500}
                      placeholder="https://…"
                      onChange={(event) => setCompanyForm({ ...companyForm, websiteUrl: event.target.value })}
                    />
                  </label>
                </div>
                <label>
                  Mô tả
                  <textarea
                    value={companyForm.description}
                    maxLength={10000}
                    rows={4}
                    placeholder="Giới thiệu tầm nhìn, văn hóa làm việc và sứ mệnh công ty..."
                    onChange={(event) => setCompanyForm({ ...companyForm, description: event.target.value })}
                  />
                </label>
                <label>
                  Mã đăng ký
                  <input
                    value={companyForm.registrationNumber}
                    maxLength={80}
                    placeholder="Mã số thuế / Giấy phép ĐKKD"
                    onChange={(event) => setCompanyForm({ ...companyForm, registrationNumber: event.target.value })}
                  />
                </label>
                {message && <p className="success-message" role="status">{message}</p>}
                {error && <p className="error-message" role="alert">{error}</p>}
                {canManageCompany && (
                  <div className="button-row form-submit-bar">
                    <button type="submit" className="primary-action-btn" disabled={savingCompany}>
                      {savingCompany ? "Đang lưu…" : selectedCompanyId ? "Cập nhật công ty" : "Tạo công ty"}
                    </button>
                  </div>
                )}
              </fieldset>
            </form>

            {selectedCompanyId && (
              <CompanyAccessPanel
                session={session}
                companyId={selectedCompanyId}
                members={members}
                canManage={canManageCompany}
                onLogout={onLogout}
                onMemberUpdated={(updated) =>
                  setMembers((current) => current.map((member) => (member.memberId === updated.memberId ? updated : member)))
                }
              />
            )}
          </div>
        </div>
      )}

      {activeView === "jobs" && (
        <RecruiterJobBoard
          session={session}
          companyId={selectedCompanyId}
          canRecruit={canRecruit}
          initialJobId={selectedDashboardJobId}
        />
      )}
      {activeView === "notifications" && <NotificationCenter session={session} onLogout={onLogout} />}
      {activeView === "security" && <AccountSecurityPanel session={session} onLogout={onLogout} />}
    </WorkspaceShell>
  );
}

function toProfileForm(profile: RecruiterProfile): ProfileForm {
  return {
    displayName: profile.displayName,
    businessTitle: profile.businessTitle ?? "",
    businessPhone: profile.businessPhone ?? ""
  };
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
    sizeRange: company.sizeRange ?? "",
    logoUrl: company.logoUrl ?? "",
    coverImageUrl: company.coverImageUrl ?? ""
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.error.message : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
