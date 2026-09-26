import { QUIZ_REMOVAL_REASON } from '@party/shared';

const QUIZ_REMOVAL_KEY = 'party.quizRemoval';

export const QUIZ_REMOVAL_MESSAGE = "You've been removed from the quiz game.";

export function noteQuizRemoval(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.setItem(QUIZ_REMOVAL_KEY, '1');
}

export function readQuizRemovalMessage(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (sessionStorage.getItem(QUIZ_REMOVAL_KEY) !== '1') {
    return null;
  }
  return QUIZ_REMOVAL_MESSAGE;
}

export function clearQuizRemovalMessage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  sessionStorage.removeItem(QUIZ_REMOVAL_KEY);
}

export function isQuizRemoval(payload: { reason?: string } | undefined): boolean {
  return payload?.reason === QUIZ_REMOVAL_REASON;
}
