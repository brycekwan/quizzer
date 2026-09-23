import type { LeaderboardEntry } from '@party/shared';
import { cn } from '@/lib/utils';

interface LeaderboardProps {
  entries: Array<LeaderboardEntry & { highlight?: boolean }>;
  title?: string;
  paused?: boolean;
  onKick?: (playerId: string) => void;
}

export function Leaderboard({
  entries,
  title = 'Leaderboard',
  paused = false,
  onKick,
}: LeaderboardProps) {
  return (
    <div className="animate-popin w-full">
      {paused ? (
        <div
          role="status"
          className="mb-4 rounded-2xl bg-sun px-4 py-3 text-center font-display text-xl font-bold text-ink shadow-pop-sm"
        >
          Game paused
        </div>
      ) : null}
      <h2 className="mb-3 font-display text-3xl font-bold text-ink">{title}</h2>
      <ol className="space-y-2">
        {entries.map((entry) => (
          <li
            key={`${entry.id}-${entry.rank}`}
            className={cn(
              'flex items-center gap-3 rounded-2xl border-4 px-3 py-2 shadow-pop-sm',
              entry.highlight
                ? 'border-sun bg-sun/40'
                : 'border-ink/10 bg-white/80'
            )}
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-sm font-extrabold text-cream">
              {entry.rank}
            </span>
            <span className="flex-1 truncate font-extrabold text-ink">
              {entry.name}
            </span>
            <span className="font-display text-lg font-bold text-grape">
              {entry.score}
            </span>
            {onKick ? (
              <button
                type="button"
                className="rounded-xl bg-coral px-3 py-1 text-xs font-extrabold uppercase text-white"
                onClick={() => onKick(entry.id)}
              >
                Kick
              </button>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
