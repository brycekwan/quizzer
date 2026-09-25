import { SYSTEM_REMOVAL_REASON } from '@party/shared';
import { clearStoredSession } from './sessionStorage';

const SYSTEM_REMOVAL_KEY = 'party.systemRemoval';

export const SYSTEM_REMOVAL_MESSAGE =
  'The admin has removed you from the system.';

export function noteSystemRemoval(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(SYSTEM_REMOVAL_KEY, '1');
  clearStoredSession();
}

export function readSystemRemovalMessage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (sessionStorage.getItem(SYSTEM_REMOVAL_KEY) !== '1') {
    return null;
  }
  return SYSTEM_REMOVAL_MESSAGE;
}

export function clearSystemRemovalMessage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(SYSTEM_REMOVAL_KEY);
}

export function isSystemRemoval(payload: { reason?: string } | undefined): boolean {
  return payload?.reason === SYSTEM_REMOVAL_REASON;
}
