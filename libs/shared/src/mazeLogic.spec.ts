import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { MazeDifficulty, MazeDirection, MazeFile, MazePlayerSnapshot } from './maze';
import { passageOpen, predictMazeMove, toPublicMaze, validateMazeFile } from './mazeLogic';

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

describe('predictMazeMove', () => {
  const file = load('easy', 'nursery');
  const directions: MazeDirection[] = ['n', 'e', 's', 'w'];
  const open = directions.find((direction) => passageOpen(file, file.start, direction));
  const blocked = directions.find((direction) => !passageOpen(file, file.start, direction));

  function playing(overrides: Partial<MazePlayerSnapshot> = {}): MazePlayerSnapshot {
    return {
      level: 'easy',
      puzzle: toPublicMaze(file, 'easy'),
      position: file.start,
      visited: [file.start],
      lives: 3,
      score: 0,
      phase: 'playing',
      splashUntil: null,
      levelsCleared: 0,
      elapsedMs: 0,
      activeSince: null,
      completedAt: null,
      ...overrides,
    };
  }

  it('steps through an open passage and records the path', () => {
    const next = predictMazeMove(playing(), open!);
    expect(next).not.toBeNull();
    expect(next!.visited).toHaveLength(2);
    expect(next!.visited[1]).toEqual(next!.position);
  });

  it('refuses walls and going back', () => {
    expect(predictMazeMove(playing(), blocked!)).toBeNull();
    const moved = predictMazeMove(playing(), open!)!;
    const back = { n: 's', s: 'n', e: 'w', w: 'e' } as const;
    expect(predictMazeMove(moved, back[open!])).toBeNull();
  });

  it('waits for the splash to end and holds at the target', () => {
    expect(predictMazeMove(playing({ phase: 'splash', splashUntil: 2_000 }), open!, 1_000)).toBeNull();
    const after = predictMazeMove(playing({ phase: 'splash', splashUntil: 2_000 }), open!, 2_000);
    expect(after?.phase).toBe('playing');
    expect(predictMazeMove(playing({ phase: 'intro' }), open!)).toBeNull();
    const atTarget = playing({ position: file.target, visited: [file.start, file.target] });
    expect(directions.every((direction) => predictMazeMove(atTarget, direction) === null)).toBe(true);
  });
});
