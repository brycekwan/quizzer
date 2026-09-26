import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { useSystemSocket } from '@/hooks/useSystemSocket';

function ScoreValue({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-ink/40">—</span>;
  }
  return <span className="tabular-nums">{value}</span>;
}

type PendingAction =
  | { kind: 'reset' }
  | { kind: 'kick'; playerId: string; name: string };

export function SystemAdminPage() {
  const { connected, adminState, error, setError, kick, resetAll } =
    useSystemSocket();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);

  if (!adminState) {
    return (
      <div className="min-h-screen bg-playfield p-6 font-bold text-ink">
        Connecting to system{connected ? '…' : '…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
      </div>
    );
  }

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setWorking(true);
    const result =
      pending.kind === 'reset'
        ? await resetAll()
        : await kick(pending.playerId);
    setWorking(false);
    if (!result.ok) {
      setError(
        result.error ??
          (pending.kind === 'reset'
            ? 'Could not reset the party'
            : 'Could not remove player')
      );
      return;
    }
    setPending(null);
  };

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              System host
            </p>
            <h1 className="font-display text-4xl font-bold">Players</h1>
            <p className="mt-1 text-sm font-semibold text-ink/60">
              {adminState.players.length}{' '}
              {adminState.players.length === 1 ? 'player' : 'players'} connected
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/host">Back to host menu</Link>
            </Button>
            <Button
              variant="coral"
              size="sm"
              onClick={() => setPending({ kind: 'reset' })}
            >
              Reset all
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
            <h2 className="font-display text-2xl font-bold">Leaderboard</h2>
            <p className="text-sm font-semibold text-ink/60">
              Ranked by crossword and word search points combined. Quiz points
              are shown separately and do not change rank.
            </p>
          </div>
          {adminState.players.length === 0 ? (
            <p className="px-5 py-8 text-center font-semibold text-ink/50">
              No players are connected.
            </p>
          ) : (
            <ul className="divide-y-2 divide-ink/10">
              {adminState.players.map((player) => (
                <li
                  key={player.playerId}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold">
                      <span className="mr-2 text-ink/40">{player.rank}.</span>
                      {player.name}
                    </p>
                    <p className="text-sm font-semibold text-ink/55">
                      Crossword <ScoreValue value={player.crosswordScore} /> ·
                      Word search <ScoreValue value={player.wordSearchScore} />
                      {' · '}
                      Quiz <ScoreValue value={player.quizScore} />
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-grape">
                        {player.accumulatedScore}
                      </p>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">
                        points
                      </p>
                    </div>
                    <Button
                      variant="coral"
                      size="sm"
                      onClick={() =>
                        setPending({
                          kind: 'kick',
                          playerId: player.playerId,
                          name: player.name,
                        })
                      }
                    >
                      Kick
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pending != null}
        title={pending?.kind === 'kick' ? `Kick ${pending.name}?` : 'Reset the party?'}
        description={
          pending?.kind === 'kick'
            ? `${pending.name} will be removed from every game. Their scores will be wiped, and they will need to log in again.`
            : 'Every player will be removed from the party. Scores in the quiz, crossword, and word search will be wiped, and everyone will need to log in again.'
        }
        confirmLabel={pending?.kind === 'kick' ? 'Kick' : 'Reset all'}
        pending={working}
        onConfirm={() => void confirm()}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
      />
    </div>
  );
}
