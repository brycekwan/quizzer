import type {
  CrosswordCluePublic,
  CrosswordDirection,
  CrosswordPublicPuzzle,
} from '@party/shared';

export interface ClientCrosswordWord {
  id: string;
  number: number;
  direction: CrosswordDirection;
  row: number;
  col: number;
  clue: string;
  length: number;
  cells: { row: number; col: number }[];
}

function cellsForClue(
  clue: CrosswordCluePublic,
  direction: CrosswordDirection
): { row: number; col: number }[] {
  return Array.from({ length: clue.length }, (_, i) =>
    direction === 'across'
      ? { row: clue.row, col: clue.col + i }
      : { row: clue.row + i, col: clue.col }
  );
}

export function buildClientWords(
  puzzle: CrosswordPublicPuzzle
): ClientCrosswordWord[] {
  return [
    ...puzzle.across.map((clue) => ({
      id: `across-${clue.number}`,
      number: clue.number,
      direction: 'across' as const,
      row: clue.row,
      col: clue.col,
      clue: clue.clue,
      length: clue.length,
      cells: cellsForClue(clue, 'across'),
    })),
    ...puzzle.down.map((clue) => ({
      id: `down-${clue.number}`,
      number: clue.number,
      direction: 'down' as const,
      row: clue.row,
      col: clue.col,
      clue: clue.clue,
      length: clue.length,
      cells: cellsForClue(clue, 'down'),
    })),
  ];
}

export function wordsAtCell(
  words: ClientCrosswordWord[],
  row: number,
  col: number
): ClientCrosswordWord[] {
  return words.filter((word) =>
    word.cells.some((cell) => cell.row === row && cell.col === col)
  );
}

function isSolved(
  word: ClientCrosswordWord,
  correctWordIds: readonly string[]
): boolean {
  return correctWordIds.includes(word.id);
}

function isWordStart(
  word: ClientCrosswordWord,
  row: number,
  col: number
): boolean {
  const start = word.cells[0];
  return start?.row === row && start?.col === col;
}

/**
 * Clues in number order. The same number lists across before down.
 */
export function orderedClues(
  words: ClientCrosswordWord[]
): ClientCrosswordWord[] {
  return [...words].sort((a, b) => {
    if (a.number !== b.number) {
      return a.number - b.number;
    }
    if (a.direction === b.direction) {
      return 0;
    }
    return a.direction === 'across' ? -1 : 1;
  });
}

/**
 * Next unsolved clue after `currentId` in numbered order, wrapping to the
 * start. Null when every other clue is already solved.
 */
export function nextUnsolvedClue(
  words: ClientCrosswordWord[],
  currentId: string,
  correctWordIds: readonly string[]
): ClientCrosswordWord | null {
  const sequence = orderedClues(words);
  const index = sequence.findIndex((word) => word.id === currentId);
  if (index < 0) {
    return null;
  }
  const later = sequence.slice(index + 1);
  const earlier = sequence.slice(0, index);
  return (
    [...later, ...earlier].find((word) => !isSolved(word, correctWordIds)) ??
    null
  );
}

/**
 * Direction to use when selecting a square.
 * A shared square prefers the word that starts there, unless that word is
 * already solved and the other is not. If both start here (or neither does)
 * and exactly one is unsolved, pick the unsolved word. A tie on a shared
 * start defaults to across.
 */
export function directionForCell(
  covering: ClientCrosswordWord[],
  row: number,
  col: number,
  current: CrosswordDirection,
  correctWordIds: readonly string[]
): CrosswordDirection {
  if (covering.length === 0) {
    return current;
  }
  if (covering.length === 1) {
    return covering[0].direction;
  }

  const starts = covering.filter((word) => isWordStart(word, row, col));
  const unsolved = covering.filter((word) => !isSolved(word, correctWordIds));

  if (starts.length === 1) {
    const start = starts[0];
    const other = covering.find((word) => word.id !== start.id);
    if (other && isSolved(start, correctWordIds) && !isSolved(other, correctWordIds)) {
      return other.direction;
    }
    return start.direction;
  }

  if (unsolved.length === 1) {
    return unsolved[0].direction;
  }

  if (starts.length > 1) {
    return (
      starts.find((word) => word.direction === 'across')?.direction ??
      starts[0].direction
    );
  }

  return (
    covering.find((word) => word.direction === current)?.direction ??
    covering[0].direction
  );
}

export function isCellCorrect(
  correctWordIds: string[],
  words: ClientCrosswordWord[],
  row: number,
  col: number
): boolean {
  return wordsAtCell(words, row, col).some((word) =>
    correctWordIds.includes(word.id)
  );
}

/** First empty cell in the word, or the first cell if all are filled. */
export function firstEmptyCellInWord(
  word: ClientCrosswordWord,
  letters: (string | null)[][]
): { row: number; col: number } {
  for (const cell of word.cells) {
    if (!(letters[cell.row]?.[cell.col] ?? '')) {
      return cell;
    }
  }
  return word.cells[0] ?? { row: word.row, col: word.col };
}

/**
 * Next empty open cell after `from` along the word in the given direction.
 * Returns null if there is no later empty cell in the word.
 */
export function nextEmptyCellInWord(
  word: ClientCrosswordWord,
  letters: (string | null)[][],
  from: { row: number; col: number }
): { row: number; col: number } | null {
  const index = word.cells.findIndex(
    (cell) => cell.row === from.row && cell.col === from.col
  );
  if (index < 0) {
    return null;
  }
  for (let i = index + 1; i < word.cells.length; i++) {
    const cell = word.cells[i];
    if (!(letters[cell.row]?.[cell.col] ?? '')) {
      return cell;
    }
  }
  return null;
}

/** Format elapsed milliseconds as mm:ss or h:mm:ss. */
export function formatElapsedMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/** Live play time from accumulated ms + optional active session start. */
export function computeElapsedMs(
  elapsedMs: number,
  activeSince: number | null,
  now: number = Date.now()
): number {
  if (activeSince == null) {
    return Math.max(0, elapsedMs);
  }
  return Math.max(0, elapsedMs + (now - activeSince));
}

