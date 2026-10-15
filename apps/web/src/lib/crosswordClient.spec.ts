import { describe, expect, it } from 'vitest';
import type { CrosswordPublicPuzzle } from '@party/shared';
import {
  backspaceTarget,
  buildClientWords,
  computeElapsedMs,
  directionForCell,
  firstEmptyCellInWord,
  formatElapsedMs,
  nextEmptyCellInWord,
  nextUnsolvedClue,
  previousEditableInWord,
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

  it('skips a read-only square when choosing where a clue starts', () => {
    const letters = [
      ['P', '', ''],
      ['', null, null],
      ['', null, null],
    ];
    const locked = (row: number, col: number) => row === 0 && col === 0;
    expect(firstEmptyCellInWord(across, letters, locked)).toEqual({
      row: 0,
      col: 1,
    });
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

  it('skips read-only squares from a completed word while advancing', () => {
    const letters = [
      ['', '', ''],
      ['', null, null],
      ['', null, null],
    ];
    const locked = (row: number, col: number) => row === 0 && col === 1;
    expect(
      nextEmptyCellInWord(across, letters, { row: 0, col: 0 }, locked)
    ).toEqual({ row: 0, col: 2 });
  });
});

const crossing: CrosswordPublicPuzzle = {
  id: 'x',
  title: 'Cross',
  rows: 3,
  cols: 3,
  open: [
    [true, true, true],
    [true, true, false],
    [true, false, false],
  ],
  cellNumbers: [
    [1, 2, null],
    [3, null, null],
    [null, null, null],
  ],
  across: [
    { number: 1, row: 0, col: 0, clue: 'Top', length: 3 },
    { number: 3, row: 1, col: 0, clue: 'Mid', length: 2 },
  ],
  down: [
    { number: 1, row: 0, col: 0, clue: 'Left', length: 3 },
    { number: 2, row: 0, col: 1, clue: 'Second', length: 2 },
  ],
};

describe('clue advance and direction', () => {
  const words = buildClientWords(crossing);
  const across1 = words.find((word) => word.id === 'across-1')!;
  const down1 = words.find((word) => word.id === 'down-1')!;
  const down2 = words.find((word) => word.id === 'down-2')!;
  const across3 = words.find((word) => word.id === 'across-3')!;

  it('moves to the next numbered clue and skips solved ones', () => {
    expect(nextUnsolvedClue(words, 'across-1', ['across-1'])?.id).toBe(
      'down-1'
    );
    expect(
      nextUnsolvedClue(words, 'across-1', ['across-1', 'down-1'])?.id
    ).toBe('down-2');
    expect(
      nextUnsolvedClue(words, 'down-2', ['down-2', 'across-3', 'down-1'])?.id
    ).toBe('across-1');
  });

  it('returns null when every other clue is solved', () => {
    expect(
      nextUnsolvedClue(words, 'across-1', [
        'across-1',
        'down-1',
        'down-2',
        'across-3',
      ])
    ).toBeNull();
  });

  it('prefers the word that starts on a shared square', () => {
    expect(directionForCell(wordsAt(0, 1), 0, 1, 'across', [])).toBe('down');
    expect(directionForCell(wordsAt(1, 0), 1, 0, 'down', [])).toBe('across');
  });

  it('uses the unsolved word when the starting clue is already solved', () => {
    expect(directionForCell(wordsAt(0, 1), 0, 1, 'down', ['down-2'])).toBe(
      'across'
    );
    expect(
      directionForCell([across1, down1], 0, 0, 'down', ['across-1'])
    ).toBe('down');
  });

  it('defaults a shared start to across when both words are solved or both are open', () => {
    expect(directionForCell([across1, down1], 0, 0, 'down', [])).toBe(
      'across'
    );
    expect(
      directionForCell([across1, down1], 0, 0, 'down', ['across-1', 'down-1'])
    ).toBe('across');
  });

  it('keeps the current direction on a crossing that starts neither word', () => {
    const covering = wordsAt(1, 1);
    expect(directionForCell(covering, 1, 1, 'across', [])).toBe('across');
    expect(directionForCell(covering, 1, 1, 'down', [])).toBe('down');
    expect(directionForCell(covering, 1, 1, 'across', ['across-3'])).toBe(
      'down'
    );
  });

  function wordsAt(row: number, col: number) {
    return words.filter((word) =>
      word.cells.some((cell) => cell.row === row && cell.col === col)
    );
  }

  it('covers the crossing starts used above', () => {
    expect(across1.cells[0]).toEqual({ row: 0, col: 0 });
    expect(down1.cells[0]).toEqual({ row: 0, col: 0 });
    expect(down2.cells[0]).toEqual({ row: 0, col: 1 });
    expect(across3.cells[0]).toEqual({ row: 1, col: 0 });
  });
});

describe('backspace around read-only squares', () => {
  const words = buildClientWords(crossing);
  const across = words.find((word) => word.id === 'across-1')!;
  const unlocked = () => false;
  const middleLocked = (row: number, col: number) => row === 0 && col === 1;

  it('clears the selected letter and stays there', () => {
    const letters = [
      ['P', 'I', ''],
      ['', '', null],
      ['', null, null],
    ];
    expect(backspaceTarget(across, letters, 0, 1, unlocked)).toEqual({
      clear: { row: 0, col: 1 },
      focus: null,
    });
  });

  it('erases the previous letter when the selection is an empty square', () => {
    const letters = [
      ['P', 'I', ''],
      ['', '', null],
      ['', null, null],
    ];
    expect(backspaceTarget(across, letters, 0, 2, unlocked)).toEqual({
      clear: { row: 0, col: 1 },
      focus: { row: 0, col: 1 },
    });
  });

  it('skips a read-only square and erases the editable letter before it', () => {
    const letters = [
      ['P', 'I', ''],
      ['', '', null],
      ['', null, null],
    ];
    expect(backspaceTarget(across, letters, 0, 2, middleLocked)).toEqual({
      clear: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    });
  });

  it('stays put when every square behind the cursor is read-only', () => {
    const letters = [
      ['P', 'I', ''],
      ['', '', null],
      ['', null, null],
    ];
    const locked = (row: number, col: number) => row === 0 && col < 2;
    expect(backspaceTarget(across, letters, 0, 2, locked)).toEqual({
      clear: null,
      focus: null,
    });
    expect(
      previousEditableInWord(across, { row: 0, col: 2 }, locked)
    ).toBeNull();
  });

  it('does not erase a read-only square and moves to the previous editable one', () => {
    const letters = [
      ['P', 'I', 'E'],
      ['', '', null],
      ['', null, null],
    ];
    expect(backspaceTarget(across, letters, 0, 1, middleLocked)).toEqual({
      clear: null,
      focus: { row: 0, col: 0 },
    });
  });

  it('stays on a read-only square when nothing editable comes before it', () => {
    const letters = [
      ['P', '', ''],
      ['', '', null],
      ['', null, null],
    ];
    const startLocked = (row: number, col: number) => row === 0 && col === 0;
    expect(backspaceTarget(across, letters, 0, 0, startLocked)).toEqual({
      clear: null,
      focus: null,
    });
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
