import { describe, expect, it, vi } from 'vitest';
import type { CrosswordPuzzleFile } from '@party/shared';
import { deriveCrosswordWords } from '@party/shared';
import { CrosswordEngine } from './CrosswordEngine';

const mini: CrosswordPuzzleFile = {
  id: 'mini',
  title: 'Mini',
  grid: [
    ['P', 'I', 'E'],
    ['A', null, null],
    ['N', null, null],
  ],
  across: [{ number: 1, row: 0, col: 0, clue: 'Dessert' }],
  down: [{ number: 1, row: 0, col: 0, clue: 'Cooking vessel' }],
};

function createEngine() {
  const words = deriveCrosswordWords(mini);
  if ('error' in words) {
    throw new Error(words.error);
  }
  return new CrosswordEngine(mini, words);
}

describe('CrosswordEngine', () => {
  it('marks a word correct only when fully filled correctly', () => {
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    engine.setLetter('p1', 0, 0, 'P');
    engine.setLetter('p1', 0, 1, 'I');
    let snap = engine.getPlayerSnapshot('p1');
    expect(snap?.correctWordIds).toEqual([]);

    engine.setLetter('p1', 0, 2, 'E');
    snap = engine.getPlayerSnapshot('p1');
    expect(snap?.correctWordIds).toContain('across-1');
    expect(snap?.completed).toBe(false);
  });

  it('completes the puzzle when all words are correct', () => {
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    for (const [row, col, letter] of [
      [0, 0, 'P'],
      [0, 1, 'I'],
      [0, 2, 'E'],
      [1, 0, 'A'],
      [2, 0, 'N'],
    ] as const) {
      engine.setLetter('p1', row, col, letter);
    }
    const snap = engine.getPlayerSnapshot('p1');
    expect(snap?.completed).toBe(true);
    expect(snap?.correctWordIds).toHaveLength(2);
  });

  it('sorts admin entries completed newest first then by correct count', () => {
    vi.useFakeTimers();
    const engine = createEngine();
    engine.ensurePlayer('a', 'Ada');
    engine.ensurePlayer('b', 'Bea');
    engine.ensurePlayer('c', 'Cal');

    engine.setLetter('c', 0, 0, 'P');
    engine.setLetter('c', 0, 1, 'I');
    engine.setLetter('c', 0, 2, 'E');

    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    for (const [row, col, letter] of [
      [0, 0, 'P'],
      [0, 1, 'I'],
      [0, 2, 'E'],
      [1, 0, 'A'],
      [2, 0, 'N'],
    ] as const) {
      engine.setLetter('a', row, col, letter);
    }

    vi.setSystemTime(new Date('2026-01-01T12:01:00Z'));
    for (const [row, col, letter] of [
      [0, 0, 'P'],
      [0, 1, 'I'],
      [0, 2, 'E'],
      [1, 0, 'A'],
      [2, 0, 'N'],
    ] as const) {
      engine.setLetter('b', row, col, letter);
    }

    const admin = engine.getAdminSnapshot();
    expect(admin.players.map((p) => p.name)).toEqual(['Bea', 'Ada', 'Cal']);
    vi.useRealTimers();
  });

  it('clears progress on reset but keeps players', () => {
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    engine.setLetter('p1', 0, 0, 'P');
    engine.reset();
    const snap = engine.getPlayerSnapshot('p1');
    expect(snap?.letters[0][0]).toBe('');
    expect(snap?.correctWordIds).toEqual([]);
    expect(engine.getAdminSnapshot().players).toHaveLength(1);
  });
});
