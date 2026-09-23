import { describe, expect, it } from 'vitest';
import { adminConfigSchema, questionSetsSchema } from './adminFormSchema';

describe('adminFormSchema', () => {
  it('accepts a valid config form payload', () => {
    const result = adminConfigSchema.safeParse({
      timeLimitSeconds: '30',
      defaultScore: '1000',
      minScore: '100',
      scaleMs: '100',
      revealDurationMs: '2000',
      leaderboardDurationMs: '3000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects minScore above defaultScore', () => {
    const result = adminConfigSchema.safeParse({
      timeLimitSeconds: 30,
      defaultScore: 100,
      minScore: 200,
      scaleMs: 100,
      revealDurationMs: 2000,
      leaderboardDurationMs: 3000,
    });
    expect(result.success).toBe(false);
  });

  it('requires exactly one set in single mode', () => {
    const result = questionSetsSchema.safeParse({
      mode: 'single',
      questionSetIds: ['dog-facts', 'cat-facts'],
    });
    expect(result.success).toBe(false);
  });

  it('allows multiple sets in continuous mode', () => {
    const result = questionSetsSchema.safeParse({
      mode: 'continuous',
      questionSetIds: ['dog-facts', 'cat-facts'],
    });
    expect(result.success).toBe(true);
  });
});
