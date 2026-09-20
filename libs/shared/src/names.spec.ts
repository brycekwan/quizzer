import { describe, expect, it } from 'vitest';
import { isNameTaken, isValidPlayerName, normalizePlayerName } from './names';

describe('player names', () => {
  it('normalizes whitespace', () => {
    expect(normalizePlayerName('  Buddy   Dog  ')).toBe('Buddy Dog');
  });

  it('rejects empty names', () => {
    expect(isValidPlayerName('   ')).toBe(false);
  });

  it('detects case-insensitive clashes', () => {
    expect(isNameTaken('Buddy', ['buddy', 'Rex'])).toBe(true);
    expect(isNameTaken('Max', ['buddy', 'Rex'])).toBe(false);
  });
});
