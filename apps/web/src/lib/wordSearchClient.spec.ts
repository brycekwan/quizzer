import { describe, expect, it } from 'vitest';
import {
  WORD_SEARCH_FONT_FRACTION,
  WORD_SEARCH_MARK_PAD,
  appendTap,
  roundedRectForCells,
  selectionLine,
} from './wordSearchClient';

const rows = 20;
const cols = 20;

describe('selectionLine', () => {
  it('draws a horizontal span', () => {
    expect(
      selectionLine({ row: 2, col: 1 }, { row: 2, col: 4 }, rows, cols)
    ).toEqual([
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 2, col: 3 },
      { row: 2, col: 4 },
    ]);
  });

  it('snaps a mostly horizontal drag onto one row', () => {
    expect(
      selectionLine({ row: 0, col: 0 }, { row: 1, col: 6 }, rows, cols).map(
        (cell) => cell.row
      )
    ).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('follows a diagonal and stops at the grid edge', () => {
    const line = selectionLine(
      { row: 18, col: 18 },
      { row: 22, col: 22 },
      rows,
      cols
    );
    expect(line).toEqual([
      { row: 18, col: 18 },
      { row: 19, col: 19 },
    ]);
  });
});

describe('appendTap', () => {
  it('starts a path, continues in a straight line, and ignores a break', () => {
    const first = appendTap([], { row: 4, col: 4 }, rows, cols);
    const second = appendTap(first, { row: 5, col: 5 }, rows, cols);
    const third = appendTap(second, { row: 6, col: 6 }, rows, cols);
    expect(third).toEqual([
      { row: 4, col: 4 },
      { row: 5, col: 5 },
      { row: 6, col: 6 },
    ]);
    expect(appendTap(third, { row: 6, col: 8 }, rows, cols)).toEqual(third);
    expect(appendTap(first, { row: 4, col: 8 }, rows, cols)).toEqual(first);
  });
});

describe('roundedRectForCells', () => {
  it('boxes a horizontal word with rounded corners past the end letters', () => {
    const mark = roundedRectForCells([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]);
    expect(mark).not.toBeNull();
    if (!mark) {
      return;
    }
    expect(mark.cx).toBeCloseTo(1.5);
    expect(mark.cy).toBeCloseTo(0.5);
    expect(mark.angle).toBeCloseTo(0);
    const span = 2 + WORD_SEARCH_FONT_FRACTION + WORD_SEARCH_MARK_PAD * 2;
    expect(mark.width).toBeCloseTo(span);
    expect(mark.height).toBeLessThan(1);
    expect(mark.radius).toBeGreaterThan(0);
    expect(mark.radius).toBeLessThanOrEqual(mark.height / 2);
    expect(mark.x).toBeCloseTo(mark.cx - mark.width / 2);
  });
});
