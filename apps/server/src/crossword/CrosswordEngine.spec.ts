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

function fillAll(engine: CrosswordEngine, playerId: string) {
  for (const [row, col, letter] of [
    [0, 0, 'P'],
    [0, 1, 'I'],
    [0, 2, 'E'],
    [1, 0, 'A'],
    [2, 0, 'N'],
  ] as const) {
    engine.setLetter(playerId, row, col, letter);
  }
}

describe('CrosswordEngine', () => {
  it('marks a word correct only when fully filled correctly', () => {
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    engine.setLetter('p1', 0, 0, 'P');
    engine.setLetter('p1', 0, 1, 'I');
    let snap = engine.getPlayerSnapshot('p1');
    expect(snap?.correctWordIds).toEqual([]);

    const filled = engine.setLetter('p1', 0, 2, 'E');
    expect(filled).toEqual({ ok: true, correctWordIds: ['across-1'] });
    snap = engine.getPlayerSnapshot('p1');
    expect(snap?.correctWordIds).toContain('across-1');
    expect(snap?.completed).toBe(false);
  });

  it('completes the puzzle when all words are correct', () => {
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    fillAll(engine, 'p1');
    const snap = engine.getPlayerSnapshot('p1');
    expect(snap?.completed).toBe(true);
    expect(snap?.correctWordIds).toHaveLength(2);
  });

  it('accumulates play time and pauses while away', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(0);
    expect(engine.getPlayerSnapshot('p1')?.activeSince).toBeNull();

    engine.setLetter('p1', 0, 0, 'P');
    expect(engine.getPlayerSnapshot('p1')?.activeSince).toBe(
      Date.parse('2026-01-01T12:00:00Z')
    );

    vi.setSystemTime(new Date('2026-01-01T12:00:30Z'));
    engine.pauseTimer('p1');
    let snap = engine.getPlayerSnapshot('p1');
    expect(snap?.elapsedMs).toBe(30_000);
    expect(snap?.activeSince).toBeNull();

    // Away for 5 minutes — elapsed stays frozen
    vi.setSystemTime(new Date('2026-01-01T12:05:30Z'));
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(30_000);

    engine.resumeTimer('p1');
    snap = engine.getPlayerSnapshot('p1');
    expect(snap?.elapsedMs).toBe(30_000);
    expect(snap?.activeSince).toBe(Date.parse('2026-01-01T12:05:30Z'));

    vi.setSystemTime(new Date('2026-01-01T12:05:40Z'));
    engine.pauseTimer('p1');
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(40_000);

    engine.reset();
    snap = engine.getPlayerSnapshot('p1');
    expect(snap?.elapsedMs).toBe(0);
    expect(snap?.activeSince).toBeNull();
    expect(snap?.completedAt).toBeNull();
    vi.useRealTimers();
  });

  it('freezes play time on completion', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    engine.setLetter('p1', 0, 0, 'P');
    vi.setSystemTime(new Date('2026-01-01T12:00:45Z'));
    fillAll(engine, 'p1');
    const snap = engine.getPlayerSnapshot('p1');
    expect(snap?.completed).toBe(true);
    expect(snap?.elapsedMs).toBe(45_000);
    expect(snap?.activeSince).toBeNull();

    vi.setSystemTime(new Date('2026-01-01T12:10:00Z'));
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(45_000);
    vi.useRealTimers();
  });

  it('sorts admin by words completed then shortest play time and scores ranks', () => {
    vi.useFakeTimers();
    const engine = createEngine();
    engine.ensurePlayer('a', 'Ada');
    engine.ensurePlayer('b', 'Bea');
    engine.ensurePlayer('c', 'Cal');

    // Cal: one word, 10s play time
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    engine.setLetter('c', 0, 0, 'P');
    vi.setSystemTime(new Date('2026-01-01T12:00:10Z'));
    engine.setLetter('c', 0, 1, 'I');
    engine.setLetter('c', 0, 2, 'E');
    engine.pauseTimer('c');

    // Ada: finishes in 60s
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    engine.setLetter('a', 0, 0, 'P');
    vi.setSystemTime(new Date('2026-01-01T12:01:00Z'));
    fillAll(engine, 'a');

    // Bea: finishes in 30s
    vi.setSystemTime(new Date('2026-01-01T12:02:00Z'));
    engine.setLetter('b', 0, 0, 'P');
    vi.setSystemTime(new Date('2026-01-01T12:02:30Z'));
    fillAll(engine, 'b');

    const admin = engine.getAdminSnapshot();
    expect(admin.players.map((p) => p.name)).toEqual(['Bea', 'Ada', 'Cal']);
    expect(admin.players[0]?.elapsedMs).toBe(30_000);
    expect(admin.players[1]?.elapsedMs).toBe(60_000);
    // Bea: 2 words + 1st = 200 + 1000; Ada: 2 + 2nd = 200 + 900; Cal: 1 + 3rd = 100 + 800
    expect(admin.players.map((p) => p.score)).toEqual([1200, 1100, 900]);
    vi.useRealTimers();
  });

  it('holds a pending puzzle until reset applies it', () => {
    const engine = createEngine();
    engine.setPuzzles([
      { id: 'mini', label: 'mini.json' },
      { id: 'other', label: 'other.json' },
    ]);
    expect(engine.selectPuzzle('other')).toEqual({ ok: true });
    expect(engine.getPendingPuzzleId()).toBe('other');
    expect(engine.activePuzzleId).toBe('mini');
    expect(engine.getAdminSnapshot().pendingPuzzleId).toBe('other');

    const other: CrosswordPuzzleFile = {
      id: 'other',
      title: 'Other',
      grid: [
        ['C', 'A', 'T'],
        ['U', null, null],
        ['P', null, null],
      ],
      across: [{ number: 1, row: 0, col: 0, clue: 'Pet' }],
      down: [{ number: 1, row: 0, col: 0, clue: 'Trophy' }],
    };
    const otherWords = deriveCrosswordWords(other);
    if ('error' in otherWords) {
      throw new Error(otherWords.error);
    }

    engine.ensurePlayer('p1', 'Buddy');
    engine.setLetter('p1', 0, 0, 'P');
    engine.setPuzzle(other, otherWords);
    engine.reset();

    expect(engine.activePuzzleId).toBe('other');
    expect(engine.getPendingPuzzleId()).toBe('other');
    const snap = engine.getPlayerSnapshot('p1');
    expect(snap?.puzzle.title).toBe('Other');
    expect(snap?.letters[0][0]).toBe('');
    expect(snap?.totalWords).toBe(2);
  });

  it('recomputes scores when a new player joins', () => {
    const engine = createEngine();
    engine.ensurePlayer('a', 'Ada');
    fillAll(engine, 'a');
    expect(engine.getAdminSnapshot().players[0]?.score).toBe(1200); // 2*100 + 1000

    engine.ensurePlayer('b', 'Bea');
    const admin = engine.getAdminSnapshot();
    expect(admin.players.map((p) => p.name)).toEqual(['Ada', 'Bea']);
    expect(admin.players[0]?.score).toBe(1200); // still 1st
    expect(admin.players[1]?.score).toBe(900); // 0 words + 2nd place = 900
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
    expect(engine.getAdminSnapshot().players[0]?.score).toBe(1000); // 0 words, sole 1st
  });
});
