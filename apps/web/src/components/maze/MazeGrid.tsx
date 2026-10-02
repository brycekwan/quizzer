import { useRef, type PointerEvent } from 'react';
import type { MazeDirection, MazePlayerSnapshot } from '@party/shared';
import { CrawlingBaby, MilkBottle, OpenDoor, Refrigerator } from './icons';

function same(row: number, col: number, other: { row: number; col: number }) {
  return row === other.row && col === other.col;
}

function TargetIcon({
  difficulty,
}: {
  difficulty: MazePlayerSnapshot['puzzle']['difficulty'];
}) {
  if (difficulty === 'easy') {
    return <OpenDoor className="h-[70%] w-[70%] text-grape" />;
  }
  if (difficulty === 'medium') {
    return <Refrigerator className="h-[70%] w-[70%] text-ink" />;
  }
  return <MilkBottle className="h-[70%] w-[70%] text-sky" />;
}

export function MazeGrid({
  state,
  disabled,
  onMove,
}: {
  state: MazePlayerSnapshot;
  disabled: boolean;
  onMove: (direction: MazeDirection) => void;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const { puzzle, position, visited } = state;

  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'touch' || !drag.current || disabled) {
      drag.current = null;
      return;
    }
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = null;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax < 28 && ay < 28) {
      return;
    }
    if (Math.min(ax, ay) > Math.max(ax, ay) * 0.6) {
      return;
    }
    onMove(ax > ay ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n');
  };

  return (
    <div
      className="grid w-full touch-none rounded-2xl border-4 border-ink/15 bg-white/80 p-1 shadow-pop"
      style={{
        gridTemplateColumns: `repeat(${puzzle.cols}, minmax(0, 1fr))`,
      }}
      role="grid"
      aria-label={`${puzzle.title} maze`}
    >
      {puzzle.open.map((row, rowIndex) =>
        row.map((open, colIndex) => {
          const walls = puzzle.walls[rowIndex]?.[colIndex];
          const here = same(rowIndex, colIndex, position);
          const been = visited.some((cell) => same(rowIndex, colIndex, cell));
          const goal = same(rowIndex, colIndex, puzzle.target);
          return (
            <div
              key={`${rowIndex}-${colIndex}`}
              role="gridcell"
              className={
                open
                  ? been
                    ? 'relative aspect-square bg-grape/20'
                    : 'relative aspect-square bg-cream'
                  : 'relative aspect-square bg-ink/80'
              }
              style={
                open && walls
                  ? {
                      borderTop: walls.n ? '3px solid #1f2933' : '1px solid transparent',
                      borderRight: walls.e ? '3px solid #1f2933' : '1px solid transparent',
                      borderBottom: walls.s ? '3px solid #1f2933' : '1px solid transparent',
                      borderLeft: walls.w ? '3px solid #1f2933' : '1px solid transparent',
                    }
                  : undefined
              }
              onPointerDown={(event) => {
                if (!here || event.pointerType !== 'touch' || disabled) {
                  return;
                }
                drag.current = { x: event.clientX, y: event.clientY };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerUp={here ? release : undefined}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              {goal && !here ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <TargetIcon difficulty={puzzle.difficulty} />
                </span>
              ) : null}
              {here ? (
                <span className="absolute inset-0 flex items-center justify-center text-grape">
                  <CrawlingBaby className="h-[92%] w-[92%]" />
                </span>
              ) : null}
            </div>
          );
        })
      )}
    </div>
  );
}
