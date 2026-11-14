import { FormEvent, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { ProfileIcon } from "../../shared/components/Icon";
import { EnsureRouter, routes, useSafeNavigate } from "../../shared/router";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ErrorBanner, PageHeader, Skeleton } from "../../shared/ui";
import { AccountSecurityPanel } from "../auth/AccountSecurityPanel";
import { NotificationCenter } from "../notification/NotificationCenter";
import { PublicHomePage } from "../public/PublicHomePage";
import { CandidateCvPanel } from "./CandidateCvPanel";
import { CandidateDashboard } from "./CandidateDashboard";
import { CandidateJobsPanel } from "./CandidateJobsPanel";
import { CandidateView } from "./navigation";

export type CandidateProfile = {
  candidateProfileId?: string;
  userId?: string;
  displayName: string;
  headline: string | null;
  locationText: string | null;
  visibility: "PRIVATE" | "APPLICATION_ONLY";
  version: number;
  phoneNumber: string | null;
  contactEmail: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  avatarUrl: string | null;
  bio: string | null;
};

type CandidateProfilePageProps = {
  session: AuthSession;
  onLogout: () => void;
};

type ProfileFormState = {
  displayName: string;
  headline: string;
  locationText: string;
  visibility: "PRIVATE" | "APPLICATION_ONLY";
  phoneNumber: string;
  contactEmail: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  avatarUrl: string;
  bio: string;
};

const ALLOWED_VIEWS: readonly CandidateView[] = [
  "dashboard",
  "profile",
  "cv",
  "jobs",
  "applications",
  "notifications",
  "security",
];

