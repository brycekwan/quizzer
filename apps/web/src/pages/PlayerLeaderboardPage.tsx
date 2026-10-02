import { Link } from 'react-router-dom';
import { PartyLeaderboard } from '@/components/PartyLeaderboard';
import { Button } from '@/components/ui/button';
import { useLeaderboardSocket } from '@/hooks/useLeaderboardSocket';
import { useSession } from '@/hooks/useSession';

export function PlayerLeaderboardPage() {
  const { playerId } = useSession();
  const { board, error, connected } = useLeaderboardSocket();

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              Party
            </p>
            <h1 className="font-display text-4xl font-bold">Leaderboard</h1>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Lobby</Link>
          </Button>
        </div>
        <p className="text-sm font-semibold text-ink/60">
          Top 10 in each game. Your row stays highlighted when you are further down the list.
        </p>
        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}
        {!connected || !board ? (
          <p className="font-semibold text-ink/60">Loading leaderboard…</p>
        ) : (
          <PartyLeaderboard board={board} viewerId={playerId} showTime={false} />
        )}
      </div>
    </div>
  );
}
