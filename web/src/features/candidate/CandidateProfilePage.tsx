import { FormEvent, useEffect, useState } from "react";

import { CandidateCvPanel } from "./CandidateCvPanel";
import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession } from "../../shared/auth/session";

type ProfileVisibility = "PRIVATE" | "APPLICATION_ONLY";

type CandidateProfile = {
  candidateProfileId: string;
  userId: string;
  displayName: string;
  headline: string | null;
  locationText: string | null;
  visibility: ProfileVisibility;
  version: number;
};

type ProfileForm = {
  displayName: string;
  headline: string;
  locationText: string;
  visibility: ProfileVisibility;
};

type CandidateProfilePageProps = {
  session: AuthSession;
  onLogout: () => void;
};

const emptyForm: ProfileForm = {
  displayName: "",
  headline: "",
  locationText: "",
  visibility: "APPLICATION_ONLY"
};

export function CandidateProfilePage({ session, onLogout }: CandidateProfilePageProps) {
  const [profile, setProfile] = useState<CandidateProfile | null>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      try {
        const current = await apiRequest<CandidateProfile>("/api/v1/candidates/me", {
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
  }, [onLogout, session.accessToken]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiRequest<CandidateProfile>("/api/v1/candidates/me", {
        method: "PUT",
        accessToken: session.accessToken,
        body: JSON.stringify({
          displayName: form.displayName,
          headline: form.headline || null,
          locationText: form.locationText || null,
          visibility: form.visibility,
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

  function updateField(field: "displayName" | "headline" | "locationText", value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function logout() {
    onLogout();
  }

  if (loading) return <section className="profile-card"><p>Đang tải hồ sơ…</p></section>;

  return (
    <section className="profile-card" aria-labelledby="profile-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Candidate profile</p>
          <h2 id="profile-title">Hồ sơ ứng viên</h2>
        </div>
        <button className="secondary-button" type="button" onClick={logout}>Đăng xuất</button>
      </div>
      <p className="muted">User ID: {session.userId}</p>
      <form className="profile-form" onSubmit={save}>
        <label>
          Tên hiển thị
          <input value={form.displayName} onChange={(event) => updateField("displayName", event.target.value)}
            maxLength={120} required />
        </label>
        <label>
          Tiêu đề nghề nghiệp
          <input value={form.headline} onChange={(event) => updateField("headline", event.target.value)}
            maxLength={200} placeholder="Ví dụ: Backend Engineer" />
        </label>
        <label>
          Địa điểm
          <input value={form.locationText} onChange={(event) => updateField("locationText", event.target.value)}
            maxLength={160} placeholder="Ví dụ: Thành phố Hồ Chí Minh" />
        </label>
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
        {message && <p className="success-message" role="status">{message}</p>}
        {error && <p className="error-message" role="alert">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Đang lưu…" : profile ? "Cập nhật hồ sơ" : "Tạo hồ sơ"}
        </button>
      </form>
      <CandidateCvPanel session={session} />
    </section>
  );
}

function toForm(profile: CandidateProfile): ProfileForm {
  return {
    displayName: profile.displayName,
    headline: profile.headline ?? "",
    locationText: profile.locationText ?? "",
    visibility: profile.visibility
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof ApiClientError
    ? error.error.message
    : "Không thể kết nối tới Gateway. Vui lòng thử lại.";
}