const emptyForm: ProfileFormState = {
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
  bio: "",
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-xl border border-border-strong bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

function safeExternalUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = new URL(raw.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function viewRoute(view: CandidateView): string {
  switch (view) {
    case "dashboard":
      return routes.candidate.dashboard;
    case "profile":
      return routes.candidate.profile;
    case "cv":
      return routes.candidate.cv;
    case "applications":
      return routes.candidate.applications;
    case "notifications":
      return routes.candidate.notifications;
    case "security":
      return routes.candidate.security;
    default:
      return routes.home;
  }
}

function CandidateProfilePageInner({ session, onLogout }: CandidateProfilePageProps) {
  const location = useLocation();
  const navigate = useSafeNavigate();
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [form, setForm] = useState<ProfileFormState>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const legacyView = searchParams.get("candidate");

  const activeView: CandidateView = (() => {
    if (legacyView && ALLOWED_VIEWS.includes(legacyView as CandidateView)) {
      return legacyView as CandidateView;
    }
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (path === "/candidate" || path === "/candidate/dashboard") return "dashboard";
    if (path === "/candidate/profile") return "profile";
    if (path === "/candidate/cv") return "cv";
    if (path === "/candidate/applications") return "applications";
    if (path === "/candidate/notifications") return "notifications";
    if (path === "/candidate/security") return "security";
    return "jobs";
  })();

  function navigateView(next: CandidateView) {
    navigate(viewRoute(next));
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiRequest<CandidateProfile>("/api/v2/candidates/me", {
      accessToken: session.accessToken,
      signal: controller.signal,
    })
      .then((loaded) => {
        if (controller.signal.aborted) return;
        setProfile(loaded);
        setForm({
          displayName: loaded.displayName ?? "",
          headline: loaded.headline ?? "",
          locationText: loaded.locationText ?? "",
          visibility: loaded.visibility ?? "APPLICATION_ONLY",
          phoneNumber: loaded.phoneNumber ?? "",
          contactEmail: loaded.contactEmail ?? "",
          linkedinUrl: loaded.linkedinUrl ?? "",
          githubUrl: loaded.githubUrl ?? "",
          portfolioUrl: loaded.portfolioUrl ?? "",
          avatarUrl: loaded.avatarUrl ?? "",
          bio: loaded.bio ?? "",
        });
        setAvatarError(false);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiClientError && failure.status === 401) {
          onLogout();
          return;
        }
        setError(failure instanceof ApiClientError ? failure.error.message : "Không thể tải hồ sơ ứng viên.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [session.accessToken, session.userId, onLogout]);

  async function handleSubmitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      const updated = await apiRequest<CandidateProfile>("/api/v2/candidates/me", {
        method: "PUT",
        accessToken: session.accessToken,
        body: JSON.stringify({
          displayName: form.displayName.trim(),
          headline: form.headline.trim() || null,
          locationText: form.locationText.trim() || null,
          visibility: form.visibility,
          phoneNumber: form.phoneNumber.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          linkedinUrl: form.linkedinUrl.trim() || null,
          githubUrl: form.githubUrl.trim() || null,
          portfolioUrl: form.portfolioUrl.trim() || null,
          avatarUrl: form.avatarUrl.trim() || null,
          bio: form.bio.trim() || null,
          version: profile?.version ?? 0,
        }),
      });
      setProfile(updated);
      setAvatarError(false);
      setSaveMessage("Hồ sơ đã được lưu.");
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401) {
        onLogout();
        return;
      }
      setError(failure instanceof ApiClientError ? failure.error.message : "Không thể cập nhật hồ sơ. Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  }

  const candidateDisplayName = profile?.displayName || form.displayName || "Ứng viên";

  const safeAvatar = safeExternalUrl(form.avatarUrl);
  const safeLinkedIn = safeExternalUrl(form.linkedinUrl);
  const safeGitHub = safeExternalUrl(form.githubUrl);
  const safePortfolio = safeExternalUrl(form.portfolioUrl);
  const initials = candidateDisplayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "UV";

  return (
    <PublicHomePage
      session={session}
      onLoginSuccess={() => {}}
      candidate={{
        name: candidateDisplayName,
        activeView,
        onNavigate: navigateView,
        onLogout,
      }}
    >
      {activeView === "dashboard" && (
        <CandidateDashboard
          session={session}
          profile={profile}
          onNavigate={navigateView}
          onOpenJob={(jobId) => navigate(routes.jobDetail(jobId))}
        />
      )}

      {activeView === "profile" && (
        <div className="space-y-6">
          <PageHeader
            eyebrow="Không gian Ứng viên"
            title="Hồ sơ ứng viên"
            subtitle="Cập nhật thông tin liên hệ, giới thiệu bản thân và kiểm soát mức độ hiển thị với nhà tuyển dụng."
          />

          {saveMessage && <ErrorBanner tone="success" message={saveMessage} />}
          {error && <ErrorBanner tone="error" message={error} />}

          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
              <Skeleton className="h-96" />
              <Skeleton className="h-72" />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
              <Card>
                <CardHeader>
                  <CardTitle>Thông tin cơ bản &amp; liên hệ</CardTitle>
                  <CardDescription>
                    Thông tin này chỉ chia sẻ khi bạn chủ động nộp hồ sơ ứng tuyển cho một vị trí.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmitProfile} className="space-y-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <label className="block text-sm font-medium text-ink-800">
                        <span>Tên hiển thị</span>
                        <input
                          type="text"
                          required
                          maxLength={120}
                          value={form.displayName}
                          onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
                          placeholder="Ví dụ: Nguyễn Văn An"
                          className={inputClass}
                        />
                      </label>

                      <label className="block text-sm font-medium text-ink-800">
                        <span>Chức danh mục tiêu</span>
                        <input
                          type="text"
                          maxLength={160}
                          value={form.headline}
                          onChange={(event) => setForm((prev) => ({ ...prev, headline: event.target.value }))}
                          placeholder="Ví dụ: Senior Backend Engineer"
                          className={inputClass}
                        />
                      </label>

                      <label className="block text-sm font-medium text-ink-800">
                        <span>Địa điểm</span>
                        <input
                          type="text"
                          maxLength={160}
                          value={form.locationText}
                          onChange={(event) => setForm((prev) => ({ ...prev, locationText: event.target.value }))}
                          placeholder="Ví dụ: TP. Hồ Chí Minh / Hà Nội"
                          className={inputClass}
                        />
                      </label>

                      <label className="block text-sm font-medium text-ink-800">
                        <span>Mức độ hiển thị hồ sơ</span>
                        <select
                          value={form.visibility}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              visibility: event.target.value as "PRIVATE" | "APPLICATION_ONLY",
                            }))
                          }
                          className={inputClass}
                        >
                          <option value="APPLICATION_ONLY">Chỉ chia sẻ khi ứng tuyển</option>
                          <option value="PRIVATE">Riêng tư (chỉ mình tôi xem)</option>
                        </select>
                      </label>

                      <label className="block text-sm font-medium text-ink-800">
                        <span>Số điện thoại</span>
                        <input
                          type="tel"
                          maxLength={40}
                          value={form.phoneNumber}
                          onChange={(event) => setForm((prev) => ({ ...prev, phoneNumber: event.target.value }))}
                          placeholder="09xx xxx xxx"
                          className={inputClass}
                        />
                      </label>

                      <label className="block text-sm font-medium text-ink-800">
                        <span>Email liên hệ</span>
                        <input
                          type="email"
                          maxLength={160}
                          value={form.contactEmail}
                          onChange={(event) => setForm((prev) => ({ ...prev, contactEmail: event.target.value }))}
                          placeholder="email@example.com"
                          className={inputClass}
                        />
                      </label>
                    </div>

                    <div className="pt-2 border-t border-border-subtle space-y-4">
                      <p className="text-xs font-bold uppercase tracking-wider text-ink-500 m-0">
                        Liên kết chuyên môn &amp; ảnh đại diện
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <label className="block text-sm font-medium text-ink-800">
                          <span>LinkedIn URL</span>
                          <input
                            type="url"
                            maxLength={255}
                            value={form.linkedinUrl}
                            onChange={(event) => setForm((prev) => ({ ...prev, linkedinUrl: event.target.value }))}
                            placeholder="https://linkedin.com/in/..."
                            className={inputClass}
                          />
                        </label>

                        <label className="block text-sm font-medium text-ink-800">
                          <span>GitHub URL</span>
                          <input
                            type="url"
                            maxLength={255}
                            value={form.githubUrl}
                            onChange={(event) => setForm((prev) => ({ ...prev, githubUrl: event.target.value }))}
                            placeholder="https://github.com/..."
                            className={inputClass}
                          />
                        </label>

                        <label className="block text-sm font-medium text-ink-800">
                          <span>Portfolio / Website cá nhân</span>
                          <input
                            type="url"
                            maxLength={255}
                            value={form.portfolioUrl}
                            onChange={(event) => setForm((prev) => ({ ...prev, portfolioUrl: event.target.value }))}
                            placeholder="https://..."
                            className={inputClass}
                          />
                        </label>

                        <label className="block text-sm font-medium text-ink-800">
                          <span>URL ảnh đại diện</span>
                          <input
                            type="url"
                            maxLength={255}
                            value={form.avatarUrl}
                            onChange={(event) => {
                              setAvatarError(false);
                              setForm((prev) => ({ ...prev, avatarUrl: event.target.value }));
                            }}
                            placeholder="https://..."
                            className={inputClass}
                          />
                        </label>
                      </div>
                    </div>

                    <label className="block text-sm font-medium text-ink-800">
                      <span>Giới thiệu bản thân</span>
                      <textarea
                        rows={4}
                        maxLength={2000}
                        value={form.bio}
                        onChange={(event) => setForm((prev) => ({ ...prev, bio: event.target.value }))}
                        placeholder="Tóm tắt định hướng nghề nghiệp, thế mạnh nổi bật hoặc dự án tiêu biểu của bạn…"
                        className="mt-1.5 w-full rounded-xl border border-border-strong bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                      />
                    </label>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border-subtle">
                      <span className="text-xs text-ink-500">
                        Phiên bản hồ sơ #{profile?.version ?? 0}
                      </span>
                      <Button type="submit" disabled={saving}>
                        {saving ? "Đang lưu…" : "Cập nhật hồ sơ"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>

              <Card className="lg:sticky lg:top-20">
                <CardHeader>
                  <CardTitle>Xem trước thẻ hồ sơ</CardTitle>
                  <CardDescription>Hiển thị tóm tắt thông tin cá nhân</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3.5">
                    {safeAvatar && !avatarError ? (
                      <img
                        src={safeAvatar}
                        alt={candidateDisplayName}
                        onError={() => setAvatarError(true)}
                        className="h-14 w-14 rounded-2xl object-cover border border-border-subtle shrink-0"
                      />
                    ) : (
                      <div className="h-14 w-14 rounded-2xl bg-brand-100 text-brand-700 font-bold text-lg flex items-center justify-center shrink-0">
                        {initials || <ProfileIcon size={22} />}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-base font-bold text-ink-900 truncate m-0">{candidateDisplayName}</p>
                      <p className="text-xs text-ink-600 truncate m-0 mt-0.5">
                        {form.headline.trim() || "Chưa thêm chức danh mục tiêu"}
                      </p>
                      {form.locationText.trim() && (
                        <p className="text-xs text-ink-500 m-0 mt-0.5">{form.locationText.trim()}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge tone={form.visibility === "PRIVATE" ? "neutral" : "info"}>
                      {form.visibility === "PRIVATE" ? "Hồ sơ riêng tư" : "Chia sẻ khi ứng tuyển"}
                    </Badge>
                  </div>

                  {form.bio.trim() && (
                    <p className="text-xs text-ink-600 leading-relaxed m-0 line-clamp-4">{form.bio.trim()}</p>
                  )}

                  {(safeLinkedIn || safeGitHub || safePortfolio) && (
                    <div className="pt-3 border-t border-border-subtle flex flex-wrap gap-2 text-xs">
                      {safeLinkedIn && (
                        <a
                          href={safeLinkedIn}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-brand-700 hover:underline"
                        >
                          LinkedIn
                        </a>
                      )}
                      {safeGitHub && (
                        <a
                          href={safeGitHub}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-brand-700 hover:underline"
                        >
                          GitHub
                        </a>
                      )}
                      {safePortfolio && (
                        <a
                          href={safePortfolio}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-brand-700 hover:underline"
                        >
                          Portfolio
                        </a>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      )}

      {activeView === "cv" && <CandidateCvPanel session={session} onLogout={onLogout} />}
      {activeView === "applications" && <CandidateJobsPanel session={session} applicationsOnly />}
      {activeView === "notifications" && <NotificationCenter session={session} onLogout={onLogout} />}
      {activeView === "security" && <AccountSecurityPanel session={session} onLogout={onLogout} />}
    </PublicHomePage>
  );
}

export function CandidateProfilePage(props: CandidateProfilePageProps) {
  return (
    <EnsureRouter>
      <CandidateProfilePageInner {...props} />
    </EnsureRouter>
  );
}
