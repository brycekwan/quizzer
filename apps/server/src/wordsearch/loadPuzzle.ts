import fs from 'fs';
import path from 'path';
import {
  deriveWordSearchWords,
  validateWordSearchFile,
  type WordSearchFile,
  type WordSearchPuzzleInfo,
  type WordSearchWord,
} from '@party/shared';

export function resolveWordSearchPuzzlesDir(): string {
  if (process.env.WORDSEARCH_PUZZLES_DIR) {
    return path.resolve(process.env.WORDSEARCH_PUZZLES_DIR);
  }

  const candidates = [
    path.resolve(process.cwd(), 'apps/server/wordsearch/puzzles'),
    path.resolve(process.cwd(), 'wordsearch/puzzles'),
    path.resolve(__dirname, '../../../wordsearch/puzzles'),
    path.resolve(__dirname, '../../wordsearch/puzzles'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

/** List puzzle JSON files; `label` is the filename (e.g. `canada.json`). */
export function listWordSearchPuzzles(
  dir = resolveWordSearchPuzzlesDir()
): WordSearchPuzzleInfo[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => ({
      id: file.replace(/\.json$/i, ''),
      label: file,
    }));
}

export function loadWordSearchPuzzle(
  id: string,
  dir = resolveWordSearchPuzzlesDir()
):
  | { ok: true; puzzle: WordSearchFile; words: WordSearchWord[] }
  | { ok: false; error: string } {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    return { ok: false, error: 'Invalid word search id' };
  }

  const filePath = path.join(dir, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Word search "${id}" not found` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return { ok: false, error: `Could not read word search "${id}"` };
  }

  const puzzle = raw as WordSearchFile;
  if (!puzzle.id) {
    puzzle.id = id;
  }

  const validationError = validateWordSearchFile(puzzle);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const words = deriveWordSearchWords(puzzle);
  if ('error' in words) {
    return { ok: false, error: words.error };
  }

  return { ok: true, puzzle, words };
}

export function loadDefaultWordSearchPuzzle(
  dir = resolveWordSearchPuzzlesDir()
): {
  puzzle: WordSearchFile;
  words: WordSearchWord[];
  puzzles: WordSearchPuzzleInfo[];
} {
  const puzzles = listWordSearchPuzzles(dir);
  if (puzzles.length === 0) {
    throw new Error(`No word search puzzles found in ${dir}`);
  }

  const preferredId =
    puzzles.find((puzzle) => puzzle.id === 'canada')?.id ?? puzzles[0].id;
  const loaded = loadWordSearchPuzzle(preferredId, dir);
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }
  return { puzzle: loaded.puzzle, words: loaded.words, puzzles };
}
