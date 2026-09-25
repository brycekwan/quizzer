import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useWordSearchSocket } from '@/hooks/useWordSearchSocket';
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

export function WordSearchAdminPage() {
  const {
    connected,
    adminState,
    error,
    setError,
    reset,
    resetPlayer,
    selectPuzzle,
  } = useWordSearchSocket('admin');

  if (!adminState) {
    return (
      <div className="min-h-screen bg-playfield p-6 font-bold text-ink">
        Connecting to word search{connected ? '…' : '…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
      </div>
    );
  }

  const pendingDiffers = adminState.pendingPuzzleId !== adminState.puzzleId;

  const onSelectPuzzle = async (puzzleId: string) => {
    const result = await selectPuzzle(puzzleId);
    if (!result.ok) {
      setError(result.error ?? 'Could not select word search');
    }
  };

  const onReset = async () => {
    const result = await reset();
    if (!result.ok) {
      setError(result.error ?? 'Could not reset word search');
    }
  };

  const onResetPlayer = async (playerId: string) => {
    const result = await resetPlayer(playerId);
    if (!result.ok) {
      setError(result.error ?? 'Could not reset player');
    }
  };

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              Word search host
            </p>
            <h1 className="font-display text-4xl font-bold">{adminState.title}</h1>
            <p className="mt-1 text-sm font-semibold text-ink/60">
              {adminState.players.length}{' '}
              {adminState.players.length === 1 ? 'player' : 'players'} ·{' '}
              {adminState.totalWords} words
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/host">Back to host menu</Link>
            </Button>
            <Button variant="coral" size="sm" onClick={() => void onReset()}>
              Reset all
            </Button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}

        <section className="rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <h2 className="font-display text-2xl font-bold">Active word search</h2>
          <div className="mt-3 space-y-1">
            <Label htmlFor="wordsearch-puzzle">Word search</Label>
            <select
              id="wordsearch-puzzle"
              className="flex h-12 w-full rounded-2xl border-4 border-ink/15 bg-white px-4 text-base font-bold text-ink shadow-pop-sm outline-none focus-visible:ring-4 focus-visible:ring-sun/70"
              value={adminState.pendingPuzzleId}
              onChange={(event) => void onSelectPuzzle(event.target.value)}
            >
              {adminState.puzzles.map((puzzle) => (
                <option key={puzzle.id} value={puzzle.id}>
                  {puzzle.label}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-sm font-semibold text-ink/55">
            {pendingDiffers
              ? 'Selection saved — reset all to load it and clear scores.'
              : 'Reset all clears every player. Change the puzzle above, then reset all to switch everyone to it.'}
          </p>
        </section>

        <section className="overflow-hidden rounded-[2rem] border-4 border-white/60 bg-white/75 shadow-pop backdrop-blur">
          <div className="border-b-4 border-ink/10 px-5 py-3">
            <h2 className="font-display text-2xl font-bold">Leaderboard</h2>
            <p className="text-sm font-semibold text-ink/60">
              Most words found, then shortest time. 100 pts per word · placement
              bonus 1000→100 for ranks 1–10
            </p>
          </div>
          {adminState.players.length === 0 ? (
            <p className="px-5 py-8 text-center font-semibold text-ink/50">
              No players have played this word search yet.
            </p>
          ) : (
            <ul className="divide-y-2 divide-ink/10">
              {adminState.players.map((player, index) => (
                <li
                  key={player.playerId}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold">
                      <span className="mr-2 text-ink/40">{index + 1}.</span>
                      {player.name}
                    </p>
                    <p className="text-sm font-semibold text-ink/55">
                      {player.foundCount}/{player.totalWords} words ·{' '}
                      <ElapsedCell
                        elapsedMs={player.elapsedMs}
                        activeSince={player.activeSince}
                      />
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-grape">
                        {player.score}
                      </p>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">
                        points
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void onResetPlayer(player.playerId)}
                    >
                      Reset
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
