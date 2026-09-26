import { describe, expect, it } from 'vitest';
import { loginRedirect, returnPath } from './returnPath';

describe('login return path', () => {
  it('sends a direct login onward to the lobby', () => {
    expect(returnPath('')).toBe('/');
    expect(returnPath('?next=%2Flogin')).toBe('/');
  });

  it('returns the player to the game they opened', () => {
    expect(returnPath('?next=%2Fcrossword')).toBe('/crossword');
    expect(returnPath('?next=%2Fwordsearch')).toBe('/wordsearch');
    expect(returnPath('?next=%2Fquizzer')).toBe('/quizzer');
    expect(returnPath('?next=%2Fplay')).toBe('/quizzer');
  });

  it('ignores a next path outside the player app', () => {
    expect(returnPath('?next=%2Fhost')).toBe('/');
    expect(returnPath('?next=https%3A%2F%2Fevil.example')).toBe('/');
  });

  it('builds a login link that remembers the opened page', () => {
    expect(loginRedirect('/crossword')).toBe('/login?next=%2Fcrossword');
    expect(loginRedirect('/')).toBe('/login?next=%2F');
    expect(loginRedirect('/play')).toBe('/login?next=%2Fquizzer');
    expect(loginRedirect('/host')).toBe('/login');
  });
});
