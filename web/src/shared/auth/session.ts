export type AuthSession = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  roles: string[];
};

const sessionKey = "smart-recruitment.session";

export function loadSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(sessionKey);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<AuthSession>;
    if (!session.userId || !session.accessToken || !session.refreshToken) return null;
    return {
      userId: session.userId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresAt: session.accessTokenExpiresAt ?? "",
      refreshTokenExpiresAt: session.refreshTokenExpiresAt ?? "",
      roles: session.roles ?? []
    };
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
}

export function clearSession(): void {
  sessionStorage.removeItem(sessionKey);
}
