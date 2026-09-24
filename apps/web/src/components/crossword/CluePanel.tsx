import type { CrosswordCluePublic, CrosswordDirection } from '@party/shared';
import { cn } from '@/lib/utils';

export type CluePanelItem = {
  direction: CrosswordDirection;
  clue: CrosswordCluePublic;
};

export function CluePanel({
  items,
  expanded,
  onToggleExpanded,
  onSelect,
  activeKey,
}: {
  items: CluePanelItem[];
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelect: (clue: CrosswordCluePublic, direction: CrosswordDirection) => void;
  /** `${direction}-${number}` for the primary active clue */
  activeKey: string | null;
}) {
  return (
    <div className="rounded-xl border-2 border-white/50 bg-white/70 p-2 shadow-pop-sm backdrop-blur">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wide text-ink/50">
          Clues
        </p>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="text-xs font-extrabold uppercase tracking-wide text-grape hover:underline"
        >
          {expanded ? 'Show less' : 'Show all'}
        </button>
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-2 text-sm font-semibold text-ink/50">
          {expanded
            ? 'No clues available.'
            : 'Select a square or expand to see clues.'}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {items.map(({ direction, clue }) => {
            const key = `${direction}-${clue.number}`;
            const active = activeKey === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelect(clue, direction)}
                  className={cn(
                    'w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition-colors',
                    active
                      ? 'bg-sun/50 text-ink ring-2 ring-grape/30'
                      : 'bg-white/60 text-ink/80 hover:bg-white'
                  )}
                >
                  <span className="mr-1 font-extrabold text-grape">
                    {direction} - {clue.number}.
                  </span>
                  {clue.clue}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
