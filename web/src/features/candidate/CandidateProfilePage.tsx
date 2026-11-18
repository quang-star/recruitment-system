import { FormEvent, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ApiClientError, apiDownload, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";
import { ProfileIcon, TrashIcon, UploadIcon } from "../../shared/components/Icon";
import { EnsureRouter, routes, useSafeNavigate } from "../../shared/router";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, cn, ErrorBanner, PageHeader, Skeleton } from "../../shared/ui";
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

function isSupportedAvatarFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png") return true;
  if (!mime) return /\.(jpe?g|png)$/i.test(file.name);
  return false;
}

function buildProfilePayload(source: ProfileFormState, version: number | null) {
  return {
    displayName: source.displayName.trim(),
    headline: source.headline.trim() || null,
    locationText: source.locationText.trim() || null,
    visibility: source.visibility,
    phoneNumber: source.phoneNumber.trim() || null,
    contactEmail: source.contactEmail.trim() || null,
    linkedinUrl: source.linkedinUrl.trim() || null,
    githubUrl: source.githubUrl.trim() || null,
    portfolioUrl: source.portfolioUrl.trim() || null,
    avatarUrl: source.avatarUrl.trim() || null,
    bio: source.bio.trim() || null,
    version,
  };
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
  const [failedAvatarUrl, setFailedAvatarUrl] = useState<string | null>(null);
  const [uploadedAvatar, setUploadedAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [draggingAvatar, setDraggingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const loadedUserIdRef = useRef<string | null>(null);

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
    if (loadedUserIdRef.current === session.userId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiRequest<CandidateProfile>("/api/v2/candidates/me", {
      accessToken: session.accessToken,
      signal: controller.signal,
    })
      .then((loaded) => {
        if (controller.signal.aborted) return;
        loadedUserIdRef.current = session.userId;
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
        setFailedAvatarUrl(null);
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        if (failure instanceof ApiClientError && failure.status === 401) {
          onLogout();
          return;
        }
        if (failure instanceof ApiClientError && failure.status === 404) {
          loadedUserIdRef.current = session.userId;
          setProfile(null);
          setForm(emptyForm);
          setFailedAvatarUrl(null);
          return;
        }
        setError(failure instanceof ApiClientError ? failure.error.message : "Không thể tải hồ sơ ứng viên.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [session.accessToken, session.userId, onLogout]);

  useEffect(() => {
    const path = profile?.avatarUrl;
    if (!path?.startsWith("/api/v2/candidates/me/avatar/")) {
      setUploadedAvatar(null);
      return;
    }
    const controller = new AbortController();
    let objectUrl: string | null = null;
    setUploadedAvatar(null);
    void apiDownload(path, { accessToken: session.accessToken, signal: controller.signal, headers: { Accept: "image/png" } })
      .then(({ blob }) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUploadedAvatar(objectUrl);
      })
      .catch(() => { if (!controller.signal.aborted) setUploadedAvatar(null); });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [profile?.avatarUrl, session.accessToken]);

  async function saveProfileRecord(payload: ReturnType<typeof buildProfilePayload>): Promise<CandidateProfile> {
    return apiRequest<CandidateProfile>("/api/v2/candidates/me", {
      method: "PUT",
      accessToken: session.accessToken,
      body: JSON.stringify(payload),
    });
  }

  async function uploadAvatar(file: File) {
    if (!isSupportedAvatarFile(file) || file.size <= 0 || file.size > 2 * 1024 * 1024) {
      setError("Chọn ảnh JPEG hoặc PNG có dung lượng tối đa 2 MB.");
      return;
    }
    if (!profile && !form.displayName.trim()) {
      setError("Vui lòng nhập Tên hiển thị trước khi tải ảnh đại diện.");
      return;
    }
    setUploadingAvatar(true);
    setError(null);
    setSaveMessage(null);
    try {
      let activeProfile = profile;
      if (!activeProfile) {
        activeProfile = await saveProfileRecord(buildProfilePayload(form, null));
        setProfile(activeProfile);
      }
      const body = new FormData();
      body.append("file", file);
      const updated = await apiRequest<CandidateProfile>(`/api/v2/candidates/me/avatar?version=${activeProfile.version}`, {
        method: "POST",
        accessToken: session.accessToken,
        body,
      });
      setProfile(updated);
      setForm((previous) => ({ ...previous, avatarUrl: updated.avatarUrl ?? "" }));
      setFailedAvatarUrl(null);
      setSaveMessage("Ảnh đại diện đã được cập nhật.");
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401) { onLogout(); return; }
      setError(failure instanceof ApiClientError ? failure.error.message : "Không thể cập nhật ảnh đại diện. Vui lòng thử lại.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function removeAvatar() {
    if (uploadingAvatar || saving) return;
    if (!profile) {
      setForm((previous) => ({ ...previous, avatarUrl: "" }));
      setUploadedAvatar(null);
      setFailedAvatarUrl(null);
      return;
    }
    setUploadingAvatar(true);
    setError(null);
    setSaveMessage(null);
    try {
      const updated = await saveProfileRecord({
        displayName: profile.displayName,
        headline: profile.headline,
        locationText: profile.locationText,
        visibility: profile.visibility,
        phoneNumber: profile.phoneNumber,
        contactEmail: profile.contactEmail,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        avatarUrl: null,
        bio: profile.bio,
        version: profile.version,
      });
      setProfile(updated);
      setForm((previous) => ({ ...previous, avatarUrl: "" }));
      setUploadedAvatar(null);
      setFailedAvatarUrl(null);
      setSaveMessage("Ảnh đại diện đã được xóa.");
    } catch (failure) {
      if (failure instanceof ApiClientError && failure.status === 401) { onLogout(); return; }
      setError(failure instanceof ApiClientError ? failure.error.message : "Không thể xóa ảnh đại diện. Vui lòng thử lại.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSubmitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadingAvatar) return;
    setSaving(true);
    setSaveMessage(null);
    setError(null);
    try {
      const updated = await saveProfileRecord(buildProfilePayload(form, profile ? profile.version : null));
      setProfile(updated);
      setFailedAvatarUrl(null);
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

  const savedAvatar = uploadedAvatar ?? safeExternalUrl(profile?.avatarUrl);
  const safeAvatar = form.avatarUrl.startsWith("/api/v2/candidates/me/avatar/") ? uploadedAvatar : safeExternalUrl(form.avatarUrl);
  const avatarHasError = Boolean(safeAvatar && failedAvatarUrl === safeAvatar);
  const hasAvatar = Boolean(profile?.avatarUrl || form.avatarUrl.trim());
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
        avatarUrl: savedAvatar,
        activeView,
        onNavigate: navigateView,
        onLogout,
      }}
    >
      {activeView === "dashboard" && (
        <CandidateDashboard
          session={session}
          profile={profile ? { ...profile, avatarUrl: savedAvatar } : null}
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
                    <div
                      data-testid="candidate-avatar-dropzone"
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!uploadingAvatar && !saving) setDraggingAvatar(true);
                      }}
                      onDragLeave={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setDraggingAvatar(false);
                        }
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        setDraggingAvatar(false);
                        if (uploadingAvatar || saving) return;
                        const files = event.dataTransfer.files;
                        if (files.length !== 1) {
                          setError("Vui lòng chọn một ảnh mỗi lần tải lên.");
                          return;
                        }
                        void uploadAvatar(files[0]);
                      }}
                      className={cn(
                        "rounded-2xl border-2 border-dashed p-4 sm:p-5 transition-colors",
                        draggingAvatar
                          ? "border-brand-600 bg-brand-50/70"
                          : "border-border-strong bg-slate-50/70"
                      )}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-white shadow-xs">
                          {safeAvatar && !avatarHasError ? (
                            <img
                              src={safeAvatar}
                              alt="Xem trước ảnh đại diện"
                              referrerPolicy="no-referrer"
                              onError={() => setFailedAvatarUrl(safeAvatar)}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-brand-100 text-xl font-bold text-brand-700">
                              {initials || <ProfileIcon size={26} />}
                            </div>
                          )}
                          {uploadingAvatar && (
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 flex items-center justify-center bg-white/80"
                            >
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink-900">Ảnh đại diện</span>
                            {safeAvatar && !avatarHasError && (
                              <Badge tone="success">Đang hiển thị</Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2.5">
                            <label
                              className={cn(
                                "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-colors focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-500/25",
                                uploadingAvatar || saving
                                  ? "cursor-not-allowed border-border-subtle bg-slate-100 text-ink-400"
                                  : "cursor-pointer border-brand-200 bg-white text-brand-700 shadow-xs hover:border-brand-400 hover:bg-brand-50"
                              )}
                            >
                              <input
                                ref={avatarInputRef}
                                type="file"
                                aria-label="Ảnh đại diện"
                                accept="image/jpeg,image/png"
                                disabled={uploadingAvatar || saving}
                                onChange={(event) => {
                                  const file = event.target.files?.[0];
                                  event.target.value = "";
                                  if (file) void uploadAvatar(file);
                                }}
                                className="sr-only"
                              />
                              <UploadIcon size={16} aria-hidden="true" />
                              <span>
                                {uploadingAvatar
                                  ? "Đang tải lên…"
                                  : hasAvatar
                                    ? "Thay ảnh khác"
                                    : "Chọn ảnh tải lên"}
                              </span>
                            </label>

                            {hasAvatar && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={uploadingAvatar || saving}
                                onClick={() => void removeAvatar()}
                                className="text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                              >
                                <TrashIcon size={15} aria-hidden="true" />
                                Xóa ảnh
                              </Button>
                            )}
                          </div>
                          <p className="m-0 text-xs leading-relaxed text-ink-500">
                            Kéo thả ảnh vào khung hoặc nhấn chọn tệp JPEG, PNG (tối đa 2 MB). Ảnh được lưu tự động ngay sau khi tải lên.
                          </p>
                          {!profile && !form.displayName.trim() && (
                            <p className="m-0 text-xs font-medium text-amber-700">
                              Nhập Tên hiển thị ở bên dưới trước khi tải ảnh cho hồ sơ mới.
                            </p>
                          )}
                          {uploadingAvatar && (
                            <p role="status" className="m-0 text-xs font-medium text-brand-700">
                              Đang cập nhật ảnh đại diện…
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

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
                        Liên kết chuyên môn
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

                        <label className="block text-sm font-medium text-ink-800 sm:col-span-2">
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
                      <Button type="submit" disabled={saving || uploadingAvatar}>
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
                    <button
                      type="button"
                      disabled={uploadingAvatar || saving}
                      onClick={() => avatarInputRef.current?.click()}
                      aria-label="Đổi ảnh đại diện từ thẻ xem trước"
                      title="Nhấn để chọn ảnh đại diện"
                      className="group relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-transparent p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed"
                    >
                      {safeAvatar && !avatarHasError ? (
                        <img
                          src={safeAvatar}
                          alt={candidateDisplayName}
                          referrerPolicy="no-referrer"
                          onError={() => setFailedAvatarUrl(safeAvatar)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full bg-brand-100 text-brand-700 font-bold text-lg flex items-center justify-center">
                          {initials || <ProfileIcon size={22} />}
                        </div>
                      )}
                      <span
                        aria-hidden="true"
                        className="absolute inset-x-0 bottom-0 bg-slate-900/65 py-0.5 text-[10px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      >
                        Đổi ảnh
                      </span>
                    </button>
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
