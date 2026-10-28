import { useUrlParams, useUrlView } from "../../shared/navigation";
import { FormEvent, useEffect, useState } from "react";

import { CandidateCvPanel } from "./CandidateCvPanel";
import { CandidateJobsPanel } from "./CandidateJobsPanel";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { AccountSecurityPanel } from "../auth/AccountSecurityPanel";
import { NotificationCenter } from "../notification/NotificationCenter";
import { CandidateDashboard } from "./CandidateDashboard";
import { PublicHomePage } from "../public/PublicHomePage";
import { CandidateView } from "./navigation";

type ProfileVisibility = "PRIVATE" | "APPLICATION_ONLY";

export type CandidateProfile = {
  candidateProfileId: string;
  userId: string;
  displayName: string;
  headline: string | null;
  locationText: string | null;
  visibility: ProfileVisibility;
  version: number;
  phoneNumber?: string | null;
  contactEmail?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
};

type ProfileForm = {
  displayName: string;
  headline: string;
  locationText: string;
  visibility: ProfileVisibility;
  phoneNumber: string;
  contactEmail: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  avatarUrl: string;
  bio: string;
};

type CandidateProfilePageProps = {
  session: AuthSession;
  onLogout: () => void;
};

const emptyForm: ProfileForm = {
  displayName: "",
  headline: "",
  locationText: "",
  visibility: "APPLICATION_ONLY",
  phoneNumber: "",
  contactEmail: "",
  linkedinUrl: "",
  githubUrl: "",
  portfolioUrl: "",
  avatarUrl: "",
  bio: ""
};

