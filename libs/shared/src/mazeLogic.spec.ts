import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MazeDifficulty, MazeFile } from './maze';
import { validateMazeFile } from './mazeLogic';

function load(folder: string, id: string): MazeFile {
  const file = path.resolve('apps/server/maze', folder, `${id}.json`);
  return JSON.parse(readFileSync(file, 'utf8')) as MazeFile;
}

describe('validateMazeFile', () => {
  it.each([
    ['easy', 'nursery', 'easy'],
    ['medium', 'kitchen', 'medium'],
    ['hard', 'bottle', 'hard'],
  ] as const)('accepts the %s trial maze', (folder, id, difficulty: MazeDifficulty) => {
    expect(validateMazeFile(load(folder, id), difficulty)).toBeNull();
  });

  it('rejects a maze in the wrong difficulty', () => {
    expect(validateMazeFile(load('easy', 'nursery'), 'medium')).toBe(
      'Medium maze must be 15×15'
    );
  });
});
