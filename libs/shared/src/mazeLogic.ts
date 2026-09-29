import {
  mazeSize,
  type MazeCellRef,
  type MazeDifficulty,
  type MazeDirection,
  type MazeFile,
  type MazePublicPuzzle,
  type MazeWalls,
} from './maze';

const DIRECTIONS: MazeDirection[] = ['n', 'e', 's', 'w'];

function delta(direction: MazeDirection): { row: number; col: number } {
  switch (direction) {
    case 'n':
      return { row: -1, col: 0 };
    case 'e':
      return { row: 0, col: 1 };
    case 's':
      return { row: 1, col: 0 };
    case 'w':
      return { row: 0, col: -1 };
  }
}

function opposite(direction: MazeDirection): MazeDirection {
  switch (direction) {
    case 'n':
      return 's';
    case 'e':
      return 'w';
    case 's':
      return 'n';
    case 'w':
      return 'e';
  }
}

function inBounds(cell: MazeCellRef, size: number): boolean {
  return cell.row >= 0 && cell.col >= 0 && cell.row < size && cell.col < size;
}

function sameCell(left: MazeCellRef, right: MazeCellRef): boolean {
  return left.row === right.row && left.col === right.col;
}

function wallsAt(puzzle: MazeFile, cell: MazeCellRef): MazeWalls | null {
  return puzzle.walls[cell.row]?.[cell.col] ?? null;
}

function blocked(walls: MazeWalls, direction: MazeDirection): boolean {
  return walls[direction];
}

export function passageOpen(
  puzzle: MazeFile,
  from: MazeCellRef,
  direction: MazeDirection
): boolean {
  const step = delta(direction);
  const to = { row: from.row + step.row, col: from.col + step.col };
  if (!inBounds(from, puzzle.rows) || !inBounds(to, puzzle.rows)) {
    return false;
  }
  if (!puzzle.open[from.row]?.[from.col] || !puzzle.open[to.row]?.[to.col]) {
    return false;
  }
  const fromWalls = wallsAt(puzzle, from);
  const toWalls = wallsAt(puzzle, to);
  if (!fromWalls || !toWalls) {
    return false;
  }
  return !blocked(fromWalls, direction) && !blocked(toWalls, opposite(direction));
}

function targetReachable(puzzle: MazeFile): boolean {
  const seen: MazeCellRef[] = [puzzle.start];
  const stack = [puzzle.start];
  while (stack.length > 0) {
    const cell = stack.pop();
    if (!cell) {
      break;
    }
    if (sameCell(cell, puzzle.target)) {
      return true;
    }
    for (const direction of DIRECTIONS) {
      if (!passageOpen(puzzle, cell, direction)) {
        continue;
      }
      const step = delta(direction);
      const next = { row: cell.row + step.row, col: cell.col + step.col };
      if (seen.some((entry) => sameCell(entry, next))) {
        continue;
      }
      seen.push(next);
      stack.push(next);
    }
  }
  return false;
}

export function validateMazeFile(
  puzzle: MazeFile,
  difficulty: MazeDifficulty
): string | null {
  const size = mazeSize(difficulty);
  if (puzzle.rows !== size || puzzle.cols !== size) {
    return `${label(difficulty)} maze must be ${size}×${size}`;
  }
  if (puzzle.open.length !== size || puzzle.walls.length !== size) {
    return `${label(difficulty)} maze must be ${size}×${size}`;
  }
  for (let row = 0; row < size; row++) {
    if (puzzle.open[row]?.length !== size || puzzle.walls[row]?.length !== size) {
      return `${label(difficulty)} maze must be ${size}×${size}`;
    }
  }
  if (!inBounds(puzzle.start, size) || !puzzle.open[puzzle.start.row]?.[puzzle.start.col]) {
    return 'Start must be an open cell';
  }
  if (!inBounds(puzzle.target, size) || !puzzle.open[puzzle.target.row]?.[puzzle.target.col]) {
    return 'Target must be an open cell';
  }
  if (sameCell(puzzle.start, puzzle.target)) {
    return 'Start and target must be different cells';
  }
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const cell = { row, col };
      const walls = wallsAt(puzzle, cell);
      if (!walls) {
        return `${label(difficulty)} maze must be ${size}×${size}`;
      }
      for (const direction of DIRECTIONS) {
        const step = delta(direction);
        const next = { row: row + step.row, col: col + step.col };
        const isBlocked = blocked(walls, direction);
        if (!inBounds(next, size)) {
          if (!isBlocked) {
            return `Outer border at ${row},${col} must be walled`;
          }
          continue;
        }
        const neighbor = wallsAt(puzzle, next);
        if (!neighbor || isBlocked !== blocked(neighbor, opposite(direction))) {
          return `Walls at ${row},${col} are not symmetric`;
        }
      }
    }
  }
  if (!targetReachable(puzzle)) {
    return 'Target must be reachable without revisiting a cell';
  }
  return null;
}

function label(difficulty: MazeDifficulty): string {
  switch (difficulty) {
    case 'easy':
      return 'Easy';
    case 'medium':
      return 'Medium';
    case 'hard':
      return 'Hard';
  }
}

export function toPublicMaze(
  puzzle: MazeFile,
  difficulty: MazeDifficulty
): MazePublicPuzzle {
  return {
    id: puzzle.id,
    title: puzzle.title,
    difficulty,
    rows: puzzle.rows,
    cols: puzzle.cols,
    start: puzzle.start,
    target: puzzle.target,
    open: puzzle.open,
    walls: puzzle.walls,
  };
}
