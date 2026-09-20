import { describe, expect, it } from 'vitest';
import { isValidPlayerName } from '@quizzer/shared';

describe('join name validation', () => {
  it('requires a non-empty name up to 24 chars', () => {
    expect(isValidPlayerName('')).toBe(false);
    expect(isValidPlayerName('   ')).toBe(false);
    expect(isValidPlayerName('Buddy')).toBe(true);
    expect(isValidPlayerName('x'.repeat(25))).toBe(false);
  });
});
