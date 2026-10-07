import {
  SUDOKU_BOX,
  SUDOKU_DEFAULT_ALPHABET,
  SUDOKU_SIZE,
  sudokuAlphabet,
  type SudokuFile,
  type SudokuPublicPuzzle,
} from './sudoku';

function digit(value: unknown): number | null {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 9
    ? value
    : null;
}

function solutionGrid(puzzle: SudokuFile): number[][] | { error: string } {
  if (!Array.isArray(puzzle.solution) || puzzle.solution.length !== SUDOKU_SIZE) {
    return { error: 'Sudoku must be 9×9' };
  }
  const grid: number[][] = [];
  for (let row = 0; row < SUDOKU_SIZE; row++) {
    const source = puzzle.solution[row];
    if (!Array.isArray(source) || source.length !== SUDOKU_SIZE) {
      return { error: 'Sudoku must be 9×9' };
    }
    const next: number[] = [];
    for (let col = 0; col < SUDOKU_SIZE; col++) {
      const value = digit(source[col]);
      if (value == null) {
        return { error: `Solution digit at ${row},${col} must be 1-9` };
      }
      next.push(value);
    }
    grid.push(next);
  }
  return grid;
}

function givensGrid(
  puzzle: SudokuFile,
  solution: number[][]
): (number | null)[][] | { error: string } {
  if (!Array.isArray(puzzle.givens) || puzzle.givens.length !== SUDOKU_SIZE) {
    return { error: 'Givens must be 9×9' };
  }
  const grid: (number | null)[][] = [];
  let blanks = 0;
  for (let row = 0; row < SUDOKU_SIZE; row++) {
    const source = puzzle.givens[row];
    if (!Array.isArray(source) || source.length !== SUDOKU_SIZE) {
      return { error: 'Givens must be 9×9' };
    }
    const next: (number | null)[] = [];
    for (let col = 0; col < SUDOKU_SIZE; col++) {
      const raw = source[col];
      if (raw == null) {
        blanks += 1;
        next.push(null);
        continue;
      }
      const value = digit(raw);
      if (value == null || value !== solution[row]?.[col]) {
        return { error: `Given at ${row},${col} does not match the solution` };
      }
      next.push(value);
    }
    grid.push(next);
  }
  if (blanks === 0) {
    return { error: 'Sudoku needs at least one empty cell' };
  }
  return grid;
}

function rulesHold(grid: number[][]): boolean {
  const seen = () => Array.from({ length: 10 }, () => false);
  for (let row = 0; row < SUDOKU_SIZE; row++) {
    const across = seen();
    const down = seen();
    for (let col = 0; col < SUDOKU_SIZE; col++) {
      const rowDigit = grid[row]?.[col] ?? 0;
      const colDigit = grid[col]?.[row] ?? 0;
      if (across[rowDigit] || down[colDigit]) {
        return false;
      }
      across[rowDigit] = true;
      down[colDigit] = true;
    }
  }
  for (let boxRow = 0; boxRow < SUDOKU_BOX; boxRow++) {
    for (let boxCol = 0; boxCol < SUDOKU_BOX; boxCol++) {
      const box = seen();
      for (let row = 0; row < SUDOKU_BOX; row++) {
        for (let col = 0; col < SUDOKU_BOX; col++) {
          const value = grid[boxRow * 3 + row]?.[boxCol * 3 + col] ?? 0;
          if (box[value]) {
            return false;
          }
          box[value] = true;
        }
      }
    }
  }
  return true;
}

function legal(grid: number[][], row: number, col: number, value: number): boolean {
  for (let index = 0; index < SUDOKU_SIZE; index++) {
    if (grid[row]?.[index] === value || grid[index]?.[col] === value) {
      return false;
    }
  }
  const startRow = Math.floor(row / SUDOKU_BOX) * SUDOKU_BOX;
  const startCol = Math.floor(col / SUDOKU_BOX) * SUDOKU_BOX;
  for (let r = startRow; r < startRow + SUDOKU_BOX; r++) {
    for (let c = startCol; c < startCol + SUDOKU_BOX; c++) {
      if (grid[r]?.[c] === value) {
        return false;
      }
    }
  }
  return true;
}

/** Counts solutions up to 2 so an ambiguous board fails quickly. */
export function sudokuSolutionCount(givens: readonly (number | null)[][]): number {
  const grid = givens.map((row) => row.map((cell) => cell ?? 0));
  const blanks: Array<[number, number]> = [];
  for (let row = 0; row < SUDOKU_SIZE; row++) {
    for (let col = 0; col < SUDOKU_SIZE; col++) {
      if (grid[row]?.[col] === 0) {
        blanks.push([row, col]);
      }
    }
  }
  let found = 0;
  const walk = (index: number) => {
    if (found >= 2) {
      return;
    }
    if (index === blanks.length) {
      found += 1;
      return;
    }
    const blank = blanks[index];
    if (!blank) {
      return;
    }
    const [row, col] = blank;
    for (let value = 1; value <= 9; value++) {
      if (legal(grid, row, col, value)) {
        const current = grid[row];
        if (!current) {
          return;
        }
        current[col] = value;
        walk(index + 1);
        current[col] = 0;
        if (found >= 2) {
          return;
        }
      }
    }
  };
  walk(0);
  return found;
}

function alphabetError(puzzle: SudokuFile): string | null {
  if (puzzle.alphabet == null) {
    return null;
  }
  if (
    !Array.isArray(puzzle.alphabet) ||
    puzzle.alphabet.length !== SUDOKU_SIZE
  ) {
    return 'Alphabet must list 9 symbols';
  }
  const seen = new Set<string>();
  for (let index = 0; index < SUDOKU_SIZE; index++) {
    const raw = puzzle.alphabet[index];
    if (typeof raw !== 'string') {
      return `Alphabet symbol at ${index} must be a single character`;
    }
    const symbol = raw.trim();
    if (symbol.length !== 1) {
      return `Alphabet symbol at ${index} must be a single character`;
    }
    const key = symbol.toUpperCase();
    if (seen.has(key)) {
      return 'Alphabet symbols must be unique';
    }
    seen.add(key);
  }
  return null;
}

export function validateSudokuFile(puzzle: SudokuFile): string | null {
  if (puzzle.id?.trim() === '' || puzzle.id == null) {
    return 'Sudoku id is required';
  }
  if (puzzle.title?.trim() === '' || puzzle.title == null) {
    return 'Sudoku title is required';
  }
  const alphabetIssue = alphabetError(puzzle);
  if (alphabetIssue) {
    return alphabetIssue;
  }
  const solution = solutionGrid(puzzle);
  if ('error' in solution) {
    return solution.error;
  }
  if (!rulesHold(solution)) {
    return 'Solution breaks sudoku rules';
  }
  const givens = givensGrid(puzzle, solution);
  if ('error' in givens) {
    return givens.error;
  }
  if (sudokuSolutionCount(givens) !== 1) {
    return 'Sudoku must have exactly one solution';
  }
  return null;
}

export function toPublicSudoku(puzzle: SudokuFile): SudokuPublicPuzzle {
  const alphabet = sudokuAlphabet(puzzle).map((symbol, index) => {
    const trimmed = symbol.trim();
    if (trimmed.length === 1 && /[a-z]/i.test(trimmed)) {
      return trimmed.toUpperCase();
    }
    return trimmed.length === 1
      ? trimmed
      : (SUDOKU_DEFAULT_ALPHABET[index] ?? String(index + 1));
  });
  return {
    id: puzzle.id,
    title: puzzle.title,
    rows: SUDOKU_SIZE,
    cols: SUDOKU_SIZE,
    alphabet,
  };
}
