import { describe, expect, it } from 'vitest';
import {
  visiblePlayerRows,
  type LeaderboardRow,
} from './partyLeaderboard';

function row(rank: number, name: string): LeaderboardRow {
  return {
    rank,
    playerId: name,
    name,
    score: 100 - rank,
    quizScore: null,
    clocks: [],
  };
}

describe('visiblePlayerRows', () => {
  const rows = Array.from({ length: 12 }, (_, index) => row(index + 1, `P${index + 1}`));

  it('highlights a viewer who is already in the top 10', () => {
    const visible = visiblePlayerRows(rows, 'P3');
    expect(visible).toHaveLength(10);
    expect(visible[2]).toMatchObject({ kind: 'rank', name: 'P3', highlight: true });
  });

  it('appends the viewer below a gap when they are outside the top 10', () => {
    const visible = visiblePlayerRows(rows, 'P12');
    expect(visible.map((entry) => entry.kind)).toEqual([
      ...Array.from({ length: 10 }, () => 'rank'),
      'gap',
      'rank',
    ]);
    expect(visible[11]).toMatchObject({
      kind: 'rank',
      name: 'P12',
      rank: 12,
      highlight: true,
    });
  });

  it('shows only the top 10 when the viewer has not played', () => {
    const visible = visiblePlayerRows(rows, 'missing');
    expect(visible).toHaveLength(10);
    expect(visible.every((entry) => entry.kind === 'rank' && !entry.highlight)).toBe(true);
  });
});
