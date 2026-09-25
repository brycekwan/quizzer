import type { CrosswordCluePublic, CrosswordDirection } from '@party/shared';
import { cn } from '@/lib/utils';

export type CluePanelItem = {
  direction: CrosswordDirection;
  clue: CrosswordCluePublic;
  solved: boolean;
};

export function CluePanel({
  items,
  expanded,
  collapsible = true,
  onToggleExpanded,
  onSelect,
  activeKey,
}: {
  items: CluePanelItem[];
  expanded: boolean;
  /** Desktop keeps the full list open and hides the toggle. */
  collapsible?: boolean;
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
        {collapsible ? (
          <button
            type="button"
            onClick={onToggleExpanded}
            className="text-xs font-extrabold uppercase tracking-wide text-grape hover:underline"
          >
            {expanded ? 'Show less' : 'Show all'}
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="px-1 py-2 text-sm font-semibold text-ink/50">
          {expanded || !collapsible
            ? 'No clues available.'
            : 'Select a square or expand to see clues.'}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {items.map(({ direction, clue, solved }) => {
            const key = `${direction}-${clue.number}`;
            const active = activeKey === key;
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelect(clue, direction)}
                  aria-current={active ? 'true' : undefined}
                  className={cn(
                    'w-full rounded-lg px-2 py-1.5 text-left text-sm font-semibold transition-colors',
                    solved
                      ? active
                        ? 'bg-ink/5 text-ink/40 ring-2 ring-ink/15'
                        : 'bg-white/40 text-ink/40 hover:bg-white/70'
                      : active
                        ? 'bg-sun/50 text-ink ring-2 ring-grape/30'
                        : 'bg-white/60 text-ink/80 hover:bg-white'
                  )}
                >
                  <span
                    className={cn(
                      'mr-1 font-extrabold',
                      solved ? 'text-ink/35' : 'text-grape'
                    )}
                  >
                    {direction} - {clue.number}.
                  </span>
                  {clue.clue}
                  {solved ? <span className="sr-only"> Completed.</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
