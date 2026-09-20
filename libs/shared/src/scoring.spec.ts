import { describe, expect, it } from 'vitest';
import { computeQuestionScore, resolveBaseScore } from './scoring';
import { DEFAULT_GAME_CONFIG } from './types';

describe('computeQuestionScore', () => {
  const base = {
    timeLimitSeconds: 30,
    scaleMs: 100,
    baseScore: 1000,
    minScore: 100,
    isCorrect: true,
  };

  it('returns full base score at t=0', () => {
    expect(computeQuestionScore({ ...base, elapsedMs: 0 })).toBe(1000);
  });

  it('returns minScore at deadline', () => {
    expect(computeQuestionScore({ ...base, elapsedMs: 30_000 })).toBe(100);
  });

  it('decreases linearly by scaleMs steps', () => {
    const early = computeQuestionScore({ ...base, elapsedMs: 100 });
    const later = computeQuestionScore({ ...base, elapsedMs: 10_000 });
    expect(early).toBeLessThan(1000);
    expect(later).toBeLessThan(early);
    expect(later).toBeGreaterThanOrEqual(100);
  });

  it('returns 0 for incorrect answers', () => {
    expect(
      computeQuestionScore({ ...base, elapsedMs: 0, isCorrect: false })
    ).toBe(0);
  });

  it('clamps elapsed time past the deadline', () => {
    expect(computeQuestionScore({ ...base, elapsedMs: 60_000 })).toBe(100);
  });

  it('uses per-question base via resolveBaseScore', () => {
    const baseScore = resolveBaseScore(1200, DEFAULT_GAME_CONFIG);
    expect(baseScore).toBe(1200);
    expect(
      computeQuestionScore({ ...base, baseScore, elapsedMs: 0 })
    ).toBe(1200);
  });

  it('applies multiplier to correct answers', () => {
    expect(
      computeQuestionScore({ ...base, elapsedMs: 0, multiplier: 2 })
    ).toBe(2000);
    expect(
      computeQuestionScore({ ...base, elapsedMs: 0, multiplier: 3 })
    ).toBe(3000);
  });

  it('does not apply multiplier to wrong answers', () => {
    expect(
      computeQuestionScore({
        ...base,
        elapsedMs: 0,
        isCorrect: false,
        multiplier: 3,
      })
    ).toBe(0);
  });
});
