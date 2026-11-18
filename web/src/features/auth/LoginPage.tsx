import { FormEvent, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { AuthSession, saveSession } from "../../shared/auth/session";
import { Button, ErrorBanner, cn } from "../../shared/ui";
import { GoogleSignIn } from "./GoogleSignIn";

type LoginResponse = AuthSession;

type GoogleProfileHint = {
  displayName: string;
  avatarUrl?: string | null;
  email?: string | null;
};

type GoogleLoginResponse = AuthSession & {
  newAccount?: boolean;
  googleProfile?: GoogleProfileHint | null;
};

function toAuthSession(response: GoogleLoginResponse): AuthSession {
  return {
    userId: response.userId,
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    accessTokenExpiresAt: response.accessTokenExpiresAt,
    refreshTokenExpiresAt: response.refreshTokenExpiresAt,
    roles: response.roles,
  };
}

async function bootstrapGoogleProfile(session: AuthSession, response: GoogleLoginResponse): Promise<void> {
  const hint = response.googleProfile;
  const displayName = hint?.displayName?.trim();
  if (!displayName || session.roles.includes("SYSTEM_ADMIN")) return;

  try {
    if (session.roles.includes("RECRUITER")) {
      if (!response.newAccount) {
        try {
          await apiRequest("/api/v2/recruiter/profile", { accessToken: session.accessToken });
          return;
        } catch (failure) {
          if (!(failure instanceof ApiClientError) || failure.status !== 404) return;
        }
      }
      await apiRequest("/api/v2/recruiter/profile", {
        method: "PUT",
        accessToken: session.accessToken,
        body: JSON.stringify({
          displayName: displayName.slice(0, 160),
          businessTitle: null,
          businessPhone: null,
        }),
      });
      return;
    }

    if (session.roles.includes("CANDIDATE")) {
      if (!response.newAccount) {
        try {
          await apiRequest("/api/v2/candidates/me", { accessToken: session.accessToken });
          return;
        } catch (failure) {
          if (!(failure instanceof ApiClientError) || failure.status !== 404) return;
        }
      }
      const rawEmail = hint?.email?.trim() ?? "";
      const rawAvatar = hint?.avatarUrl?.trim() ?? "";
      await apiRequest("/api/v2/candidates/me", {
        method: "PUT",
        accessToken: session.accessToken,
        body: JSON.stringify({
          displayName: displayName.slice(0, 120),
          headline: null,
          locationText: null,
          visibility: "APPLICATION_ONLY",
          phoneNumber: null,
          contactEmail: rawEmail && rawEmail.length <= 255 ? rawEmail : null,
          linkedinUrl: null,
          githubUrl: null,
          portfolioUrl: null,
          avatarUrl: rawAvatar && rawAvatar.length <= 500 ? rawAvatar : null,
          bio: null,
          version: null,
        }),
      });
    }
  } catch {
    // Profile bootstrap is best-effort; never block an authenticated Google sign-in.
  }
}

type LoginPageProps = {
  onSuccess: (session: AuthSession) => void;
  initialEmail?: string;
  initialMode?: "login" | "register";
  initialAccountType?: "CANDIDATE" | "RECRUITER";
};

const inputClass =
  "mt-1.5 h-10 w-full rounded-xl border border-border-strong bg-white px-3.5 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20";

export function LoginPage({
  onSuccess,
  initialEmail = "",
  initialMode = "login",
  initialAccountType = "CANDIDATE"
}: LoginPageProps) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">(initialMode);
  const [accountType, setAccountType] = useState<"CANDIDATE" | "RECRUITER">(initialAccountType);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [registrationMessage, setRegistrationMessage] = useState<string | null>(null);

  async function googleLogin(credential: string, nonce: string) {
    setSubmitting(true);
    setError(null);
    setRegistrationMessage(null);
    try {
      const response = await apiRequest<GoogleLoginResponse>("/api/v2/auth/google/login", {
        method: "POST",
        body: JSON.stringify({ credential, nonce, accountType: mode === "register" ? accountType : "CANDIDATE" })
      });
      const session = toAuthSession(response);
      await bootstrapGoogleProfile(session, response);
      saveSession(session);
      onSuccess(session);
    } finally {
      setSubmitting(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setRegistrationMessage(null);

    try {
      if (mode === "forgot") {
        await apiRequest<{ message: string }>("/api/v2/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email })
        });
        setRegistrationMessage("Nếu tài khoản hợp lệ, hướng dẫn đặt lại mật khẩu đã được gửi qua email.");
      } else if (mode === "register") {
        await apiRequest<{ verificationRequired: boolean }>("/api/v2/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, accountType })
        });
        setRegistrationMessage(
          "Đăng ký thành công. Mở liên kết xác minh được gửi đến email của bạn, sau đó quay lại đăng nhập."
        );
        setMode("login");
      } else {
        const session = await apiRequest<LoginResponse>("/api/v2/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, clientType: "WEB", deviceName: "Browser" })
        });
        saveSession(session);
        onSuccess(session);
      }
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.error.message
          : "Không thể kết nối tới Gateway. Vui lòng thử lại."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function resendVerification() {
    if (!email || submitting) return;
    setSubmitting(true);
    setError(null);
    setRegistrationMessage(null);
    try {
      await apiRequest<{ message: string }>("/api/v2/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      setRegistrationMessage("Nếu tài khoản đang chờ xác minh, hệ thống đã gửi một liên kết mới qua email.");
    } catch (requestError) {
      setError(
        requestError instanceof ApiClientError
          ? requestError.error.message
          : "Không thể kết nối tới Gateway. Vui lòng thử lại."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: "login" | "register" | "forgot") {
    setMode(nextMode);
    setError(null);
    setRegistrationMessage(null);
  }

  return (
    <section className="space-y-5" aria-labelledby="login-title">
      <div className="space-y-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-700 m-0">
          {mode === "login"
            ? "CHÀO MỪNG TRỞ LẠI"
            : mode === "register"
              ? "BẮT ĐẦU TẠO TÀI KHOẢN"
              : "KHÔI PHỤC TÀI KHOẢN"}
        </p>
        <h2 id="login-title" className="text-xl font-bold tracking-tight text-ink-900 m-0">
          {mode === "login" ? "Đăng nhập" : mode === "register" ? "Tạo tài khoản" : "Quên mật khẩu"}
        </h2>
        {mode === "forgot" && (
          <p className="text-xs text-ink-500 m-0">
            Nhập email để nhận liên kết đặt lại mật khẩu có hiệu lực trong 30 phút.
          </p>
        )}
        {mode === "register" && (
          <p className="text-xs text-ink-500 m-0">Bạn sẽ cần xác minh email sau khi đăng ký.</p>
        )}
      </div>

      <div
        className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 gap-1"
        role="tablist"
        aria-label="Account action"
      >
        <button
          type="button"
          onClick={() => switchMode("login")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-all cursor-pointer",
            mode === "login"
              ? "bg-white text-ink-900 shadow-xs font-semibold"
              : "text-ink-600 hover:text-ink-900"
          )}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          onClick={() => switchMode("register")}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm font-medium transition-all cursor-pointer",
            mode === "register"
              ? "bg-white text-ink-900 shadow-xs font-semibold"
              : "text-ink-600 hover:text-ink-900"
          )}
        >
          Đăng ký
        </button>
      </div>

      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm font-medium text-ink-800">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className={inputClass}
          />
        </label>

        {mode !== "forgot" && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="auth-password" className="text-sm font-medium text-ink-800">
                Mật khẩu
              </label>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline bg-transparent border-0 p-0 cursor-pointer"
                >
                  Quên mật khẩu?
                </button>
              )}
            </div>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              minLength={8}
              placeholder={mode === "register" ? "Tối thiểu 8 ký tự" : undefined}
              required
              className={inputClass}
            />
            {mode === "register" && (
              <p className="text-xs text-ink-500 mt-1 mb-0">Mật khẩu tài khoản mới tối thiểu 8 ký tự.</p>
            )}
          </div>
        )}

        {mode === "register" && (
          <label className="block text-sm font-medium text-ink-800">
            Loại tài khoản
            <select
              value={accountType}
              onChange={(event) => setAccountType(event.target.value as "CANDIDATE" | "RECRUITER")}
              className={inputClass}
            >
              <option value="CANDIDATE">Ứng viên</option>
              <option value="RECRUITER">Nhà tuyển dụng</option>
            </select>
          </label>
        )}

        {registrationMessage && (
          <p
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-900 m-0"
            role="status"
          >
            {registrationMessage}
          </p>
        )}
        {error && <ErrorBanner tone="error" message={error} />}

        <Button type="submit" disabled={submitting} className="w-full justify-center" size="lg">
          {submitting
            ? "Đang xử lý…"
            : mode === "login"
              ? "Đăng nhập"
              : mode === "register"
                ? "Tạo tài khoản"
                : "Gửi hướng dẫn"}
        </Button>
      </form>

      {mode !== "forgot" && <GoogleSignIn onCredential={googleLogin} disabled={submitting} />}

      {mode === "login" && (
        <div className="pt-1 text-center">
          <button
            type="button"
            disabled={!email || submitting}
            onClick={resendVerification}
            className="text-xs font-medium text-ink-600 hover:text-brand-700 hover:underline disabled:opacity-45 disabled:cursor-not-allowed bg-transparent border-0 p-0 cursor-pointer"
          >
            Gửi lại email xác minh
          </button>
        </div>
      )}
    </section>
  );
}
