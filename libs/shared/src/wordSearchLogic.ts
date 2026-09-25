import {
  WORD_SEARCH_DIRECTIONS,
  WORD_SEARCH_SIZE,
  WORD_SEARCH_WORD_COUNT,
  type WordSearchCellRef,
  type WordSearchDirection,
  type WordSearchFile,
  type WordSearchPublicPuzzle,
  type WordSearchWord,
} from './wordSearch';

export const WORD_SEARCH_DELTAS: Record<
  WordSearchDirection,
  { dr: number; dc: number }
> = {
  E: { dr: 0, dc: 1 },
  W: { dr: 0, dc: -1 },
  N: { dr: -1, dc: 0 },
  S: { dr: 1, dc: 0 },
  NE: { dr: -1, dc: 1 },
  NW: { dr: -1, dc: -1 },
  SE: { dr: 1, dc: 1 },
  SW: { dr: 1, dc: -1 },
};

export function cellsForPlacement(
  word: string,
  row: number,
  col: number,
  direction: WordSearchDirection,
  rows: number,
  cols: number
): WordSearchCellRef[] | { error: string } {
  const letters = word.trim().toUpperCase();
  if (!/^[A-Z]{2,}$/.test(letters)) {
    return { error: `Invalid word "${word}"` };
  }
  const { dr, dc } = WORD_SEARCH_DELTAS[direction];
  const cells: WordSearchCellRef[] = [];
  for (let i = 0; i < letters.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    if (r < 0 || c < 0 || r >= rows || c >= cols) {
      return { error: `"${letters}" runs off the grid` };
    }
    cells.push({ row: r, col: c });
  }
  return cells;
}

function sameCell(a: WordSearchCellRef, b: WordSearchCellRef): boolean {
  return a.row === b.row && a.col === b.col;
}

/** True when `cells` is the placement forward or reversed. */
export function selectionMatchesWord(
  cells: readonly WordSearchCellRef[],
  word: WordSearchWord
): boolean {
  if (cells.length !== word.cells.length || cells.length === 0) {
    return false;
  }
  const forward = cells.every((cell, index) =>
    sameCell(cell, word.cells[index])
  );
  if (forward) {
    return true;
  }
  return cells.every((cell, index) =>
    sameCell(cell, word.cells[word.cells.length - 1 - index])
  );
}

export function deriveWordSearchWords(
  puzzle: WordSearchFile
): WordSearchWord[] | { error: string } {
  if (!Array.isArray(puzzle.words)) {
    return { error: 'Word list is required' };
  }

  const rows = puzzle.grid?.length ?? 0;
  const cols = puzzle.grid?.[0]?.length ?? 0;
  const words: WordSearchWord[] = [];
  const seen = new Set<string>();

  for (const placement of puzzle.words) {
    const word = placement.word?.trim().toUpperCase() ?? '';
    if (seen.has(word)) {
      return { error: `Duplicate word ${word}` };
    }
    if (!WORD_SEARCH_DIRECTIONS.includes(placement.direction)) {
      return { error: `Invalid direction for ${word || 'a word'}` };
    }
    const cells = cellsForPlacement(
      word,
      placement.row,
      placement.col,
      placement.direction,
      rows,
      cols
    );
    if ('error' in cells) {
      return cells;
    }
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const letter = puzzle.grid[cell.row]?.[cell.col]?.toUpperCase() ?? '';
      if (letter !== word[i]) {
        return {
          error: `${word} does not match the grid at (${cell.row},${cell.col})`,
        };
      }
    }
    seen.add(word);
    words.push({
      id: word,
      word,
      row: placement.row,
      col: placement.col,
      direction: placement.direction,
      cells,
    });
  }

  return words;
}

export function toPublicWordSearch(
  puzzle: WordSearchFile,
  words: WordSearchWord[]
): WordSearchPublicPuzzle {
  return {
    id: puzzle.id,
    title: puzzle.title,
    rows: puzzle.grid.length,
    cols: puzzle.grid[0]?.length ?? 0,
    grid: puzzle.grid.map((row) => row.map((letter) => letter.toUpperCase())),
    words: words.map((word) => word.word),
  };
}

export function validateWordSearchFile(puzzle: WordSearchFile): string | null {
  if (!puzzle?.id?.trim()) {
    return 'Word search id is required';
  }
  if (!puzzle.title?.trim()) {
    return 'Word search title is required';
  }
  if (!Array.isArray(puzzle.grid) || puzzle.grid.length !== WORD_SEARCH_SIZE) {
    return `Word search grid must be ${WORD_SEARCH_SIZE}×${WORD_SEARCH_SIZE}`;
  }

  for (let r = 0; r < puzzle.grid.length; r++) {
    const row = puzzle.grid[r];
    if (!Array.isArray(row) || row.length !== WORD_SEARCH_SIZE) {
      return `Grid row ${r} must have ${WORD_SEARCH_SIZE} letters`;
    }
    for (let c = 0; c < row.length; c++) {
      const letter = row[c];
      if (typeof letter !== 'string' || !/^[A-Za-z]$/.test(letter)) {
        return `Invalid grid letter at ${r},${c}`;
      }
    }
  }

  if (!Array.isArray(puzzle.words)) {
    return 'Word list is required';
  }
  if (puzzle.words.length !== WORD_SEARCH_WORD_COUNT) {
    return `Word search needs exactly ${WORD_SEARCH_WORD_COUNT} words`;
  }

  const derived = deriveWordSearchWords(puzzle);
  if ('error' in derived) {
    return derived.error;
  }

  return null;
}
