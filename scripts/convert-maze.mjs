#!/usr/bin/env node
// Convert a wall-grid maze into a party maze pack.
//
//   node scripts/convert-maze.mjs <input.json> <easy|medium|hard> <startRow,startCol> <targetRow,targetCol> [--out file.json] [--id id] [--title title]
//
// The input is `{ width, height, grid }`. Each cell is `{ w: { top, right, bottom, left } }`
// with `true` meaning a wall. The output is the pack format used under apps/server/maze.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const SIZES = { easy: 12, medium: 15, hard: 20 };
const DIRECTIONS = [
  ['n', -1, 0, 's'],
  ['e', 0, 1, 'w'],
  ['s', 1, 0, 'n'],
  ['w', 0, -1, 'e'],
];

function usage() {
  return [
    'Usage: node scripts/convert-maze.mjs <input.json> <easy|medium|hard> <startRow,startCol> <targetRow,targetCol> [--out file.json] [--id id] [--title title]',
    '',
    'easy is 12×12, medium is 15×15, and hard is 20×20.',
    'med is accepted as medium. Coordinates are zero-based row,col.',
  ].join('\n');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--out' || arg === '--id' || arg === '--title') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        fail(`${arg} needs a value.\n\n${usage()}`);
      }
      flags[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      fail(`Unknown option ${arg}.\n\n${usage()}`);
    }
    positional.push(arg);
  }
  if (positional.length !== 4) {
    fail(usage());
  }
  const [input, hardness, startText, targetText] = positional;
  const difficulty = hardness === 'med' ? 'medium' : hardness;
  if (!SIZES[difficulty]) {
    fail(`Hardness must be easy, medium, or hard.\n\n${usage()}`);
  }
  return {
    input,
    difficulty,
    start: parsePoint(startText, 'start'),
    target: parsePoint(targetText, 'end'),
    out: flags.out,
    id: flags.id,
    title: flags.title,
  };
}

function parsePoint(text, label) {
  const match = /^(\d+)\s*,\s*(\d+)$/.exec(text);
  if (!match) {
    fail(`${label} must be row,col, for example 0,0.`);
  }
  return { row: Number(match[1]), col: Number(match[2]) };
}

function readSource(file) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`Could not read ${file}: ${error instanceof Error ? error.message : error}`);
  }
  if (!parsed || !Array.isArray(parsed.grid)) {
    fail('Input must be a JSON object with a grid array.');
  }
  const height = parsed.grid.length;
  const width = parsed.grid[0]?.length ?? 0;
  if (!Number.isInteger(parsed.width) || !Number.isInteger(parsed.height)) {
    fail('Input must include numeric width and height.');
  }
  if (parsed.height !== height || parsed.width !== width) {
    fail(
      `Input says ${parsed.width}×${parsed.height} but the grid is ${width}×${height}.`
    );
  }
  if (parsed.grid.some((row) => !Array.isArray(row) || row.length !== width)) {
    fail('Every grid row must have the same number of cells.');
  }
  return { width, height, grid: parsed.grid };
}

function wallsOf(cell, row, col) {
  const walls = cell?.w;
  if (!walls || ['top', 'right', 'bottom', 'left'].some((side) => typeof walls[side] !== 'boolean')) {
    fail(`Cell ${row},${col} needs w.top, w.right, w.bottom, and w.left booleans.`);
  }
  return { n: walls.top, e: walls.right, s: walls.bottom, w: walls.left };
}

function slug(file) {
  return path
    .basename(file, path.extname(file))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function titleFrom(id) {
  return id
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function same(a, b) {
  return a.row === b.row && a.col === b.col;
}

function inBounds(cell, size) {
  return cell.row >= 0 && cell.col >= 0 && cell.row < size && cell.col < size;
}

function reachable(puzzle) {
  const stack = [puzzle.start];
  const seen = [puzzle.start];
  while (stack.length > 0) {
    const cell = stack.pop();
    if (same(cell, puzzle.target)) {
      return true;
    }
    for (const [direction, rowStep, colStep] of DIRECTIONS) {
      if (puzzle.walls[cell.row][cell.col][direction]) {
        continue;
      }
      const next = { row: cell.row + rowStep, col: cell.col + colStep };
      if (!inBounds(next, puzzle.rows) || !puzzle.open[next.row][next.col]) {
        continue;
      }
      if (puzzle.walls[next.row][next.col][opposite(direction)]) {
        continue;
      }
      if (seen.some((entry) => same(entry, next))) {
        continue;
      }
      seen.push(next);
      stack.push(next);
    }
  }
  return false;
}

function opposite(direction) {
  return DIRECTIONS.find(([name]) => name === direction)?.[3];
}

function convert(source, args) {
  const size = SIZES[args.difficulty];
  if (source.width !== size || source.height !== size) {
    const label = args.difficulty[0].toUpperCase() + args.difficulty.slice(1);
    fail(`${label} maze must be ${size}×${size}. This file is ${source.width}×${source.height}.`);
  }
  const walls = source.grid.map((row, rowIndex) =>
    row.map((cell, colIndex) => wallsOf(cell, rowIndex, colIndex))
  );
  const open = walls.map((row) => row.map(() => true));
  const id = args.id || slug(args.input) || 'maze';
  const puzzle = {
    id,
    title: args.title || titleFrom(id) || 'Maze',
    rows: size,
    cols: size,
    start: args.start,
    target: args.target,
    open,
    walls,
  };
  check(puzzle, args.difficulty);
  return puzzle;
}

function check(puzzle, difficulty) {
  const size = puzzle.rows;
  if (!inBounds(puzzle.start, size)) {
    fail(`Start ${puzzle.start.row},${puzzle.start.col} is outside the maze.`);
  }
  if (!inBounds(puzzle.target, size)) {
    fail(`End ${puzzle.target.row},${puzzle.target.col} is outside the maze.`);
  }
  if (same(puzzle.start, puzzle.target)) {
    fail('Start and end must be different cells.');
  }
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      for (const [direction, rowStep, colStep, back] of DIRECTIONS) {
        const next = { row: row + rowStep, col: col + colStep };
        const blocked = puzzle.walls[row][col][direction];
        if (!inBounds(next, size)) {
          if (!blocked) {
            fail(`Outer border at ${row},${col} must be walled.`);
          }
          continue;
        }
        if (blocked !== puzzle.walls[next.row][next.col][back]) {
          fail(`Walls at ${row},${col} are not symmetric.`);
        }
      }
    }
  }
  if (!reachable(puzzle)) {
    fail(
      `End ${puzzle.target.row},${puzzle.target.col} cannot be reached from ${puzzle.start.row},${puzzle.start.col} without revisiting a cell.`
    );
  }
  if (!SIZES[difficulty]) {
    fail(`Unknown hardness ${difficulty}.`);
  }
}

const args = parseArgs(process.argv.slice(2));
const puzzle = convert(readSource(args.input), args);
const json = `${JSON.stringify(puzzle, null, 2)}\n`;
if (args.out) {
  writeFileSync(args.out, json);
  console.error(`Wrote ${args.difficulty} maze ${puzzle.id} to ${args.out}`);
} else {
  process.stdout.write(json);
}
