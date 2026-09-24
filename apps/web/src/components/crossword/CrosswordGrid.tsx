import { cn } from '@/lib/utils';

export function CrosswordGrid({
  open,
  cellNumbers,
  letters,
  selected,
  highlighted,
  correctCells,
  onSelect,
}: {
  open: boolean[][];
  cellNumbers: (number | null)[][];
  letters: (string | null)[][];
  selected: { row: number; col: number } | null;
  highlighted: Set<string>;
  correctCells: Set<string>;
  onSelect: (row: number, col: number) => void;
}) {
  const rows = open.length;
  const cols = open[0]?.length ?? 0;

  return (
    <div
      className="mx-auto grid w-full max-w-[18rem] gap-0.5 sm:max-w-md"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      role="grid"
      aria-label="Crossword grid"
    >
      {Array.from({ length: rows }, (_, row) =>
        Array.from({ length: cols }, (_, col) => {
          const key = `${row}:${col}`;
          if (!open[row][col]) {
            return (
              <div
                key={key}
                className="aspect-square rounded-sm bg-ink/90"
                aria-hidden
              />
            );
          }

          const isSelected =
            selected?.row === row && selected?.col === col;
          const isHighlighted = highlighted.has(key);
          const isCorrect = correctCells.has(key);
          const number = cellNumbers[row][col];
          const letter = letters[row][col] ?? '';

          return (
            <button
              key={key}
              type="button"
              role="gridcell"
              aria-selected={isSelected}
              onClick={() => onSelect(row, col)}
              className={cn(
                'relative aspect-square rounded-sm border-2 border-ink/20 bg-white font-display text-base font-bold uppercase text-ink shadow-sm transition-colors sm:text-xl',
                isHighlighted && !isSelected && 'bg-sky/30',
                isSelected && 'border-grape bg-sun/40 ring-2 ring-grape/40',
                isCorrect && 'bg-mint/35 border-mint'
              )}
            >
              {number != null ? (
                <span className="absolute left-0.5 top-0 text-[0.5rem] font-extrabold leading-none text-ink/55 sm:text-[0.65rem]">
                  {number}
                </span>
              ) : null}
              <span className="flex h-full items-center justify-center">
                {letter}
              </span>
            </button>
          );
        })
      )}
    </div>
  );
}
