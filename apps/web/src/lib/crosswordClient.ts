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
