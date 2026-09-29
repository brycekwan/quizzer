import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { MazeDifficulty, MazeLevelChoice } from '@party/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { HostPassphrasePrompt } from '@/components/HostPassphrasePrompt';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useHostSecret } from '@/hooks/useHostSecret';
import { useMazeSocket } from '@/hooks/useMazeSocket';
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

function levelName(level: MazeDifficulty) {
  if (level === 'easy') {
    return 'Easy';
  }
  if (level === 'medium') {
    return 'Medium';
  }
  return 'Hard';
}

export function MazeAdminPage() {
  const host = useHostSecret();
  const {
    connected,
    adminState,
    error,
    setError,
    reset,
    resetPlayer,
    selectPuzzle,
    hostReady,
  } = useMazeSocket('admin', host.secret, host.attempt);
  const [confirm, setConfirm] = useState<
    { kind: 'all' } | { kind: 'player'; playerId: string; name: string } | null
  >(null);
  const [confirming, setConfirming] = useState(false);

  if (!hostReady) {
    return (
      <HostPassphrasePrompt
        checking={Boolean(host.secret) && !error}
        error={error}
        onSubmit={host.save}
      />
    );
  }

  if (!adminState) {
    return (
      <div className="min-h-screen bg-playfield p-6 font-bold text-ink">
        Connecting to maze{connected ? '…' : '…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
      </div>
    );
  }

  const pendingDiffers =
    adminState.easy.pendingPuzzleId !== adminState.easy.puzzleId ||
    adminState.medium.pendingPuzzleId !== adminState.medium.puzzleId ||
    adminState.hard.pendingPuzzleId !== adminState.hard.puzzleId;

  const onSelect = async (difficulty: MazeDifficulty, puzzleId: string) => {
    const result = await selectPuzzle(difficulty, puzzleId);
    if (!result.ok) {
      setError(result.error ?? 'Could not select maze');
    }
  };

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">Maze host</p>
            <h1 className="font-display text-4xl font-bold">Milk run</h1>
            <p className="mt-1 text-sm font-semibold text-ink/60">
              {adminState.players.length} {adminState.players.length === 1 ? 'player' : 'players'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/host">Back to host menu</Link>
            </Button>
            <Button variant="coral" size="sm" onClick={() => setConfirm({ kind: 'all' })}>
              Reset all
            </Button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}

        <section className="space-y-4 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <h2 className="font-display text-2xl font-bold">Mazes</h2>
          <MazeSelect
            difficulty="easy"
            choice={adminState.easy}
            onSelect={(puzzleId) => void onSelect('easy', puzzleId)}
          />
          <MazeSelect
            difficulty="medium"
            choice={adminState.medium}
            onSelect={(puzzleId) => void onSelect('medium', puzzleId)}
          />
          <MazeSelect
            difficulty="hard"
            choice={adminState.hard}
            onSelect={(puzzleId) => void onSelect('hard', puzzleId)}
          />
          <p className="text-sm font-semibold text-ink/55">
            {pendingDiffers
              ? 'Selections saved — reset all to load them and clear scores.'
              : 'Reset all clears every player. Change a maze above, then reset all to switch everyone to it.'}
          </p>
        </section>

        <section className="overflow-hidden rounded-[2rem] border-4 border-white/60 bg-white/75 shadow-pop backdrop-blur">
          <div className="border-b-4 border-ink/10 px-5 py-3">
            <h2 className="font-display text-2xl font-bold">Leaderboard</h2>
            <p className="text-sm font-semibold text-ink/60">
              Highest score, then shortest time. 200 for easy, 300 for medium, 500 for hard, plus
              50 for each heart left at the end.
            </p>
          </div>
          {adminState.players.length === 0 ? (
            <p className="px-5 py-8 text-center font-semibold text-ink/50">
              No players have played the maze yet.
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
                      {levelName(player.level)} · {player.lives}{' '}
                      {player.lives === 1 ? 'life' : 'lives'} ·{' '}
                      <ElapsedCell elapsedMs={player.elapsedMs} activeSince={player.activeSince} />
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-grape">{player.score}</p>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">
                        points
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirm({
                          kind: 'player',
                          playerId: player.playerId,
                          name: player.name,
                        })
                      }
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
      <ConfirmDialog
        open={confirm != null}
        title={
          confirm?.kind === 'player' ? `Reset ${confirm.name}'s maze?` : 'Reset the maze?'
        }
        description={
          confirm?.kind === 'player'
            ? `${confirm.name} starts over on easy with 3 lives. Their score and time are cleared.`
            : 'Every player starts over on easy with 3 lives. Scores and times are cleared.'
        }
        confirmLabel="Reset"
        pending={confirming}
        onConfirm={() => {
          void (async () => {
            if (!confirm) {
              return;
            }
            setConfirming(true);
            const result =
              confirm.kind === 'all' ? await reset() : await resetPlayer(confirm.playerId);
            setConfirming(false);
            setConfirm(null);
            if (!result.ok) {
              setError(result.error ?? 'Could not reset');
            }
          })();
        }}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}

function MazeSelect({
  difficulty,
  choice,
  onSelect,
}: {
  difficulty: MazeDifficulty;
  choice: MazeLevelChoice;
  onSelect: (puzzleId: string) => void;
}) {
  const id = `maze-${difficulty}`;
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {levelName(difficulty)} · {choice.title}
      </Label>
      <select
        id={id}
        className="flex h-12 w-full rounded-2xl border-4 border-ink/15 bg-white px-4 text-base font-bold text-ink shadow-pop-sm outline-none focus-visible:ring-4 focus-visible:ring-sun/70"
        value={choice.pendingPuzzleId}
        onChange={(event) => onSelect(event.target.value)}
      >
        {choice.puzzles.map((puzzle) => (
          <option key={puzzle.id} value={puzzle.id}>
            {puzzle.label}
          </option>
        ))}
      </select>
    </div>
  );
}
