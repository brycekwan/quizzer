import { useRef } from 'react';
import type { WordSearchCellRef, WordSearchFoundWord } from '@party/shared';
import { cn } from '@/lib/utils';
import {
  appendTap,
  roundedRectForCells,
  samePath,
  selectionLine,
} from '@/lib/wordSearchClient';

const MARK_COLORS = [
  '#ff6b6b',
  '#7b2cbf',
  '#06d6a0',
  '#4cc9f0',
  '#e85d04',
  '#9b2226',
  '#0077b6',
  '#2d6a4f',
  '#f4a261',
  '#6a4c93',
];

function cellKey(cell: WordSearchCellRef): string {
  return `${cell.row}:${cell.col}`;
}

function cellFromPoint(x: number, y: number): WordSearchCellRef | null {
  const element = document.elementFromPoint(x, y);
  const cell = element?.closest('[data-row][data-col]');
  if (!cell) {
    return null;
  }
  const row = Number(cell.getAttribute('data-row'));
  const col = Number(cell.getAttribute('data-col'));
  if (!Number.isInteger(row) || !Number.isInteger(col)) {
    return null;
  }
  return { row, col };
}

export function WordSearchGrid({
  letters,
  selection,
  found,
  onSelectionChange,
  onCommit,
}: {
  letters: string[][];
  selection: WordSearchCellRef[];
  found: WordSearchFoundWord[];
  onSelectionChange: (cells: WordSearchCellRef[]) => void;
  onCommit: (cells: WordSearchCellRef[]) => void;
}) {
  const rows = letters.length;
  const cols = letters[0]?.length ?? 0;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const dragRef = useRef<{
    pointerId: number;
    anchor: WordSearchCellRef;
    moved: boolean;
    path: WordSearchCellRef[];
  } | null>(null);

  const selectedKeys = new Set(selection.map(cellKey));

  const finishDrag = (commit: boolean) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) {
      return;
    }
    if (!drag.moved) {
      const previous = selectionRef.current;
      const next = appendTap(previous, drag.anchor, rows, cols);
      selectionRef.current = next;
      onSelectionChangeRef.current(next);
      if (next.length >= 2 && !samePath(next, previous)) {
        onCommitRef.current(next);
      }
      return;
    }
    if (commit && drag.path.length >= 2) {
      selectionRef.current = drag.path;
      onCommitRef.current(drag.path);
    }
  };

  return (
    <div
      className="relative w-full touch-none select-none"
      style={{ aspectRatio: `${cols} / ${rows}` }}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        const cell = cellFromPoint(event.clientX, event.clientY);
        if (!cell) {
          return;
        }
        event.preventDefault();
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic events and some browsers cannot capture the pointer.
        }
        dragRef.current = {
          pointerId: event.pointerId,
          anchor: cell,
          moved: false,
          path: [cell],
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
          return;
        }
        const cell = cellFromPoint(event.clientX, event.clientY);
        if (!cell) {
          return;
        }
        if (cell.row !== drag.anchor.row || cell.col !== drag.anchor.col) {
          drag.moved = true;
        }
        if (!drag.moved) {
          return;
        }
        event.preventDefault();
        const line = selectionLine(drag.anchor, cell, rows, cols);
        drag.path = line;
        selectionRef.current = line;
        onSelectionChangeRef.current(line);
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) {
          return;
        }
        finishDrag(true);
      }}
      onPointerCancel={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) {
          return;
        }
        finishDrag(true);
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="grid h-full w-full bg-white"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
        role="grid"
        aria-label="Word search grid"
      >
        {letters.map((row, rowIndex) =>
          row.map((letter, colIndex) => {
            const selected = selectedKeys.has(`${rowIndex}:${colIndex}`);
            return (
              <div
                key={`${rowIndex}:${colIndex}`}
                data-row={rowIndex}
                data-col={colIndex}
                role="gridcell"
                aria-selected={selected}
                className={cn(
                  'flex aspect-square items-center justify-center [container-type:size]',
                  selected && 'bg-sun/80'
                )}
              >
                <span className="font-display font-bold leading-none text-ink text-[62cqw]">
                  {letter}
                </span>
              </div>
            );
          })
        )}
      </div>
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox={`0 0 ${cols} ${rows}`}
        aria-hidden
      >
        {found.map((word, index) => {
          const mark = roundedRectForCells(word.cells);
          if (!mark) {
            return null;
          }
          const color = MARK_COLORS[index % MARK_COLORS.length];
          return (
            <rect
              key={word.id}
              x={mark.x}
              y={mark.y}
              width={mark.width}
              height={mark.height}
              rx={mark.radius}
              ry={mark.radius}
              transform={`rotate(${mark.angle} ${mark.cx} ${mark.cy})`}
              fill="none"
              stroke={color}
              strokeWidth={0.1}
            />
          );
        })}
      </svg>
    </div>
  );
}