export function CandidateProfilePage({ session, onLogout }: CandidateProfilePageProps) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { navigate } = useUrlParams();
  const [activeView] = useUrlView<CandidateView>("candidate", ["dashboard", "profile", "cv", "jobs", "applications", "notifications", "security"], "jobs");
  function setActiveView(view: CandidateView) { navigate({ candidate: view === "jobs" ? null : view, auth: null, job: null }); }

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const current = await apiRequest<CandidateProfile>("/api/v2/candidates/me", {
          accessToken: session.accessToken
        });
        if (!active) return;
        setProfile(current);
        setForm(toForm(current));
      } catch (requestError) {
        if (!active) return;
        if (requestError instanceof ApiClientError && requestError.status === 404) {
          setMessage("Chưa có hồ sơ. Điền thông tin để tạo hồ sơ đầu tiên.");
        } else if (requestError instanceof ApiClientError && requestError.status === 401) {
          onLogout();
        } else {
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProfile();
    return () => { active = false; };
  }, [onLogout, session.userId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiRequest<CandidateProfile>("/api/v2/candidates/me", {
        method: "PUT",
        accessToken: session.accessToken,
        body: JSON.stringify({
          displayName: form.displayName,
          headline: form.headline || null,
          locationText: form.locationText || null,
          visibility: form.visibility,
          phoneNumber: form.phoneNumber || null,
          contactEmail: form.contactEmail || null,
          linkedinUrl: form.linkedinUrl || null,
          githubUrl: form.githubUrl || null,
          portfolioUrl: form.portfolioUrl || null,
          avatarUrl: form.avatarUrl || null,
          bio: form.bio || null,
          ...(profile ? { version: profile.version } : {})
        })
      });
      setProfile(updated);
      setForm(toForm(updated));
      setMessage("Hồ sơ đã được lưu.");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        onLogout();
      } else {
        setError(getErrorMessage(requestError));
      }
    } finally {
      setSaving(false);
    }
  }

  function updateField<K extends keyof ProfileForm>(field: K, value: ProfileForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <PublicHomePage session={session} onLoginSuccess={() => {}}
      candidate={{ name: profile?.displayName || "Ứng viên", activeView, onNavigate: setActiveView, onLogout }}>
      {activeView === "dashboard" && (
        <CandidateDashboard
          session={session}
          profile={profile}
          onNavigate={setActiveView}
          onOpenJob={(jobId) => navigate({ candidate: null, view: "search", job: jobId, auth: null })}
        />
      )}
      {activeView === "profile" && <section className="workspace-panel" aria-labelledby="profile-title">
        <div className="section-heading"><div><p className="eyebrow">Candidate profile</p><h2 id="profile-title">Hồ sơ ứng viên</h2></div><span>{profile ? `v${profile.version}` : "Mới"}</span></div>
        {loading ? <p role="status">Đang tải hồ sơ…</p> : <form className="profile-form" onSubmit={save}>

        {/* Avatar preview card */}
        <div className="candidate-avatar-preview-wrap">
          {form.avatarUrl ? (
            <img src={form.avatarUrl} alt="Avatar" className="candidate-avatar-preview-img" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
          ) : (
            <div className="candidate-avatar-fallback">
              {(form.displayName || "U").charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <strong>{form.displayName || "Ứng viên"}</strong>
            <p className="muted" style={{ margin: 0 }}>{form.headline || "Chưa có tiêu đề nghề nghiệp"}</p>
          </div>
        </div>

        {/* Section 1: Thông tin cơ bản */}
        <div className="candidate-profile-section">
          <h3 className="candidate-profile-section-title">Thông tin cơ bản</h3>
          <div className="profile-form-grid">
            <label>
              Tên hiển thị
              <input value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)}
                maxLength={120} required placeholder="Ví dụ: Nguyễn Văn A" />
            </label>
            <label>
              Ảnh đại diện (URL)
              <input type="url" value={form.avatarUrl} onChange={(event) => updateField("avatarUrl", event.target.value)}
                maxLength={500} placeholder="https://example.com/avatar.jpg" />
            </label>
            <label>
              Tiêu đề nghề nghiệp
              <input value={form.headline} onChange={(event) => updateField("headline", event.target.value)}
                maxLength={200} placeholder="Ví dụ: Senior Backend Engineer" />
            </label>
            <label>
              Địa điểm
              <input value={form.locationText} onChange={(event) => updateField("locationText", event.target.value)}
                maxLength={160} placeholder="Ví dụ: Thành phố Hồ Chí Minh" />
            </label>
          </div>
          <label>
            Giới thiệu bản thân
            <textarea value={form.bio} onChange={(event) => updateField("bio", event.target.value)}
              rows={4} maxLength={2000} placeholder="Tóm tắt ngắn về kinh nghiệm, định hướng nghề nghiệp và thế mạnh của bạn..." />
          </label>
        </div>

        {/* Section 2: Thông tin liên hệ & Mạng xã hội */}
        <div className="candidate-profile-section">
          <h3 className="candidate-profile-section-title">Thông tin liên hệ & Mạng xã hội</h3>
          <div className="profile-form-grid">
            <label>
              Số điện thoại
              <input type="tel" value={form.phoneNumber} onChange={(event) => updateField("phoneNumber", event.target.value)}
                maxLength={30} placeholder="Ví dụ: 0912345678" />
            </label>
            <label>
              Email liên hệ
              <input type="email" value={form.contactEmail} onChange={(event) => updateField("contactEmail", event.target.value)}
                maxLength={255} placeholder="Ví dụ: candidate@example.com" />
            </label>
            <label>
              LinkedIn URL
              <input type="url" value={form.linkedinUrl} onChange={(event) => updateField("linkedinUrl", event.target.value)}
                maxLength={300} placeholder="https://linkedin.com/in/username" />
            </label>
            <label>
              GitHub URL
              <input type="url" value={form.githubUrl} onChange={(event) => updateField("githubUrl", event.target.value)}
                maxLength={300} placeholder="https://github.com/username" />
            </label>
            <label>
              Portfolio / Website cá nhân
              <input type="url" value={form.portfolioUrl} onChange={(event) => updateField("portfolioUrl", event.target.value)}
                maxLength={300} placeholder="https://myportfolio.dev" />
            </label>
          </div>
        </div>

        {/* Section 3: Quyền riêng tư */}
        <div className="candidate-profile-section">
          <h3 className="candidate-profile-section-title">Quyền riêng tư</h3>
          <label>
            Quyền hiển thị
            <select value={form.visibility}
              onChange={(event) => setForm((current) => ({
                ...current,
                visibility: event.target.value as ProfileVisibility
              }))}>
              <option value="APPLICATION_ONLY">Chỉ hiển thị khi ứng tuyển</option>
              <option value="PRIVATE">Riêng tư</option>
            </select>
          </label>
          <small className="muted">
            Khi chọn &quot;Chỉ hiển thị khi ứng tuyển&quot;, thông tin liên hệ và hồ sơ của bạn chỉ được chia sẻ tới nhà tuyển dụng khi bạn nộp đơn ứng tuyển.
          </small>
        </div>

        {message && <p className="success-message" role="status">{message}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Đang lưu…" : profile ? "Cập nhật hồ sơ" : "Tạo hồ sơ"}
        </button>
        </form>}
      </section>}
      {activeView === "cv" && <CandidateCvPanel session={session} onFindJobs={() => setActiveView("jobs")} />}
      {activeView === "applications" && <CandidateJobsPanel session={session} applicationsOnly />}
      {activeView === "notifications" && <NotificationCenter session={session} onLogout={onLogout} />}
      {activeView === "security" && <AccountSecurityPanel session={session} onLogout={onLogout} />}
    </PublicHomePage>
  );
}

function toForm(profile: CandidateProfile): ProfileForm {
  return {
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    locationText: profile.locationText ?? "",
    visibility: profile.visibility,
    phoneNumber: profile.phoneNumber ?? "",
    contactEmail: profile.contactEmail ?? "",
    linkedinUrl: profile.linkedinUrl ?? "",
    githubUrl: profile.githubUrl ?? "",
    portfolioUrl: profile.portfolioUrl ?? "",
    avatarUrl: profile.avatarUrl ?? "",
    bio: profile.bio ?? ""
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.error.message
    : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
