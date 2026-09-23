import { Link, Navigate } from 'react-router-dom';
import { readStoredSession } from '@/lib/sessionStorage';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/PageShell';

export function CrosswordPage() {
  const { playerId, playerName } = readStoredSession();

  if (!playerId || !playerName) {
    return <Navigate to="/login" replace />;
  }

  return (
    <PageShell>
      <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-grape">
        Crossword
      </p>
      <h1 className="font-display text-4xl font-bold text-ink">Coming soon</h1>
      <p className="mt-2 text-ink/70">
        Hi {playerName} — the crossword lands in a later phase.
      </p>
      <Button asChild size="lg" className="mt-8 w-full">
        <Link to="/">Back to menu</Link>
      </Button>
    </PageShell>
  );
}
