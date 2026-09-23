import type { CrosswordCluePublic } from '@party/shared';
import { cn } from '@/lib/utils';

export function ClueList({
  title,
  clues,
  activeNumbers,
  onSelect,
}: {
  title: string;
  clues: CrosswordCluePublic[];
  activeNumbers: Set<number>;
  onSelect: (clue: CrosswordCluePublic) => void;
}) {
  return (
    <div className="text-left">
      <h2 className="mb-2 font-display text-xl font-bold text-ink">{title}</h2>
      <ul className="space-y-1">
        {clues.map((clue) => {
          const active = activeNumbers.has(clue.number);
          return (
            <li key={`${title}-${clue.number}`}>
              <button
                type="button"
                onClick={() => onSelect(clue)}
                className={cn(
                  'w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors',
                  active
                    ? 'bg-sun/50 text-ink ring-2 ring-grape/30'
                    : 'bg-white/60 text-ink/80 hover:bg-white'
                )}
              >
                <span className="mr-2 font-extrabold text-grape">
                  {clue.number}.
                </span>
                {clue.clue}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
