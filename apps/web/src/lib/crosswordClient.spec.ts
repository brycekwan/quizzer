import { describe, expect, it } from 'vitest';
import type { CrosswordPublicPuzzle } from '@party/shared';
import {
  buildClientWords,
  computeElapsedMs,
  firstEmptyCellInWord,
  formatElapsedMs,
  nextEmptyCellInWord,
} from './crosswordClient';

const puzzle: CrosswordPublicPuzzle = {
  id: 'mini',
  title: 'Mini',
  rows: 3,
  cols: 3,
  open: [
    [true, true, true],
    [true, false, false],
    [true, false, false],
  ],
  cellNumbers: [
    [1, null, null],
    [null, null, null],
    [null, null, null],
  ],
  across: [{ number: 1, row: 0, col: 0, clue: 'Dessert', length: 3 }],
  down: [{ number: 1, row: 0, col: 0, clue: 'Cooking vessel', length: 3 }],
};

describe('crosswordClient navigation helpers', () => {
  const words = buildClientWords(puzzle);
  const across = words.find((w) => w.id === 'across-1')!;

  it('finds the first empty cell in a word', () => {
    const letters = [
      ['P', '', ''],
      ['', null, null],
      ['', null, null],
    ];
    expect(firstEmptyCellInWord(across, letters)).toEqual({ row: 0, col: 1 });
  });

  it('falls back to the first cell when the word is full', () => {
    const letters = [
      ['P', 'I', 'E'],
      ['', null, null],
      ['', null, null],
    ];
    expect(firstEmptyCellInWord(across, letters)).toEqual({ row: 0, col: 0 });
  });

  it('skips filled cells when advancing after a letter', () => {
    const letters = [
      ['P', 'I', ''],
      ['', null, null],
      ['', null, null],
    ];
    // From col 0, next empty is col 2 (skips filled col 1)
    expect(
      nextEmptyCellInWord(across, letters, { row: 0, col: 0 })
    ).toEqual({ row: 0, col: 2 });
  });

  it('returns null when there is no later empty cell', () => {
    const letters = [
      ['P', 'I', 'E'],
      ['', null, null],
      ['', null, null],
    ];
    expect(
      nextEmptyCellInWord(across, letters, { row: 0, col: 0 })
    ).toBeNull();
  });
});

describe('elapsed formatting', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatElapsedMs(0)).toBe('00:00');
    expect(formatElapsedMs(65_000)).toBe('01:05');
    expect(formatElapsedMs(3_661_000)).toBe('1:01:01');
  });

  it('adds active session time onto accumulated elapsed', () => {
    expect(computeElapsedMs(0, null, 1000)).toBe(0);
    expect(computeElapsedMs(10_000, null, 9999)).toBe(10_000);
    expect(computeElapsedMs(10_000, 1000, 5000)).toBe(14_000);
  });
});
