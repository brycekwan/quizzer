import fs from 'fs';
import path from 'path';
import {
  deriveCrosswordWords,
  validateCrosswordFile,
  type CrosswordPuzzleFile,
  type CrosswordWord,
} from '@party/shared';

export function resolveCrosswordPuzzlesDir(): string {
  if (process.env.CROSSWORD_PUZZLES_DIR) {
    return path.resolve(process.env.CROSSWORD_PUZZLES_DIR);
  }

  const candidates = [
    path.resolve(process.cwd(), 'apps/server/crossword/puzzles'),
    path.resolve(process.cwd(), 'crossword/puzzles'),
    path.resolve(__dirname, '../../../crossword/puzzles'),
    path.resolve(__dirname, '../../crossword/puzzles'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

export function loadCrosswordPuzzle(
  id: string,
  dir = resolveCrosswordPuzzlesDir()
):
  | { ok: true; puzzle: CrosswordPuzzleFile; words: CrosswordWord[] }
  | { ok: false; error: string } {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    return { ok: false, error: 'Invalid crossword id' };
  }

  const filePath = path.join(dir, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Crossword "${id}" not found` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return { ok: false, error: `Could not read crossword "${id}"` };
  }

  const puzzle = raw as CrosswordPuzzleFile;
  if (!puzzle.id) {
    puzzle.id = id;
  }

  const validationError = validateCrosswordFile(puzzle);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const words = deriveCrosswordWords(puzzle);
  if ('error' in words) {
    return { ok: false, error: words.error };
  }

  return { ok: true, puzzle, words };
}

export function loadDefaultCrosswordPuzzle(
  dir = resolveCrosswordPuzzlesDir()
): { puzzle: CrosswordPuzzleFile; words: CrosswordWord[] } {
  const preferred = loadCrosswordPuzzle('foods', dir);
  if (preferred.ok) {
    return { puzzle: preferred.puzzle, words: preferred.words };
  }

  if (!fs.existsSync(dir)) {
    throw new Error(`No crossword puzzles found in ${dir}`);
  }

  const first = fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()[0];
  if (!first) {
    throw new Error(`No crossword puzzles found in ${dir}`);
  }

  const loaded = loadCrosswordPuzzle(first.replace(/\.json$/i, ''), dir);
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  return { puzzle: loaded.puzzle, words: loaded.words };
}
