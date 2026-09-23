import {
  MAX_CROSSWORD_CLUES_PER_DIRECTION,
  type CrosswordClueDef,
  type CrosswordCluePublic,
  type CrosswordDirection,
  type CrosswordPublicPuzzle,
  type CrosswordPuzzleFile,
  type CrosswordWord,
} from './crossword';

function walkAnswer(
  grid: (string | null)[][],
  row: number,
  col: number,
  direction: CrosswordDirection
): { answer: string; cells: { row: number; col: number }[] } | { error: string } {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  if (row < 0 || col < 0 || row >= rows || col >= cols) {
    return { error: 'Clue start is out of bounds' };
  }
  if (grid[row][col] == null) {
    return { error: 'Clue start is on a block' };
  }

  const cells: { row: number; col: number }[] = [];
  let answer = '';
  let r = row;
  let c = col;
  while (r < rows && c < cols && grid[r][c] != null) {
    const letter = grid[r][c] as string;
    if (!/^[A-Za-z]$/.test(letter)) {
      return { error: `Invalid grid letter at ${r},${c}` };
    }
    answer += letter.toUpperCase();
    cells.push({ row: r, col: c });
    if (direction === 'across') {
      c += 1;
    } else {
      r += 1;
    }
  }

  if (cells.length < 2) {
    return { error: 'Words must be at least 2 letters' };
  }

  return { answer, cells };
}

function wordId(direction: CrosswordDirection, number: number): string {
  return `${direction}-${number}`;
}

function deriveDirection(
  grid: (string | null)[][],
  clues: CrosswordClueDef[],
  direction: CrosswordDirection
): CrosswordWord[] | { error: string } {
  const words: CrosswordWord[] = [];
  const seen = new Set<number>();

  for (const clue of clues) {
    if (seen.has(clue.number)) {
      return { error: `Duplicate ${direction} clue number ${clue.number}` };
    }
    seen.add(clue.number);

    const walked = walkAnswer(grid, clue.row, clue.col, direction);
    if ('error' in walked) {
      return {
        error: `${direction} ${clue.number}: ${walked.error}`,
      };
    }

    words.push({
      id: wordId(direction, clue.number),
      number: clue.number,
      direction,
      row: clue.row,
      col: clue.col,
      clue: clue.clue.trim(),
      length: walked.answer.length,
      answer: walked.answer,
      cells: walked.cells,
    });
  }

  return words;
}

export function deriveCrosswordWords(
  puzzle: CrosswordPuzzleFile
): CrosswordWord[] | { error: string } {
  const across = deriveDirection(puzzle.grid, puzzle.across, 'across');
  if ('error' in across) {
    return across;
  }
  const down = deriveDirection(puzzle.grid, puzzle.down, 'down');
  if ('error' in down) {
    return down;
  }
  return [...across, ...down];
}

export function validateCrosswordFile(
  puzzle: CrosswordPuzzleFile
): string | null {
  if (!puzzle?.id?.trim()) {
    return 'Crossword id is required';
  }
  if (!puzzle.title?.trim()) {
    return 'Crossword title is required';
  }
  if (!Array.isArray(puzzle.grid) || puzzle.grid.length === 0) {
    return 'Crossword grid is required';
  }

  const cols = puzzle.grid[0]?.length ?? 0;
  if (cols === 0) {
    return 'Crossword grid has no columns';
  }
  for (let r = 0; r < puzzle.grid.length; r++) {
    const row = puzzle.grid[r];
    if (!Array.isArray(row) || row.length !== cols) {
      return `Grid row ${r} has inconsistent length`;
    }
  }

  if (!Array.isArray(puzzle.across) || !Array.isArray(puzzle.down)) {
    return 'Across and down clue lists are required';
  }
  if (puzzle.across.length === 0 || puzzle.down.length === 0) {
    return 'Crossword needs at least one across and one down clue';
  }
  if (puzzle.across.length > MAX_CROSSWORD_CLUES_PER_DIRECTION) {
    return `At most ${MAX_CROSSWORD_CLUES_PER_DIRECTION} across clues`;
  }
  if (puzzle.down.length > MAX_CROSSWORD_CLUES_PER_DIRECTION) {
    return `At most ${MAX_CROSSWORD_CLUES_PER_DIRECTION} down clues`;
  }

  for (const clue of [...puzzle.across, ...puzzle.down]) {
    if (!Number.isInteger(clue.number) || clue.number < 1) {
      return 'Clue numbers must be positive integers';
    }
    if (!clue.clue?.trim()) {
      return `Clue ${clue.number} is missing text`;
    }
  }

  const words = deriveCrosswordWords(puzzle);
  if ('error' in words) {
    return words.error;
  }

  const runError = validateMaximalRuns(puzzle.grid, words);
  if (runError) {
    return runError;
  }

  return null;
}

/** Every open run of 2+ cells must match exactly one clue word. */
function validateMaximalRuns(
  grid: (string | null)[][],
  words: CrosswordWord[]
): string | null {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const covered = new Set(words.map((word) => wordKey(word)));

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (grid[r][c] == null) {
        c += 1;
        continue;
      }
      const start = c;
      while (c < cols && grid[r][c] != null) {
        c += 1;
      }
      const length = c - start;
      if (length >= 2) {
        const key = `across:${r}:${start}:${length}`;
        if (!covered.has(key)) {
          return `Open across run at (${r},${start}) length ${length} has no clue (words must be separated by blocks)`;
        }
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      if (grid[r][c] == null) {
        r += 1;
        continue;
      }
      const start = r;
      while (r < rows && grid[r][c] != null) {
        r += 1;
      }
      const length = r - start;
      if (length >= 2) {
        const key = `down:${start}:${c}:${length}`;
        if (!covered.has(key)) {
          return `Open down run at (${start},${c}) length ${length} has no clue (words must be separated by blocks)`;
        }
      }
    }
  }

  return null;
}

function wordKey(word: CrosswordWord): string {
  return `${word.direction}:${word.row}:${word.col}:${word.length}`;
}

function toCluePublic(word: CrosswordWord): CrosswordCluePublic {
  return {
    number: word.number,
    row: word.row,
    col: word.col,
    clue: word.clue,
    length: word.length,
  };
}

export function toPublicCrosswordPuzzle(
  puzzle: CrosswordPuzzleFile,
  words: CrosswordWord[]
): CrosswordPublicPuzzle {
  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0].length;
  const open = puzzle.grid.map((row) => row.map((cell) => cell != null));
  const cellNumbers: (number | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );

  for (const word of words) {
    const existing = cellNumbers[word.row][word.col];
    if (existing == null || word.number < existing) {
      cellNumbers[word.row][word.col] = word.number;
    }
  }

  return {
    id: puzzle.id,
    title: puzzle.title,
    rows,
    cols,
    open,
    cellNumbers,
    across: words.filter((w) => w.direction === 'across').map(toCluePublic),
    down: words.filter((w) => w.direction === 'down').map(toCluePublic),
  };
}

export function wordsCoveringCell(
  words: CrosswordWord[],
  row: number,
  col: number
): CrosswordWord[] {
  return words.filter((word) =>
    word.cells.some((cell) => cell.row === row && cell.col === col)
  );
}

/** Empty letter grid matching puzzle shape (`null` blocks, `''` open). */
export function emptyLetterGrid(
  puzzle: CrosswordPuzzleFile
): (string | null)[][] {
  return puzzle.grid.map((row) =>
    row.map((cell) => (cell == null ? null : ''))
  );
}
