import { Link } from 'react-router-dom';
import { PartyLeaderboard } from '@/components/PartyLeaderboard';
import { HostPassphrasePrompt } from '@/components/HostPassphrasePrompt';
import { Button } from '@/components/ui/button';
import { useHostSecret } from '@/hooks/useHostSecret';
import { useLeaderboardSocket } from '@/hooks/useLeaderboardSocket';

export function HostLeaderboardPage() {
  const host = useHostSecret();
  const { board, error, connected, hostReady } = useLeaderboardSocket({
    secret: host.secret,
    attempt: host.attempt,
  });

  if (!hostReady) {
    return (
      <HostPassphrasePrompt
        checking={Boolean(host.secret) && !error}
        error={error}
        onSubmit={host.save}
      />
    );
  }

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              Host
            </p>
            <h1 className="font-display text-4xl font-bold">Leaderboard</h1>
          </div>
          <Button asChild variant="outline">
            <Link to="/host">Back to host menu</Link>
          </Button>
        </div>
        <p className="text-sm font-semibold text-ink/60">
          Overall points add crossword, word search, sudoku, maze, and word survivor.
          Quiz points are listed beside that total. Equal totals use the shorter combined play time.
        </p>
        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}
        {!connected || !board ? (
          <p className="font-semibold text-ink/60">Loading leaderboard…</p>
        ) : (
          <PartyLeaderboard board={board} showTime />
        )}
      </div>
    </div>
  );
}
