import type { WordSearchCellRef } from '@party/shared';

/** Letter size as a fraction of one cell. The outline uses the same ratio. */
export const WORD_SEARCH_FONT_FRACTION = 0.62;
/** Cap height relative to the font size. */
export const WORD_SEARCH_GLYPH_HEIGHT_RATIO = 0.8;
/** Extra space so the stroke sits just outside the letters, in cell units. */
export const WORD_SEARCH_MARK_PAD = 0.1;

export interface WordSearchMark {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Corner radius in cell units. */
  radius: number;
  /** Degrees, clockwise from east when row increases downward. */
  angle: number;
  cx: number;
  cy: number;
}

export function samePath(
  a: readonly WordSearchCellRef[],
  b: readonly WordSearchCellRef[]
): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((cell, index) => cell.row === b[index].row && cell.col === b[index].col);
}

/**
 * Straight span from `anchor` toward `current`, snapped to the nearest of the
 * eight directions and clipped to the grid.
 */
export function selectionLine(
  anchor: WordSearchCellRef,
  current: WordSearchCellRef,
  rows: number,
  cols: number
): WordSearchCellRef[] {
  const dr = current.row - anchor.row;
  const dc = current.col - anchor.col;
  if (dr === 0 && dc === 0) {
    return [{ row: anchor.row, col: anchor.col }];
  }

  const adr = Math.abs(dr);
  const adc = Math.abs(dc);
  let stepR = Math.sign(dr);
  let stepC = Math.sign(dc);
  if (adr > adc * 2) {
    stepC = 0;
  } else if (adc > adr * 2) {
    stepR = 0;
  }

  const denom = stepR * stepR + stepC * stepC;
  let steps = Math.round((dr * stepR + dc * stepC) / denom);
  if (steps < 1) {
    steps = 1;
  }

  const cells: WordSearchCellRef[] = [];
  for (let i = 0; i <= steps; i++) {
    const row = anchor.row + stepR * i;
    const col = anchor.col + stepC * i;
    if (row < 0 || col < 0 || row >= rows || col >= cols) {
      break;
    }
    cells.push({ row, col });
  }
  return cells.length > 0 ? cells : [{ row: anchor.row, col: anchor.col }];
}

/** Add one letter, or toggle off a letter at either end of the path. */
export function appendTap(
  path: readonly WordSearchCellRef[],
  cell: WordSearchCellRef,
  rows: number,
  cols: number
): WordSearchCellRef[] {
  if (cell.row < 0 || cell.col < 0 || cell.row >= rows || cell.col >= cols) {
    return [...path];
  }
  if (path.length === 0) {
    return [{ row: cell.row, col: cell.col }];
  }

  const start = path[0];
  const last = path[path.length - 1];
  const isStart = start.row === cell.row && start.col === cell.col;
  const isLast = last.row === cell.row && last.col === cell.col;
  if (isStart || isLast) {
    if (path.length === 1) {
      return [];
    }
    if (isLast) {
      return path.slice(0, -1);
    }
    return path.slice(1);
  }

  if (path.length === 1) {
    const dr = cell.row - start.row;
    const dc = cell.col - start.col;
    if (Math.abs(dr) <= 1 && Math.abs(dc) <= 1) {
      return [start, { row: cell.row, col: cell.col }];
    }
    return [...path];
  }

  const stepR = path[1].row - start.row;
  const stepC = path[1].col - start.col;
  const next = { row: last.row + stepR, col: last.col + stepC };
  if (
    next.row === cell.row &&
    next.col === cell.col &&
    next.row >= 0 &&
    next.col >= 0 &&
    next.row < rows &&
    next.col < cols
  ) {
    return [...path, { row: cell.row, col: cell.col }];
  }
  return [...path];
}

/**
 * Rounded rectangle in grid cell units. The box follows the ink of the
 * letters, extended by half a glyph past each end letter.
 */
export function roundedRectForCells(
  cells: readonly WordSearchCellRef[]
): WordSearchMark | null {
  if (cells.length < 2) {
    return null;
  }
  const first = cells[0];
  const last = cells[cells.length - 1];
  const dx = last.col - first.col;
  const dy = last.row - first.row;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) {
    return null;
  }

  const glyph = WORD_SEARCH_FONT_FRACTION;
  const pad = WORD_SEARCH_MARK_PAD;
  const width = distance + glyph + pad * 2;
  const height = glyph * WORD_SEARCH_GLYPH_HEIGHT_RATIO + pad * 2;
  const cx = (first.col + last.col) / 2 + 0.5;
  const cy = (first.row + last.row) / 2 + 0.5;
  return {
    x: cx - width / 2,
    y: cy - height / 2,
    width,
    height,
    radius: Math.min(height / 2, 0.22),
    angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    cx,
    cy,
  };
}
