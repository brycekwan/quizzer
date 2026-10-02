import { useEffect, useState } from 'react';
import {
  PARTY_BOARD_KEYS,
  PARTY_BOARD_LABELS,
  visiblePlayerRows,
  type LeaderboardRow,
  type PartyBoardKey,
  type PartyLeaderboardSnapshot,
  type PlayClock,
} from '@party/shared';
import { computeElapsedMs, formatElapsedMs } from '@/lib/crosswordClient';
import { cn } from '@/lib/utils';

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

function clockMs(clocks: PlayClock[], now: number): number | null {
  const started = clocks.filter(
    (clock) => clock.elapsedMs !== 0 || clock.activeSince != null
  );
  if (started.length === 0) {
    return null;
  }
  return started.reduce(
    (total, clock) =>
      total + computeElapsedMs(clock.elapsedMs, clock.activeSince, now),
    0
  );
}

function TimeValue({ clocks, now }: { clocks: PlayClock[]; now: number }) {
  const ms = clockMs(clocks, now);
  if (ms == null) {
    return <span className="text-ink/40">—</span>;
  }
  return <span className="tabular-nums">{formatElapsedMs(ms)}</span>;
}

export function PartyLeaderboard({
  board,
  viewerId = null,
  showTime,
}: {
  board: PartyLeaderboardSnapshot;
  viewerId?: string | null;
  showTime: boolean;
}) {
  const [selected, setSelected] = useState<PartyBoardKey>('overall');
  const now = useNow(showTime);
  const rows = board[selected];
  const showQuiz = selected === 'overall';
  const showClock = showTime && selected !== 'quiz';

  return (
    <div>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Games">
        {PARTY_BOARD_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={selected === key}
            className={cn(
              'rounded-xl px-3 py-2 text-sm font-extrabold',
              selected === key
                ? 'bg-grape text-white shadow-pop-sm'
                : 'bg-white/80 text-ink'
            )}
            onClick={() => setSelected(key)}
          >
            {PARTY_BOARD_LABELS[key]}
          </button>
        ))}
      </div>
      <BoardList
        rows={rows}
        viewerId={viewerId}
        showTime={showClock}
        showQuiz={showQuiz}
        limitToViewer={!showTime}
        now={now}
        empty={
          selected === 'overall'
            ? 'No players are connected.'
            : 'No scores yet.'
        }
      />
    </div>
  );
}

function BoardList({
  rows,
  viewerId,
  showTime,
  showQuiz,
  limitToViewer,
  now,
  empty,
}: {
  rows: LeaderboardRow[];
  viewerId: string | null;
  showTime: boolean;
  showQuiz: boolean;
  limitToViewer: boolean;
  now: number;
  empty: string;
}) {
  const visible = limitToViewer
    ? visiblePlayerRows(rows, viewerId)
    : rows.map((row) => ({
        kind: 'rank' as const,
        highlight: false,
        rank: row.rank,
        playerId: row.playerId,
        name: row.name,
        score: row.score,
        quizScore: row.quizScore,
      }));

  if (visible.length === 0) {
    return (
      <p className="px-5 py-8 text-center font-semibold text-ink/50">{empty}</p>
    );
  }

  return (
    <ol className="mt-4 space-y-2">
      {visible.map((entry, index) => {
        if (entry.kind === 'gap') {
          return (
            <li key="gap" aria-hidden className="h-4 list-none" />
          );
        }
        const clocks =
          rows.find((row) => row.playerId === entry.playerId)?.clocks ?? [];
        return (
          <li
            key={`${entry.playerId}-${entry.rank}-${index}`}
            className={cn(
              'flex items-center gap-3 rounded-2xl border-4 px-3 py-2 shadow-pop-sm',
              entry.highlight ? 'border-sun bg-sun/40' : 'border-ink/10 bg-white/80'
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ink text-sm font-extrabold text-cream">
              {entry.rank}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-extrabold text-ink">
                {entry.name}
              </span>
              {showQuiz ? (
                <span className="block text-xs font-bold text-ink/50">
                  Quiz {entry.quizScore ?? '—'}
                </span>
              ) : null}
            </span>
            {showTime ? (
              <span className="text-sm font-bold text-ink/70">
                <TimeValue clocks={clocks} now={now} />
              </span>
            ) : null}
            <span className="font-display text-lg font-bold text-grape">
              {entry.score}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
