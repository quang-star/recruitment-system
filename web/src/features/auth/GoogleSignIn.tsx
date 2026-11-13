import { useEffect, useRef, useState } from "react";

import { ApiClientError, apiRequest } from "../../shared/api/client";
import { loadGoogleIdentity } from "../../shared/auth/google";

type Props = {
  onCredential: (credential: string, nonce: string) => Promise<void>;
  disabled?: boolean;
};

export function GoogleSignIn({ onCredential, disabled = false }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const blocked = useRef(disabled);
  callback.current = onCredential;
  blocked.current = disabled;
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "disabled" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let processing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setStatus("loading");
    setError(null);
    async function prepare() {
      try {
        const config = await apiRequest<{ clientId: string }>("/api/v2/auth/google/config");
        if (!active) return;
        if (!config.clientId) { setStatus("disabled"); return; }
        const google = await loadGoogleIdentity();
        if (!active) return;
        const challenge = await apiRequest<{ nonce: string; expiresAt: string }>("/api/v2/auth/google/challenge", { method: "POST" });
        if (!active || !container.current) return;
        google.initialize({
          client_id: config.clientId, nonce: challenge.nonce, ux_mode: "popup", auto_select: false,
          callback: ({ credential }) => {
            if (!active || blocked.current || processing) return;
            processing = true;
            setBusy(true);
            setError(null);
            void callback.current(credential, challenge.nonce).catch((failure: unknown) => {
              if (active) {
                setError(failure instanceof ApiClientError ? failure.error.message
                  : "Không thể đăng nhập bằng Google. Vui lòng thử lại.");
                setStatus("error");
              }
            }).finally(() => {
              processing = false;
              if (active) setBusy(false);
            });
          }
        });
        container.current.replaceChildren();
        google.renderButton(container.current, {
          type: "standard", theme: "outline", size: "large", text: "continue_with", locale: "vi",
          width: Math.max(200, Math.min(container.current.parentElement?.clientWidth || 280, 400))
        });
        setStatus("ready");
        // Renew an unused challenge before expiry; a stale popup callback is ignored after cleanup.
        timer = setTimeout(() => { if (active) setAttempt((value) => value + 1); }, 4 * 60 * 1000);
      } catch (failure) {
        if (active) {
          setError(failure instanceof Error ? failure.message : "Không tải được đăng nhập Google.");
          setStatus("error");
        }
      }
    }
    void prepare();
    return () => { active = false; clearTimeout(timer); };
  }, [attempt]);

  if (status === "disabled") return null;
  return (
    <div className="mt-5 pt-4 border-t border-border-subtle flex flex-col items-center gap-3 text-center">
      <p className="text-xs font-medium text-ink-500 m-0">Hoặc tiếp tục với Google</p>
      <div
        ref={container}
        hidden={status !== "ready"}
        inert={disabled || busy}
        aria-disabled={disabled || busy}
        className="flex justify-center max-w-full"
      />
      {status === "loading" && <p className="text-xs text-ink-500 m-0" role="status">Đang tải đăng nhập Google…</p>}
      {busy && <p className="text-xs font-medium text-brand-700 m-0" role="status">Đang xác minh tài khoản Google…</p>}
      {error && <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 m-0 w-full" role="alert">{error}</p>}
      {status === "error" && (
        <button
          type="button"
          className="text-xs font-semibold text-brand-700 hover:text-brand-800 underline underline-offset-2 disabled:opacity-50 cursor-pointer"
          disabled={disabled || busy}
          onClick={() => setAttempt((value) => value + 1)}
        >
          Thử lại Google
        </button>
      )}
    </div>
  );
}
