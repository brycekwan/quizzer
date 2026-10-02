import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useSession } from '@/hooks/useSession';
import {
  clearQuizRemovalMessage,
  readQuizRemovalMessage,
} from '@/lib/quizRemoval';
import { BabyLobbyBackdrop } from '@/components/baby/BabyLobbyBackdrop';
import { usePartyTheme } from '@/components/PartyThemeProvider';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/PageShell';

export function MenuPage() {
  const { playerId, playerName } = useSession();
  const theme = usePartyTheme();
  const [quizRemovalMessage, setQuizRemovalMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    const message = readQuizRemovalMessage();
    if (message) {
      setQuizRemovalMessage(message);
      clearQuizRemovalMessage();
    }
  }, []);

  if (!playerId || !playerName) {
    return <Navigate to="/login" replace />;
  }

  return (
    <PageShell backdrop={theme === 'baby' ? <BabyLobbyBackdrop /> : null}>
      <p className="mb-2 text-sm font-extrabold uppercase tracking-widest text-grape">
        Party
      </p>
      <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
        Game Lobby
      </h1>
      {quizRemovalMessage ? (
        <p role="alert" className="mt-4 font-bold text-coral">
          {quizRemovalMessage}
        </p>
      ) : null}
      <p className="mt-2 text-ink/70">
        Playing as <span className="font-bold text-grape">{playerName}</span>
      </p>
      <div className="mt-8 grid gap-3">
        <Button asChild size="lg" className="w-full">
          <Link to="/quizzer">Quizzer</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/crossword">Crossword</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/wordsearch">Word search</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/sudoku">Sudoku</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/maze">Maze</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/wordsurvivor">Word Survivor</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="w-full">
          <Link to="/leaderboard">Leaderboard</Link>
        </Button>
      </div>
    </PageShell>
  );
}
