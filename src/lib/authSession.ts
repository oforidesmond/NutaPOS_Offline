/** Marks an in-tab auth session. Cleared when the browser/PWA process ends. */
const AUTH_SESSION_KEY = 'nutapos_auth_session';

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

export function isAuthSessionActive(): boolean {
  return storage()?.getItem(AUTH_SESSION_KEY) === '1';
}

export function markAuthSessionActive(): void {
  storage()?.setItem(AUTH_SESSION_KEY, '1');
}

export function clearAuthSession(): void {
  storage()?.removeItem(AUTH_SESSION_KEY);
}
