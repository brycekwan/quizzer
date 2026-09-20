import { describe, expect, it } from 'vitest';
import { buildFinalLeaderboard } from './leaderboard';

describe('buildFinalLeaderboard', () => {
  const board = Array.from({ length: 12 }, (_, i) => ({
    rank: i + 1,
    id: `p${i + 1}`,
    name: `Player ${i + 1}`,
    score: 1200 - i * 10,
  }));

  it('highlights a top-10 player in place', () => {
    const view = buildFinalLeaderboard(board, 'p3');
    expect(view.rows).toHaveLength(10);
    expect(view.rows[2].highlight).toBe(true);
  });

  it('appends the player as an 11th row when outside top 10', () => {
    const view = buildFinalLeaderboard(board, 'p12');
    expect(view.rows).toHaveLength(11);
    expect(view.rows[10].rank).toBe(12);
    expect(view.rows[10].highlight).toBe(true);
  });
});
