export type AuthSession = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: string;
  refreshTokenExpiresAt: string;
  roles: string[];
};

const sessionKey = "smart-recruitment.session";
let generation = 0;
const accessTokens = new Set<string>();
const listeners = new Set<() => void>();

export function sessionGeneration(): number { return generation; }

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function notifySession(): void { listeners.forEach((listener) => listener()); }

export function sessionForToken(token: string | undefined): AuthSession | null {
  const current = loadSession();
  return current && token && (current.accessToken === token || accessTokens.has(token)) ? current : null;
}

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
  generation += 1;
  accessTokens.clear();
  accessTokens.add(session.accessToken);
  notifySession();
}

export function updateSession(session: AuthSession, expectedRefreshToken: string, expectedGeneration: number): boolean {
  const current = loadSession();
  if (generation !== expectedGeneration || !current || current.refreshToken !== expectedRefreshToken
    || current.userId !== session.userId) return false;
  sessionStorage.setItem(sessionKey, JSON.stringify(session));
  accessTokens.add(current.accessToken);
  accessTokens.add(session.accessToken);
  notifySession();
  return true;
}

export function clearSession(): void {
  sessionStorage.removeItem(sessionKey);
  generation += 1;
  accessTokens.clear();
  notifySession();
}
