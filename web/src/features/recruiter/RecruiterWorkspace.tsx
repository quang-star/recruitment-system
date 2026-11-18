import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import {
  CloseIcon,
  CompanyIcon,
  DashboardIcon,
  JobsIcon,
  NotificationIcon,
  ProfileIcon,
  SecurityIcon
} from "../../shared/components/Icon";
import { BRAND_CONFIG } from "../../shared/config/brand";
import { WorkspaceNavItem, WorkspaceShell } from "../../shared/layout/WorkspaceShell";
import { EnsureRouter, routes, useSafeNavigate } from "../../shared/router";
import { Badge, Button, Card, ErrorBanner, Skeleton, cn } from "../../shared/ui";
import { AccountSecurityPanel } from "../auth/AccountSecurityPanel";
import { NotificationCenter } from "../notification/NotificationCenter";
import { getCompanyCover, getCompanyLogo } from "../public/companyData";
import { DashboardPanel } from "../system/DashboardPanel";
import { CompanyAccessPanel, CompanyMember } from "./CompanyAccessPanel";
import { RecruiterCandidatesView } from "./RecruiterCandidatesView";
import { RecruiterJobBoard } from "./RecruiterJobBoard";

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

type RecruiterView = "dashboard" | "jobs" | "candidates" | "company" | "notifications" | "settings";
const validViews: readonly RecruiterView[] = ["dashboard", "jobs", "candidates", "company", "notifications", "settings"];

const recruiterNav: WorkspaceNavItem<RecruiterView>[] = [
  { id: "dashboard", label: "Tổng quan", icon: <DashboardIcon size={18} /> },
  { id: "jobs", label: "Tin tuyển dụng", icon: <JobsIcon size={18} /> },
  { id: "candidates", label: "Ứng viên", icon: <ProfileIcon size={18} /> },
  { id: "company", label: "Công ty & Đội ngũ", icon: <CompanyIcon size={18} /> },
  { id: "notifications", label: "Thông báo", icon: <NotificationIcon size={18} /> },
  { id: "settings", label: "Cài đặt", icon: <SecurityIcon size={18} /> }
];

const recruiterRouteMap: Record<RecruiterView, string> = {
  dashboard: routes.recruiter.dashboard,
  jobs: routes.recruiter.jobs,
  candidates: routes.recruiter.applications,
  company: routes.recruiter.company,
  notifications: routes.recruiter.notifications,
  settings: "/recruiter/profile"
};

function resolveRecruiterView(
  pathname: string,
  search: string
): {
  view: RecruiterView;
  jobId: string | null;
  settingsTab?: "profile" | "security";
  companyTab?: "brand" | "legal" | "team";
} {
  const searchParams = new URLSearchParams(search);
  const queryView = searchParams.get("recruiter");
  if (queryView === "profile") return { view: "settings", jobId: null, settingsTab: "profile" };
  if (queryView === "security") return { view: "settings", jobId: null, settingsTab: "security" };
  if (queryView && validViews.includes(queryView as RecruiterView)) {
    return { view: queryView as RecruiterView, jobId: null };
  }
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === routes.recruiter.dashboard) return { view: "dashboard", jobId: null };
  if (normalized === routes.recruiter.applications) {
    return { view: "candidates", jobId: null };
  }
  if (normalized === routes.recruiter.jobs || normalized === routes.recruiter.newJob) {
    return { view: "jobs", jobId: null };
  }
  if (normalized.startsWith(`${routes.recruiter.jobs}/`)) {
    return { view: "jobs", jobId: normalized.slice(`${routes.recruiter.jobs}/`.length) || null };
  }
  if (normalized === routes.recruiter.company) {
    const tabParam = searchParams.get("tab");
    const companyTab =
      tabParam === "brand" || tabParam === "legal" || tabParam === "team" ? tabParam : undefined;
    return { view: "company", jobId: null, companyTab };
  }
  if (normalized === "/recruiter/profile") return { view: "settings", jobId: null, settingsTab: "profile" };
  if (normalized === routes.recruiter.notifications) return { view: "notifications", jobId: null };
  if (normalized === routes.recruiter.security) return { view: "settings", jobId: null, settingsTab: "security" };
  return { view: "dashboard", jobId: null };
}

const inputClass =
  "mt-1 h-10 w-full rounded-xl border border-border-strong bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-ink-500";
