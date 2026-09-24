import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCrosswordSocket } from '@/hooks/useCrosswordSocket';
import { Button } from '@/components/ui/button';
import { computeElapsedMs, formatElapsedMs } from '@/lib/crosswordClient';

function ElapsedCell({
  elapsedMs,
  activeSince,
}: {
  elapsedMs: number;
  activeSince: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (activeSince == null) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeSince]);

  if (elapsedMs === 0 && activeSince == null) {
    return <span className="text-ink/40">—</span>;
  }

  return (
    <span className="tabular-nums">
      {formatElapsedMs(computeElapsedMs(elapsedMs, activeSince, now))}
    </span>
  );
}

export function CrosswordAdminPage() {
  const { connected, adminState, error, reset } = useCrosswordSocket('admin');

  if (!adminState) {
    return (
      <div className="min-h-screen bg-playfield p-6 font-bold text-ink">
        Connecting to crossword{connected ? '…' : '…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              Crossword host
            </p>
            <h1 className="font-display text-4xl font-bold">{adminState.title}</h1>
            <p className="mt-1 text-sm font-semibold text-ink/60">
              {adminState.players.length} player
              {adminState.players.length === 1 ? '' : 's'} ·{' '}
              {adminState.totalWords} words
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/host">Back to host menu</Link>
            </Button>
            <Button
              variant="coral"
              size="sm"
              onClick={() => void reset()}
            >
              Reset crossword
            </Button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}

        <section className="overflow-hidden rounded-[2rem] border-4 border-white/60 bg-white/75 shadow-pop backdrop-blur">
          <div className="border-b-4 border-ink/10 px-5 py-3">
            <h2 className="font-display text-2xl font-bold">Player progress</h2>
            <p className="text-sm font-semibold text-ink/60">
              Most words completed, then shortest time
            </p>
          </div>
          {adminState.players.length === 0 ? (
            <p className="px-5 py-8 text-center font-semibold text-ink/50">
              No players have entered the crossword yet.
            </p>
          ) : (
            <ul className="divide-y-2 divide-ink/10">
              {adminState.players.map((player, index) => {
                const done = player.completedAt != null;
                return (
                  <li
                    key={player.playerId}
                    className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                  >
                    <div>
                      <p className="font-display text-xl font-bold">
                        <span className="mr-2 text-ink/40">{index + 1}.</span>
                        {player.name}
                      </p>
                      <p className="text-sm font-semibold text-ink/55">
                        {done ? 'Completed' : 'In progress'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-grape">
                        {player.correctWordCount}/{player.totalWords}
                      </p>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">
                        words ·{' '}
                        <ElapsedCell
                          elapsedMs={player.elapsedMs}
                          activeSince={player.activeSince}
                        />
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
