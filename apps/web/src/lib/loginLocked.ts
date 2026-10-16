import { LOGIN_LOCKED_REASON } from '@party/shared';
import { clearStoredSession } from './sessionStorage';

const LOGIN_LOCKED_KEY = 'party.loginLocked';

export const LOGIN_LOCKED_BANNER = 'Logins are closed by the host.';

export function noteLoginLocked(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(LOGIN_LOCKED_KEY, '1');
  clearStoredSession();
}

export function readLoginLockedMessage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (sessionStorage.getItem(LOGIN_LOCKED_KEY) !== '1') {
    return null;
  }
  return LOGIN_LOCKED_BANNER;
}

export function clearLoginLockedMessage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(LOGIN_LOCKED_KEY);
}

export function isLoginLocked(payload: { reason?: string } | undefined): boolean {
  return payload?.reason === LOGIN_LOCKED_REASON;
}