const textareaClass =
  "mt-1 w-full rounded-xl border border-border-strong bg-white p-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-slate-50 disabled:text-ink-500 leading-relaxed";
const labelClass = "block text-xs font-semibold text-ink-700";

function CompanyLogo({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const effectiveSrc = failedSrc === src ? "/logos/smartrecruitment.svg" : src;
  return (
    <img
      src={effectiveSrc}
      alt={alt}
      className={className}
      onError={() => {
        if (src !== "/logos/smartrecruitment.svg") setFailedSrc(src);
      }}
    />
  );
}

function slugifyCompanyName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function RecruiterWorkspaceContent({ session, onLogout }: RecruiterWorkspaceProps) {
  const location = useLocation();
  const navigate = useSafeNavigate();
  const resolved = resolveRecruiterView(location.pathname, location.search);

  const [profile, setProfile] = useState<RecruiterProfile | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfile);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompany);
  const [slugEdited, setSlugEdited] = useState(false);
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [uploadingCompanyImage, setUploadingCompanyImage] = useState<"logo" | "cover" | null>(null);
  const [draggingCompanyImage, setDraggingCompanyImage] = useState<"logo" | "cover" | null>(null);
  const [imagePreview, setImagePreview] = useState<{ kind: "logo" | "cover"; url: string } | null>(null);
  const imagePreviewUrl = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDashboardJobId, setSelectedDashboardJobId] = useState<string | null>(resolved.jobId);
  const [companyTab, setCompanyTab] = useState<"brand" | "legal" | "team">(resolved.companyTab ?? "brand");
  const [settingsTab, setSettingsTab] = useState<"profile" | "security">(resolved.settingsTab ?? "profile");

  const activeView = resolved.view;

  useEffect(() => {
    if (resolved.companyTab) {
      setCompanyTab(resolved.companyTab);
    }
  }, [resolved.companyTab]);

  useEffect(() => {
    if (resolved.settingsTab) {
      setSettingsTab(resolved.settingsTab);
    }
  }, [resolved.settingsTab]);

  useEffect(() => () => {
    if (imagePreviewUrl.current) URL.revokeObjectURL(imagePreviewUrl.current);
    imagePreviewUrl.current = null;
  }, []);

  function navigateToView(view: RecruiterView | "jobs?status=DRAFT", jobId?: string | null) {
    setSelectedDashboardJobId(jobId ?? null);
    if (view === "jobs?status=DRAFT") {
      navigate(`${routes.recruiter.jobs}?status=DRAFT`);
      return;
    }
    navigate(jobId ? routes.recruiter.jobDetail(jobId) : recruiterRouteMap[view]);
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [profileResult, companiesResult] = await Promise.all([
          apiRequest<RecruiterProfile>("/api/v2/recruiter/profile", { accessToken: session.accessToken }).catch(
            (requestError) => {
              if (requestError instanceof ApiClientError && requestError.status === 404) return null;
              throw requestError;
            }
          ),
          apiRequest<Company[]>("/api/v2/companies", { accessToken: session.accessToken })
        ]);
        if (!active) return;
        if (profileResult) {
          setProfile(profileResult);
          setProfileForm(toProfileForm(profileResult));
        }
        setCompanies(companiesResult);
        let initialCompany = companiesResult[0] ?? null;
        if (resolved.jobId && companiesResult.length > 1) {
          try {
            const linkedJob = await apiRequest<{ companyId: string }>(
              `/api/v2/jobs/${encodeURIComponent(resolved.jobId)}`,
              { accessToken: session.accessToken }
            );
            const matched = companiesResult.find((c) => c.companyId === linkedJob.companyId);
            if (matched) initialCompany = matched;
          } catch {
            // Keep default company selection if job lookup fails.
          }
        }
        if (active && initialCompany) {
          setSelectedCompanyId(initialCompany.companyId);
          setCompanyForm(toCompanyForm(initialCompany));
          setSlugEdited(true);
        }
      } catch (requestError) {
        if (!active) return;
        if (requestError instanceof ApiClientError && requestError.status === 401) onLogout();
        else if (requestError instanceof ApiClientError && requestError.status !== 404) {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [onLogout, session.accessToken, session.userId]);

  useEffect(() => {
    if (!resolved.jobId || companies.length <= 1) return;
    const controller = new AbortController();
    void apiRequest<{ companyId: string }>(`/api/v2/jobs/${encodeURIComponent(resolved.jobId)}`, {
      accessToken: session.accessToken,
      signal: controller.signal
    })
      .then((linkedJob) => {
        if (controller.signal.aborted) return;
        const matched = companies.find((c) => c.companyId === linkedJob.companyId);
        if (matched && matched.companyId !== selectedCompanyId) {
          setSelectedCompanyId(matched.companyId);
          setCompanyForm(toCompanyForm(matched));
          setSlugEdited(true);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [companies, resolved.jobId, selectedCompanyId, session.accessToken]);

  useEffect(() => {
    let active = true;
    if (!selectedCompanyId) {
      setMembers([]);
      return () => {
        active = false;
      };
    }
    void apiRequest<CompanyMember[]>(`/api/v2/companies/${selectedCompanyId}/members`, {
      accessToken: session.accessToken
    })
      .then((result) => {
        if (active) setMembers(result);
      })
      .catch((requestError) => {
        if (active) setError(getErrorMessage(requestError));
      });
    return () => {
      active = false;
    };
  }, [selectedCompanyId, session.accessToken, session.userId]);

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
    if (savingCompany || uploadingCompanyImage) return;
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
      setCompanies((current) =>
        selectedCompanyId ? current.map((company) => (company.companyId === saved.companyId ? saved : company)) : [...current, saved]
      );
      setSelectedCompanyId(saved.companyId);
      setCompanyForm(toCompanyForm(saved));
      setMessage(selectedCompanyId ? "Thông tin công ty đã được cập nhật." : "Công ty đã được tạo.");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setSavingCompany(false);
    }
  }

  async function uploadCompanyImage(kind: "logo" | "cover", file: File) {
    const company = companies.find((item) => item.companyId === selectedCompanyId);
    if (!company || !canManageCompany || savingCompany || uploadingCompanyImage) return;
    if (!["image/jpeg", "image/png"].includes(file.type) || file.size === 0 || file.size > 2 * 1024 * 1024) {
      setError("Chọn ảnh JPEG hoặc PNG có dung lượng tối đa 2 MB.");
      return;
    }
    const previewUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
    if (previewUrl) {
      if (imagePreviewUrl.current) URL.revokeObjectURL(imagePreviewUrl.current);
      imagePreviewUrl.current = previewUrl;
      setImagePreview({ kind, url: previewUrl });
    }
    setUploadingCompanyImage(kind);
    clearFeedback();
    const body = new FormData();
    body.append("file", file);
    try {
      const updated = await apiRequest<Company>(
        `/api/v2/companies/${encodeURIComponent(company.companyId)}/images/${kind}?version=${company.version}`,
        { method: "POST", accessToken: session.accessToken, body }
      );
      setCompanies((current) => current.map((item) => item.companyId === updated.companyId ? updated : item));
      setCompanyForm((current) => ({
        ...current,
        ...(kind === "logo" ? { logoUrl: updated.logoUrl ?? "" } : { coverImageUrl: updated.coverImageUrl ?? "" })
      }));
      setMessage(kind === "logo" ? "Logo công ty đã được cập nhật." : "Ảnh bìa công ty đã được cập nhật.");
    } catch (requestError) {
      handleRequestError(requestError);
    } finally {
      setUploadingCompanyImage(null);
      setImagePreview(null);
      if (previewUrl && imagePreviewUrl.current === previewUrl) {
        URL.revokeObjectURL(previewUrl);
        imagePreviewUrl.current = null;
      }
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
    setSlugEdited(true);
  }

  const selectedCompany = companies.find((company) => company.companyId === selectedCompanyId) ?? null;
  const currentMembership = members.find((member) => member.userId === session.userId && member.status === "ACTIVE");
  const canManageCompany = !selectedCompanyId || ["OWNER", "COMPANY_ADMIN"].includes(currentMembership?.role ?? "");
  const canRecruit = ["OWNER", "COMPANY_ADMIN", "RECRUITER"].includes(currentMembership?.role ?? "");
  const logoPreview = imagePreview?.kind === "logo" ? imagePreview.url : getCompanyLogo(companyForm.slug, companyForm.displayName, companyForm.logoUrl);
  const coverPreview = imagePreview?.kind === "cover" ? imagePreview.url : getCompanyCover(companyForm.slug, companyForm.displayName, companyForm.coverImageUrl);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-6 space-y-4">
        <p className="text-sm text-ink-500 m-0">Đang tải recruiter workspace…</p>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const brandLabel = BRAND_CONFIG.name ? `${BRAND_CONFIG.name} · ATS` : "Recruiter ATS";

  return (
    <WorkspaceShell
      activeItem={activeView}
      brandLabel={brandLabel}
      navItems={recruiterNav}
      onLogout={onLogout}
      onNavigate={(item) => navigateToView(item)}
      userLabel={profile?.displayName || "Recruiter"}
      accountRoleLabel="Nhà tuyển dụng"
      accountMenuItems={[
        {
          id: "profile",
          label: "Hồ sơ recruiter",
          icon: <ProfileIcon size={16} />,
          active: activeView === "settings" && settingsTab === "profile",
          onSelect: () => {
            if (navigate("/recruiter/profile")) {
              setSettingsTab("profile");
            }
          }
        },
        {
          id: "security",
          label: "Bảo mật tài khoản",
          icon: <SecurityIcon size={16} />,
          active: activeView === "settings" && settingsTab === "security",
          onSelect: () => {
            if (navigate(routes.recruiter.security)) {
              setSettingsTab("security");
            }
          }
        }
      ]}
      variant="recruiter"
    >
      {activeView === "dashboard" && (
        <DashboardPanel
          session={session}
          companyId={selectedCompanyId}
          onLogout={onLogout}
          onNavigate={(view) => navigateToView(view as RecruiterView | "jobs?status=DRAFT")}
          onOpenJob={(jobId) => {
            setSelectedDashboardJobId(jobId);
            navigate(routes.recruiter.applications);
          }}
          onEditJob={(jobId) => navigateToView("jobs", jobId)}
          candidateName={profile?.displayName}
        />
      )}

      {activeView === "settings" && (
        <div className="space-y-4 max-w-3xl">
          <div className="inline-flex rounded-lg border border-border-subtle bg-white p-1 text-xs font-semibold">
            <button
              type="button"
              className={cn(
                "rounded-md px-3.5 py-1.5 transition-colors cursor-pointer",
                settingsTab === "profile" ? "bg-slate-100 text-ink-900" : "text-ink-600 hover:text-ink-900"
              )}
              onClick={() => setSettingsTab("profile")}
            >
              Hồ sơ recruiter
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3.5 py-1.5 transition-colors cursor-pointer",
                settingsTab === "security" ? "bg-slate-100 text-ink-900" : "text-ink-600 hover:text-ink-900"
              )}
              onClick={() => setSettingsTab("security")}
            >
              Bảo mật tài khoản
            </button>
          </div>

          {settingsTab === "profile" ? (
            <Card padding="lg">
              <form className="space-y-6" onSubmit={saveProfile}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 m-0">
                      Recruiter profile
                    </p>
                    <h2 className="text-lg font-bold text-ink-900 m-0 mt-0.5">Hồ sơ recruiter</h2>
                  </div>
                  <Badge tone="neutral">{profile ? `v${profile.version}` : "Mới"}</Badge>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass + " sm:col-span-2"}>
                    Tên hiển thị
                    <input
                      className={inputClass}
                      value={profileForm.displayName}
                      maxLength={160}
                      required
                      onChange={(event) => setProfileForm({ ...profileForm, displayName: event.target.value })}
                    />
                  </label>
                  <label className={labelClass}>
                    Chức danh
                    <input
                      className={inputClass}
                      value={profileForm.businessTitle}
                      maxLength={160}
                      placeholder="Ví dụ: Talent Acquisition Lead"
                      onChange={(event) => setProfileForm({ ...profileForm, businessTitle: event.target.value })}
                    />
                  </label>
                  <label className={labelClass}>
                    Số điện thoại
                    <input
                      className={inputClass}
                      value={profileForm.businessPhone}
                      maxLength={32}
                      placeholder="+84 90 123 4567"
                      onChange={(event) => setProfileForm({ ...profileForm, businessPhone: event.target.value })}
                    />
                  </label>
                </div>

                {message && <ErrorBanner tone="success" message={message} />}
                {error && <ErrorBanner tone="error" message={error} />}

                <div className="flex justify-end border-t border-border-subtle pt-4">
                  <Button type="submit" variant="primary" disabled={savingProfile} loading={savingProfile}>
                    {savingProfile ? "Đang lưu…" : "Lưu hồ sơ"}
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <AccountSecurityPanel session={session} onLogout={onLogout} />
          )}
        </div>
      )}

      {activeView === "company" && (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr] items-start">
          <aside className="space-y-4">
            <Card padding="md" className="space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700 m-0">Enterprise</p>
                  <h3 className="text-base font-bold text-ink-900 m-0 mt-0.5">Công ty của tôi</h3>
                </div>
                <Badge tone="neutral">{companies.length} công ty</Badge>
              </div>

              {companies.length === 0 ? (
                <p className="text-xs text-ink-500 m-0">Chưa có công ty. Tạo công ty đầu tiên ở bên cạnh.</p>
              ) : (
                <div className="space-y-2">
                  {companies.map((company) => {
                    const selected = company.companyId === selectedCompanyId;
                    return (
                      <button
                        key={company.companyId}
                        type="button"
                        disabled={!!uploadingCompanyImage || savingCompany}
                        onClick={() => selectCompany(company)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition-colors cursor-pointer",
                          selected
                            ? "border-brand-600 bg-brand-50/60"
                            : "border-border-subtle bg-white hover:border-border-strong hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CompanyLogo
                            src={getCompanyLogo(company.slug, company.displayName, company.logoUrl)}
                            alt={company.displayName}
                            className="h-9 w-9 shrink-0 rounded-lg border border-border-subtle object-contain bg-white p-1"
                          />
                          <div className="min-w-0">
                            <strong className="block text-sm font-semibold text-ink-900 truncate">
                              {company.displayName}
                            </strong>
                            <small className="block text-xs text-ink-500 truncate">{company.slug}</small>
                          </div>
                        </div>
                        <Badge
                          tone={
                            company.status === "ACTIVE"
                              ? "success"
                              : company.status === "PENDING"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {company.status === "ACTIVE"
                            ? "Đang hoạt động"
                            : company.status === "PENDING"
                              ? "Chờ duyệt"
                              : company.status === "SUSPENDED"
                                ? "Tạm ngưng"
                                : "Đã đóng"}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}

              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                disabled={!!uploadingCompanyImage || savingCompany}
                onClick={() => {
                  clearFeedback();
                  setSelectedCompanyId(null);
                  setCompanyForm(emptyCompany);
                  setSlugEdited(false);
                }}
              >
                + Tạo công ty mới
              </Button>
            </Card>
          </aside>

          <div className="space-y-5">
            {selectedCompanyId && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge
                    tone={
                      selectedCompany?.status === "ACTIVE"
                        ? "success"
                        : selectedCompany?.status === "PENDING"
                          ? "warning"
                          : "danger"
                    }
                  >
                    Trạng thái:{" "}
                    {selectedCompany?.status === "ACTIVE"
                      ? "Đang hoạt động (ACTIVE)"
                      : selectedCompany?.status === "PENDING"
                        ? "Chờ duyệt (PENDING)"
                        : selectedCompany?.status === "SUSPENDED"
                          ? "Tạm ngưng"
                          : "Đã đóng"}
                  </Badge>
                  <Badge
                    tone={
                      selectedCompany?.verificationStatus === "VERIFIED"
                        ? "brand"
                        : selectedCompany?.verificationStatus === "REJECTED"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    Xác minh pháp lý:{" "}
                    {selectedCompany?.verificationStatus === "VERIFIED"
                      ? "Đã xác minh (VERIFIED)"
                      : selectedCompany?.verificationStatus === "PENDING"
                        ? "Đang chờ (PENDING)"
                        : selectedCompany?.verificationStatus === "REJECTED"
                          ? "Từ chối"
                          : "Chưa xác minh (UNVERIFIED)"}
                  </Badge>
                </div>

                <div className="inline-flex rounded-lg border border-border-subtle bg-slate-50 p-1 text-xs font-semibold">
                  {(
                    [
                      ["brand", "Thương hiệu tuyển dụng"],
                      ["legal", "Pháp lý & Xác minh"],
                      ["team", "Thành viên & Phân quyền"]
                    ] as const
                  ).map(([tabKey, tabLabel]) => (
                    <button
                      key={tabKey}
                      type="button"
                      className={cn(
                        "rounded-md px-3 py-1.5 transition-colors cursor-pointer",
                        companyTab === tabKey ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900"
                      )}
                      onClick={() => setCompanyTab(tabKey)}
                    >
                      {tabLabel}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(!selectedCompanyId || companyTab !== "team") && (
              <Card padding="lg">
                <form className="space-y-5" onSubmit={saveCompany}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle pb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 m-0">
                        {!selectedCompanyId
                          ? "Hồ sơ doanh nghiệp"
                          : companyTab === "brand"
                            ? "Thương hiệu tuyển dụng"
                            : "Pháp lý & Xác minh"}
                      </p>
                      <h3 className="text-lg font-bold text-ink-900 m-0 mt-0.5">
                        {selectedCompanyId ? "Cập nhật công ty" : "Tạo công ty"}
                      </h3>
                    </div>
                    {selectedCompanyId && <Badge tone="success">Đang quản lý</Badge>}
                  </div>

                  <fieldset className="border-0 p-0 m-0 min-w-0 space-y-5" disabled={!canManageCompany || !!uploadingCompanyImage}>
                    {(!selectedCompanyId || companyTab === "brand") && (
                      <>
                        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-white">
                          <div
                            className="relative flex flex-wrap items-end gap-4 bg-slate-900 bg-cover bg-center p-5 min-h-[140px]"
                            style={{
                              backgroundImage: `linear-gradient(180deg, rgba(15, 23, 42, 0.28) 0%, rgba(15, 23, 42, 0.88) 100%), url("${coverPreview}")`
                            }}
                          >
                            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white p-1.5 shadow-card">
                              <CompanyLogo
                                src={logoPreview}
                                alt={companyForm.displayName || "Company Logo"}
                                className="h-full w-full object-contain"
                              />
                            </div>
                            <div className="text-white space-y-1">
                              <h4 className="text-lg font-bold text-white m-0">
                                {companyForm.displayName || "Tên công ty hiển thị"}
                              </h4>
                              <p className="text-xs text-slate-200 m-0">
                                <span>{companyForm.websiteUrl || "https://yourcompany.com"}</span>
                                {" • "}
                                <span>
                                  {companyForm.sizeRange ? `${companyForm.sizeRange} nhân sự` : "Quy mô chưa cập nhật"}
                                </span>
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-2.5 border-t border-border-subtle bg-slate-50 px-4 py-3 text-xs text-ink-700">
                            <span aria-hidden="true">💡</span>
                            <span className="leading-relaxed">
                              <strong>Bộ nhận diện thương hiệu:</strong> Logo và ảnh bìa này sẽ tự động xuất hiện đồng bộ trên trang thông tin công ty và{" "}
                              <strong>toàn bộ bài đăng tuyển dụng (JD)</strong> của doanh nghiệp. Bạn không cần tải lại ảnh khi tạo từng JD.
                            </span>
                          </div>
                        </div>

                        <div className="space-y-3 rounded-xl border border-border-subtle bg-slate-50/60 p-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            {([["logo", "Tải logo lên"], ["cover", "Tải ảnh bìa lên"]] as const).map(([kind, label]) => {
                              const disabled = !selectedCompanyId || !canManageCompany || !!uploadingCompanyImage || savingCompany;
                              return (
                                <div key={kind}>
                                  <p className="mb-1.5 mt-0 text-xs font-semibold text-ink-700">{label}</p>
                                  <label
                                    data-testid={`company-image-drop-${kind}`}
                                    className={cn(
                                      "flex min-h-[190px] flex-col items-center gap-3 rounded-xl border-2 border-dashed p-3 text-center transition-colors focus-within:ring-2 focus-within:ring-brand-500/30",
                                      disabled ? "cursor-not-allowed border-border-subtle bg-slate-100 opacity-70" : "cursor-pointer border-border-strong bg-white hover:border-brand-500 hover:bg-brand-50/30",
                                      draggingCompanyImage === kind && !disabled && "border-brand-600 bg-brand-50"
                                    )}
                                    onDragOver={(event) => {
                                      event.preventDefault();
                                      if (!disabled) setDraggingCompanyImage(kind);
                                    }}
                                    onDragLeave={(event) => {
                                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingCompanyImage(null);
                                    }}
                                    onDrop={(event) => {
                                      event.preventDefault();
                                      setDraggingCompanyImage(null);
                                      if (disabled) return;
                                      const files = event.dataTransfer.files;
                                      if (files.length !== 1) {
                                        setError("Vui lòng chọn một ảnh mỗi lần tải lên.");
                                        return;
                                      }
                                      void uploadCompanyImage(kind, files[0]);
                                    }}
                                  >
                                    <input
                                      type="file"
                                      aria-label={label}
                                      accept="image/jpeg,image/png"
                                      disabled={disabled}
                                      className="sr-only"
                                      onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        event.target.value = "";
                                        if (file) void uploadCompanyImage(kind, file);
                                      }}
                                    />
                                    <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg border border-border-subtle bg-slate-50">
                                      <img
                                        src={kind === "logo" ? logoPreview : coverPreview}
                                        alt={kind === "logo" ? "Xem trước logo công ty" : "Xem trước ảnh bìa công ty"}
                                        className={cn("h-full w-full", kind === "logo" ? "object-contain p-2" : "object-cover")}
                                      />
                                    </div>
                                    <span className="text-sm font-semibold text-brand-700">Kéo thả ảnh vào đây hoặc chọn ảnh</span>
                                    <span className="text-xs text-ink-500">JPEG, PNG · tối đa 2 MB</span>
                                  </label>
                                </div>
                              );
                            })}
                          </div>
                          <p className="m-0 text-xs text-ink-500">
                            {selectedCompanyId ? "JPEG hoặc PNG, tối đa 2 MB và 4096 × 4096 px. Ảnh được lưu ngay khi tải lên." : "Tạo công ty trước để tải logo và ảnh bìa lên."}
                          </p>
                          {uploadingCompanyImage && <p role="status" className="m-0 text-xs text-ink-500">Đang tải ảnh lên…</p>}
                          <div className="grid gap-4 sm:grid-cols-2">
                            <label className={labelClass}>
                              URL Logo thương hiệu
                              <input
                                type="text"
                                className={inputClass}
                                value={companyForm.logoUrl}
                                maxLength={1000}
                                placeholder="https://.../logo.png hoặc /logos/smartrecruitment.svg"
                                onChange={(event) => setCompanyForm({ ...companyForm, logoUrl: event.target.value })}
                              />
                            </label>
                            <label className={labelClass}>
                              URL Ảnh bìa / Banner
                              <input
                                type="text"
                                className={inputClass}
                                value={companyForm.coverImageUrl}
                                maxLength={1000}
                                placeholder="https://.../cover.jpg hoặc /companies/photos/workplace.webp"
                                onChange={(event) => setCompanyForm({ ...companyForm, coverImageUrl: event.target.value })}
                              />
                            </label>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-medium text-ink-600">Gợi ý ảnh mẫu:</span>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setCompanyForm((prev) => ({
                                  ...prev,
                                  coverImageUrl: "/companies/photos/workplace.webp"
                                }))
                              }
                            >
                              Ảnh văn phòng công nghệ
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setCompanyForm((prev) => ({
                                  ...prev,
                                  logoUrl: "/logos/smartrecruitment.svg"
                                }))
                              }
                            >
                              Logo mẫu
                            </Button>
                            {(companyForm.logoUrl || companyForm.coverImageUrl) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setCompanyForm((prev) => ({
                                    ...prev,
                                    logoUrl: "",
                                    coverImageUrl: ""
                                  }))
                                }
                              >
                                <CloseIcon size={13} aria-hidden="true" />
                                <span>Đặt lại mặc định</span>
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className={labelClass}>
                            Tên hiển thị
                            <input
                              className={inputClass}
                              value={companyForm.displayName}
                              maxLength={240}
                              required
                              onChange={(event) => {
                                const nextName = event.target.value;
                                setCompanyForm((prev) => ({
                                  ...prev,
                                  displayName: nextName,
                                  slug: !selectedCompanyId && !slugEdited ? slugifyCompanyName(nextName) : prev.slug
                                }));
                              }}
                            />
                          </label>
                          <label className={labelClass}>
                            Slug
                            <input
                              className={inputClass}
                              value={companyForm.slug}
                              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                              maxLength={160}
                              required
                              onChange={(event) => {
                                setSlugEdited(true);
                                setCompanyForm({ ...companyForm, slug: event.target.value });
                              }}
                            />
                          </label>
                          <label className={labelClass}>
                            Quy mô
                            <input
                              className={inputClass}
                              value={companyForm.sizeRange}
                              maxLength={30}
                              placeholder="51-200"
                              onChange={(event) => setCompanyForm({ ...companyForm, sizeRange: event.target.value })}
                            />
                          </label>
                          <label className={labelClass}>
                            Website
                            <input
                              type="url"
                              className={inputClass}
                              value={companyForm.websiteUrl}
                              maxLength={500}
                              placeholder="https://…"
                              onChange={(event) => setCompanyForm({ ...companyForm, websiteUrl: event.target.value })}
                            />
                          </label>
                        </div>

                        <label className={labelClass}>
                          Mô tả
                          <textarea
                            className={textareaClass}
                            value={companyForm.description}
                            maxLength={10000}
                            rows={4}
                            placeholder="Giới thiệu tầm nhìn, văn hóa làm việc và sứ mệnh công ty..."
                            onChange={(event) => setCompanyForm({ ...companyForm, description: event.target.value })}
                          />
                        </label>
                      </>
                    )}

                    {(!selectedCompanyId || companyTab === "legal") && (
                      <>
                        {selectedCompany?.status === "ACTIVE" && (
                          <ErrorBanner
                            tone="info"
                            message="Công ty đã được duyệt hoạt động (ACTIVE): Tên pháp lý, Quốc gia và Mã đăng ký được khóa cố định. Lưu ý: trạng thái hoạt động độc lập với xác minh pháp lý (verificationStatus)."
                          />
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className={labelClass}>
                            Tên pháp lý
                            <input
                              className={inputClass}
                              value={companyForm.legalName}
                              disabled={selectedCompany?.status === "ACTIVE"}
                              maxLength={240}
                              required
                              onChange={(event) => setCompanyForm({ ...companyForm, legalName: event.target.value })}
                            />
                          </label>
                          <label className={labelClass}>
                            Quốc gia
                            <input
                              className={inputClass}
                              value={companyForm.countryCode}
                              disabled={selectedCompany?.status === "ACTIVE"}
                              pattern="[A-Z]{2}"
                              maxLength={2}
                              required
                              onChange={(event) =>
                                setCompanyForm({ ...companyForm, countryCode: event.target.value.toUpperCase() })
                              }
                            />
                          </label>
                          <label className={labelClass + " sm:col-span-2"}>
                            Mã đăng ký
                            <input
                              className={inputClass}
                              value={companyForm.registrationNumber}
                              disabled={selectedCompany?.status === "ACTIVE"}
                              maxLength={80}
                              placeholder="Mã số thuế / Giấy phép ĐKKD"
                              onChange={(event) => setCompanyForm({ ...companyForm, registrationNumber: event.target.value })}
                            />
                          </label>
                        </div>
                      </>
                    )}

                    {message && <ErrorBanner tone="success" message={message} />}
                    {error && <ErrorBanner tone="error" message={error} />}

                    {canManageCompany && (
                      <div className="flex justify-end border-t border-border-subtle pt-4">
                        <Button type="submit" variant="primary" disabled={savingCompany || !!uploadingCompanyImage} loading={savingCompany}>
                          {savingCompany ? "Đang lưu…" : selectedCompanyId ? "Cập nhật công ty" : "Tạo công ty"}
                        </Button>
                      </div>
                    )}
                  </fieldset>
                </form>
              </Card>
            )}

            {selectedCompanyId && companyTab === "team" && (
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
          companyStatus={companies.find((company) => company.companyId === selectedCompanyId)?.status ?? "PENDING"}
          canRecruit={canRecruit}
          initialJobId={resolved.jobId ?? selectedDashboardJobId}
        />
      )}
      {activeView === "candidates" && (
        <RecruiterCandidatesView
          session={session}
          companyId={selectedCompanyId}
          canRecruit={canRecruit}
          initialJobId={selectedDashboardJobId}
          onOpenJobs={() => navigateToView("jobs")}
        />
      )}
      {activeView === "notifications" && <NotificationCenter session={session} onLogout={onLogout} />}
    </WorkspaceShell>
  );
}

export function RecruiterWorkspace(props: RecruiterWorkspaceProps) {
  return (
    <EnsureRouter>
      <RecruiterWorkspaceContent {...props} />
    </EnsureRouter>
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
