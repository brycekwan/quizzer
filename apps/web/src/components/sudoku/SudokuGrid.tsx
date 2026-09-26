import type { SudokuCellState } from '@party/shared';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const CORRECT_FLASH_MS = 3000;

export function SudokuGrid({
  cells,
  selected,
  onSelect,
}: {
  cells: SudokuCellState[][];
  selected: { row: number; col: number } | null;
  onSelect: (row: number, col: number) => void;
}) {
  const flashing = useCorrectFlashes(cells);
  return (
    <div
      className="grid grid-cols-9 overflow-hidden rounded-lg border-2 border-ink bg-white"
      role="grid"
      aria-label="Sudoku"
    >
      {cells.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
          const isSelected =
            selected?.row === rowIndex && selected?.col === colIndex;
          const sameRow = selected?.row === rowIndex;
          const sameCol = selected?.col === colIndex;
          const sameBox =
            selected != null &&
            Math.floor(selected.row / 3) === Math.floor(rowIndex / 3) &&
            Math.floor(selected.col / 3) === Math.floor(colIndex / 3);
          const justCorrect = flashing.has(`${rowIndex}-${colIndex}`);
          const locked = cell.solved || cell.given;
          const shade = justCorrect
            ? 'bg-[#d8f3dc] duration-300'
            : isSelected
              ? 'bg-black/25'
              : sameRow || sameCol
                ? 'bg-black/[0.16]'
                : sameBox
                  ? 'bg-black/10'
                  : locked
                    ? 'bg-[#efe6d6] duration-700'
                    : 'bg-white';
          return (
            <button
              key={`${rowIndex}-${colIndex}`}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              aria-label={cellLabel(rowIndex, colIndex, cell)}
              onClick={() => onSelect(rowIndex, colIndex)}
              className={cn(
                'relative aspect-square border-b border-r border-ink/15 p-0 transition-colors',
                colIndex % 3 === 2 && 'border-r-2 border-r-ink',
                rowIndex % 3 === 2 && 'border-b-2 border-b-ink',
                shade,
                isSelected && 'z-10 ring-2 ring-inset ring-grape'
              )}
            >
              {cell.value != null ? (
                <span className="flex h-full items-center justify-center font-display text-lg font-bold text-ink sm:text-2xl">
                  {cell.value}
                </span>
              ) : (
                <span className="grid h-full w-full grid-cols-3 grid-rows-3 p-0.5">
                  {Array.from({ length: 9 }, (_, index) => {
                    const digit = index + 1;
                    const noted = cell.drafts.includes(digit);
                    const wrong = cell.wrongDrafts.includes(digit);
                    return (
                      <span
                        key={digit}
                        className={cn(
                          'flex items-center justify-center text-[0.55rem] font-bold leading-none text-transparent sm:text-[0.7rem]',
                          noted && 'text-ink/75',
                          wrong && 'rounded-[2px] bg-[#ffc9c9] text-ink'
                        )}
                      >
                        {digit}
                      </span>
                    );
                  })}
                </span>
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

function useCorrectFlashes(cells: SudokuCellState[][]): Set<string> {
  const solvedId = cells
    .map((row, rowIndex) =>
      row
        .map((cell, colIndex) => (cell.solved ? `${rowIndex}-${colIndex}` : ''))
        .filter(Boolean)
        .join(',')
    )
    .join('|');
  const seenId = useRef<string | null>(null);
  const flashUntil = useRef<Record<string, number>>({});
  const [, setTick] = useState(0);

  if (seenId.current == null) {
    seenId.current = solvedId;
  } else if (seenId.current !== solvedId) {
    const previous = new Set(seenId.current.split(/[|,]/).filter(Boolean));
    const next = new Set(solvedId.split(/[|,]/).filter(Boolean));
    const now = Date.now();
    for (const key of previous) {
      if (!next.has(key)) delete flashUntil.current[key];
    }
    for (const key of next) {
      if (!previous.has(key)) flashUntil.current[key] = now + CORRECT_FLASH_MS;
    }
    seenId.current = solvedId;
  }

  const flashSignature = Object.entries(flashUntil.current)
    .map(([key, until]) => `${key}:${until}`)
    .join('|');

  useEffect(() => {
    const now = Date.now();
    const deadlines = Object.values(flashUntil.current).filter(
      (until) => until > now
    );
    if (deadlines.length === 0) return;
    const delay = Math.max(0, Math.min(...deadlines) - now);
    const timer = window.setTimeout(() => {
      const expiredAt = Date.now();
      for (const [key, until] of Object.entries(flashUntil.current)) {
        if (until <= expiredAt) delete flashUntil.current[key];
      }
      setTick((tick) => tick + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [flashSignature]);

  const now = Date.now();
  return new Set(
    Object.entries(flashUntil.current)
      .filter(([, until]) => until > now)
      .map(([key]) => key)
  );
}

function cellLabel(row: number, col: number, cell: SudokuCellState): string {
  const place = `Row ${row + 1}, column ${col + 1}`;
  if (cell.given && cell.value != null) {
    return `${place}, given ${cell.value}`;
  }
  if (cell.solved && cell.value != null) {
    return `${place}, ${cell.hinted ? 'hint' : 'correct'} ${cell.value}`;
  }
  if (cell.drafts.length > 0) {
    return `${place}, notes ${cell.drafts.join(' ')}`;
  }
  return `${place}, empty`;
}
