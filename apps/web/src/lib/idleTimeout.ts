import { IDLE_TIMEOUT_REASON } from '@party/shared';
import { clearStoredSession } from './sessionStorage';

const IDLE_TIMEOUT_KEY = 'party.idleTimeout';

export const IDLE_TIMEOUT_MESSAGE = 'Signed out due to inactivity.';

export function noteIdleTimeout(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(IDLE_TIMEOUT_KEY, '1');
  clearStoredSession();
}

export function readIdleTimeoutMessage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (sessionStorage.getItem(IDLE_TIMEOUT_KEY) !== '1') {
    return null;
  }
  return IDLE_TIMEOUT_MESSAGE;
}

export function clearIdleTimeoutMessage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(IDLE_TIMEOUT_KEY);
}

export function isIdleTimeout(payload: { reason?: string } | undefined): boolean {
  return payload?.reason === IDLE_TIMEOUT_REASON;
}
