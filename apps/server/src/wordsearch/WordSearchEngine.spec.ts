import { describe, expect, it, vi } from 'vitest';
import type { WordSearchFile, WordSearchWord } from '@party/shared';
import { WordSearchEngine } from './WordSearchEngine';

const puzzle: WordSearchFile = {
  id: 'mini',
  title: 'Mini',
  grid: [
    ['C', 'A', 'T', 'X'],
    ['X', 'X', 'X', 'O'],
    ['X', 'X', 'X', 'G'],
    ['D', 'O', 'G', 'X'],
  ],
  words: [
    { word: 'CAT', row: 0, col: 0, direction: 'E' },
    { word: 'DOG', row: 0, col: 3, direction: 'S' },
    { word: 'GOD', row: 3, col: 2, direction: 'W' },
  ],
};

const words: WordSearchWord[] = [
  {
    id: 'CAT',
    word: 'CAT',
    row: 0,
    col: 0,
    direction: 'E',
    cells: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ],
  },
  {
    id: 'DOG',
    word: 'DOG',
    row: 0,
    col: 3,
    direction: 'S',
    cells: [
      { row: 0, col: 3 },
      { row: 1, col: 3 },
      { row: 2, col: 3 },
    ],
  },
  {
    id: 'GOD',
    word: 'GOD',
    row: 3,
    col: 2,
    direction: 'W',
    cells: [
      { row: 3, col: 2 },
      { row: 3, col: 1 },
      { row: 3, col: 0 },
    ],
  },
];

function createEngine() {
  return new WordSearchEngine(puzzle, words);
}

describe('WordSearchEngine', () => {
  it('accepts a placement forward or reversed and ignores a miss', () => {
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    engine.resumeTimer('p1');

    expect(
      engine.submitSelection('p1', [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ])
    ).toEqual({ ok: true, matched: false });
    expect(engine.getPlayerSnapshot('p1')?.found).toEqual([]);

    expect(
      engine.submitSelection('p1', [
        { row: 0, col: 2 },
        { row: 0, col: 1 },
        { row: 0, col: 0 },
      ])
    ).toEqual({ ok: true, matched: true });
    const snap = engine.getPlayerSnapshot('p1');
    expect(snap?.found.map((found) => found.word)).toEqual(['CAT']);
    expect(snap?.found[0]?.cells).toEqual(words[0].cells);
    expect(snap?.completed).toBe(false);
  });

  it('does not clear a found word when the same selection is sent again', () => {
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    engine.submitSelection('p1', words[0].cells);
    engine.submitSelection('p1', [...words[0].cells].reverse());
    expect(engine.getPlayerSnapshot('p1')?.found).toHaveLength(1);
  });

  it('starts the clock on resume and pauses while away', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(0);
    expect(engine.getPlayerSnapshot('p1')?.activeSince).toBeNull();

    engine.resumeTimer('p1');
    expect(engine.getPlayerSnapshot('p1')?.activeSince).toBe(
      Date.parse('2026-01-01T12:00:00Z')
    );

    vi.setSystemTime(new Date('2026-01-01T12:00:30Z'));
    engine.pauseTimer('p1');
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(30_000);
    expect(engine.getPlayerSnapshot('p1')?.activeSince).toBeNull();

    vi.setSystemTime(new Date('2026-01-01T12:05:30Z'));
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(30_000);

    engine.resumeTimer('p1');
    vi.setSystemTime(new Date('2026-01-01T12:05:40Z'));
    engine.pauseTimer('p1');
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(40_000);
    vi.useRealTimers();
  });

  it('freezes play time when every word is found', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    const engine = createEngine();
    engine.ensurePlayer('p1', 'Buddy');
    engine.resumeTimer('p1');
    vi.setSystemTime(new Date('2026-01-01T12:00:45Z'));
    for (const word of words) {
      engine.submitSelection('p1', word.cells);
    }
    const snap = engine.getPlayerSnapshot('p1');
    expect(snap?.completed).toBe(true);
    expect(snap?.elapsedMs).toBe(45_000);
    expect(snap?.activeSince).toBeNull();

    vi.setSystemTime(new Date('2026-01-01T12:10:00Z'));
    engine.resumeTimer('p1');
    expect(engine.getPlayerSnapshot('p1')?.elapsedMs).toBe(45_000);
    expect(engine.getPlayerSnapshot('p1')?.activeSince).toBeNull();
    vi.useRealTimers();
  });

  it('sorts the leaderboard by words found then shortest time', () => {
    vi.useFakeTimers();
    const engine = createEngine();
    engine.ensurePlayer('a', 'Ada');
    engine.ensurePlayer('b', 'Bea');
    engine.ensurePlayer('c', 'Cal');

    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    engine.resumeTimer('c');
    vi.setSystemTime(new Date('2026-01-01T12:00:10Z'));
    engine.submitSelection('c', words[0].cells);
    engine.pauseTimer('c');

    vi.setSystemTime(new Date('2026-01-01T12:01:00Z'));
    engine.resumeTimer('a');
    vi.setSystemTime(new Date('2026-01-01T12:02:00Z'));
    engine.submitSelection('a', words[0].cells);
    engine.submitSelection('a', words[1].cells);
    engine.pauseTimer('a');

    vi.setSystemTime(new Date('2026-01-01T12:03:00Z'));
    engine.resumeTimer('b');
    vi.setSystemTime(new Date('2026-01-01T12:03:30Z'));
    engine.submitSelection('b', words[0].cells);
    engine.submitSelection('b', words[1].cells);
    engine.pauseTimer('b');

    const admin = engine.getAdminSnapshot();
    expect(admin.players.map((player) => player.name)).toEqual([
      'Bea',
      'Ada',
      'Cal',
    ]);
    expect(admin.players[0]?.elapsedMs).toBe(30_000);
    expect(admin.players[1]?.elapsedMs).toBe(60_000);
    expect(admin.players[2]?.foundCount).toBe(1);
    vi.useRealTimers();
  });

  it('resets one player without clearing the others', () => {
    const engine = createEngine();
    engine.ensurePlayer('a', 'Ada');
    engine.ensurePlayer('b', 'Bea');
    engine.resumeTimer('a');
    engine.submitSelection('a', words[0].cells);
    engine.submitSelection('b', words[1].cells);

    expect(engine.resetPlayer('a')).toEqual({ ok: true });
    expect(engine.getPlayerSnapshot('a')?.found).toEqual([]);
    expect(engine.getPlayerSnapshot('a')?.elapsedMs).toBe(0);
    expect(engine.getPlayerSnapshot('a')?.activeSince).toBeNull();
    expect(engine.getPlayerSnapshot('b')?.found.map((found) => found.word)).toEqual([
      'DOG',
    ]);
  });

  it('holds a pending puzzle until the active puzzle is replaced', () => {
    const engine = createEngine();
    engine.setPuzzles([
      { id: 'mini', label: 'mini.json' },
      { id: 'canada', label: 'canada.json' },
    ]);
    expect(engine.selectPuzzle('canada')).toEqual({ ok: true });
    expect(engine.getPendingPuzzleId()).toBe('canada');
    expect(engine.activePuzzleId).toBe('mini');
    expect(engine.getAdminSnapshot().pendingPuzzleId).toBe('canada');
  });
});
