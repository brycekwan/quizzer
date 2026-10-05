import { describe, expect, it } from 'vitest';
import { playHasStarted } from './playHasStarted';

describe('playHasStarted', () => {
  it('is false for a fresh board', () => {
    expect(
      playHasStarted({ elapsedMs: 0, activeSince: null, completed: false })
    ).toBe(false);
  });

  it('is true once the clock has banked time, is running, or the puzzle is done', () => {
    expect(
      playHasStarted({ elapsedMs: 1_000, activeSince: null, completed: false })
    ).toBe(true);
    expect(
      playHasStarted({
        elapsedMs: 0,
        activeSince: 1_700_000_000_000,
        completed: false,
      })
    ).toBe(true);
    expect(
      playHasStarted({ elapsedMs: 0, activeSince: null, completed: true })
    ).toBe(true);
  });
});
