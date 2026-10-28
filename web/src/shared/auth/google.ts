export type GoogleIdentityApi = {
  initialize: (options: {
    client_id: string;
    nonce: string;
    callback: (response: { credential: string }) => void;
    ux_mode: "popup";
    auto_select: boolean;
  }) => void;
  renderButton: (element: HTMLElement, options: {
    type: "standard"; theme: "outline"; size: "large"; text: "continue_with"; locale: "vi"; width: number;
  }) => void;
};

declare global {
  interface Window { google?: { accounts: { id: GoogleIdentityApi } }; }
}

let loading: Promise<GoogleIdentityApi> | null = null;

export function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (loading) return loading;
  loading = new Promise<GoogleIdentityApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    const timer = window.setTimeout(() => fail(), 15000);
    function fail() {
      window.clearTimeout(timer);
      script.remove();
      loading = null;
      reject(new Error("Không tải được đăng nhập Google. Kiểm tra kết nối và thử lại."));
    }
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.google?.accounts.id) resolve(window.google.accounts.id);
      else fail();
    };
    document.head.appendChild(script);
  });
  return loading;
}
