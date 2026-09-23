import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { MULTIPLIER_SPLASH_DURATION_MS } from '@party/shared';
import { useGameSocket, useSyncedCountdown } from '@/hooks/useGameSocket';
import { AnswerGrid } from '@/components/AnswerGrid';
import { Countdown } from '@/components/Countdown';
import { Leaderboard } from '@/components/Leaderboard';
import { WinnerConfetti } from '@/components/WinnerConfetti';
import { PageShell } from '@/components/PageShell';
import { Button } from '@/components/ui/button';
import { buildFinalLeaderboard } from '@/lib/leaderboard';
import { readStoredSession } from '@/lib/sessionStorage';

export function PlayPage() {
  const stored = readStoredSession();
  const {
    connected,
    state,
    playerId,
    playerName,
    kicked,
    gameReset,
    error,
    setError,
    answer,
  } = useGameSocket('player');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}/login`;
  }, []);

  const questionId = state?.currentQuestion?.id;
  useEffect(() => {
    setSelectedId(null);
    setLocked(false);
    setError(null);
  }, [questionId, setError]);

  const endsAt =
    state?.phase === 'answering'
      ? state.questionEndsAt
      : state?.status === 'waiting' && state.scheduledStartAt
        ? state.scheduledStartAt
        : (state?.phaseEndsAt ?? null);
  const remainingMs = useSyncedCountdown(endsAt, state?.serverNow);


  const handleAnswer = async (answerId: string) => {
    if (locked || state?.phase !== 'answering') {
      return;
    }
    setSelectedId(answerId);
    setLocked(true);
    const result = await answer(answerId);
    if (!result.ok) {
      setLocked(false);
      setSelectedId(null);
      setError(result.error ?? 'Could not submit answer');
    }
  };

  if (!stored.playerId || !stored.playerName) {
    return <Navigate to="/login" replace />;
  }

  if (gameReset) {
    return <Navigate to="/" replace />;
  }

  if (kicked) {
    return (
      <PageShell>
        <h1 className="font-display text-4xl font-bold text-ink">You were removed</h1>
        <p className="mt-2 text-ink/70">The host kicked you from this game.</p>
        <Button asChild size="lg" className="mt-8 w-full">
          <Link to="/login">Back to login</Link>
        </Button>
      </PageShell>
    );
  }

  if (!playerId || !playerName) {
    return (
      <PageShell>
        <p className="font-bold text-ink">
          {connected ? 'Joining quiz…' : 'Connecting…'}
        </p>
        {error ? (
          <p role="alert" className="mt-4 font-bold text-coral">
            {error}
          </p>
        ) : null}
        <Button asChild size="lg" className="mt-8 w-full">
          <Link to="/">Back to menu</Link>
        </Button>
      </PageShell>
    );
  }

  if (!state) {
    return (
      <PageShell>
        <p className="font-bold text-ink">Connecting…</p>
      </PageShell>
    );
  }

  if (state.status === 'waiting') {
    const scheduled = Boolean(state.scheduledStartAt);
    return (
      <WaitingShell
        playerName={playerName}
        playerCount={state.players.length}
        joinUrl={joinUrl}
        title={scheduled ? 'Game starting soon' : 'Waiting for game to start'}
        subtitle={
          scheduled
            ? `Hang tight — the host scheduled the start. About ${Math.ceil(
                remainingMs / 1000
              )}s left.`
            : undefined
        }
      />
    );
  }

  if (state.status === 'finished') {
    if (!state.viewerFinishedGame) {
      return (
        <WaitingShell
          playerName={playerName}
          playerCount={state.players.length}
          joinUrl={joinUrl}
          title="Waiting for a new game"
          subtitle="The last round already finished. Hang tight until the host starts again."
        />
      );
    }

    const rows = buildFinalLeaderboard(state.leaderboard, playerId).rows;
    const isWinner = state.leaderboard[0]?.id === playerId;
    return (
      <PageShell>
        <WinnerConfetti active={isWinner} />
        <h1 className="mb-2 font-display text-4xl font-bold text-ink">
          Final scores
        </h1>
        {isWinner ? (
          <p className="mb-4 animate-popin font-display text-xl font-bold text-grape">
            You took first place!
          </p>
        ) : null}
        <Leaderboard entries={rows} title="Top of the board" />
        <Button asChild size="lg" className="mt-6 w-full">
          <Link to="/">Back to menu</Link>
        </Button>
      </PageShell>
    );
  }

  if (state.status === 'paused' || state.phase === 'leaderboard') {
    return (
      <PageShell tight>
        <Leaderboard
          entries={state.leaderboard.map((e) => ({
            ...e,
            highlight: e.id === playerId,
          }))}
          paused={state.status === 'paused'}
          title={state.status === 'paused' ? 'Paused standings' : 'Live standings'}
        />
      </PageShell>
    );
  }

  if (state.phase === 'multiplier' && state.currentQuestion?.multiplier) {
    const mult = state.currentQuestion.multiplier;
    const splashTotalMs = MULTIPLIER_SPLASH_DURATION_MS;
    return (
      <PageShell>
        <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
          Bonus round
        </p>
        <h1 className="mt-3 animate-popin font-display text-4xl font-bold text-ink sm:text-5xl">
          The next question is worth {mult}X more!
        </h1>
        <p className="mt-4 text-lg font-bold text-ink/60">
          Everyone starts together — hang tight.
        </p>
        <div className="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-sun font-display text-4xl font-bold text-ink shadow-pop animate-pulseGlow">
          {mult}X
        </div>
        <div className="mx-auto mt-8 w-full max-w-xs text-left">
          <Countdown
            remainingMs={remainingMs}
            totalMs={splashTotalMs}
            label="Question starts in"
          />
        </div>
      </PageShell>
    );
  }

  if (state.phase === 'reveal' && state.currentQuestion) {
    const viewer = state.viewerAnswer;
    const gotItRight = viewer?.correct === true;
    const didAnswer = Boolean(viewer);
    return (
      <PageShell tight>
        <p className="mb-2 text-sm font-extrabold uppercase text-ink/60">
          Question {state.currentQuestion.index + 1}/{state.currentQuestion.total}
        </p>
        <h1 className="mb-4 font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
          {state.currentQuestion.question}
        </h1>
        <p
          className={`mb-1 text-center font-display text-2xl font-bold ${
            gotItRight ? 'text-mint' : 'text-coral'
          }`}
        >
          {!didAnswer
            ? 'Time is up'
            : gotItRight
              ? `Nice! +${viewer?.points ?? 0}`
              : 'Wrong answer'}
        </p>
        <p className="mb-3 text-center text-sm font-bold text-ink/60">
          Score:{' '}
          {state.players.find((p) => p.id === playerId)?.score ?? 0}
        </p>
        <AnswerGrid
          answers={state.currentQuestion.answers}
          disabled
          selectedId={viewer?.answerId ?? selectedId}
          reveal
        />
      </PageShell>
    );
  }

  if (state.phase === 'answering' && state.currentQuestion) {
    const totalMs = state.config.timeLimitSeconds * 1000;
    const viewer = state.viewerAnswer;
    const hasAnswered = Boolean(viewer);
    const gotItRight = viewer?.correct === true;

    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-playfield px-4 py-3">
        <div className="mx-auto flex h-full w-full max-w-3xl flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-ink/60">
                {playerName} · Q{state.currentQuestion.index + 1}/
                {state.currentQuestion.total}
              </p>
              <h1 className="font-display text-xl font-bold leading-tight text-ink sm:text-3xl">
                {state.currentQuestion.question}
              </h1>
              {state.currentQuestion.multiplier &&
              state.currentQuestion.multiplier > 1 ? (
                <p className="mt-1 text-sm font-extrabold uppercase tracking-wide text-grape">
                  {state.currentQuestion.multiplier}X points
                </p>
              ) : null}
            </div>
            <div className="rounded-2xl bg-ink px-3 py-2 text-right text-cream shadow-pop-sm">
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-cream/70">
                Score
              </div>
              <div className="font-display text-xl font-bold">
                {state.players.find((p) => p.id === playerId)?.score ?? 0}
              </div>
            </div>
          </div>
          <Countdown remainingMs={remainingMs} totalMs={totalMs} />
          {hasAnswered ? (
            <div className="animate-popin rounded-2xl border-4 border-ink/10 bg-white/80 px-4 py-3 text-center shadow-pop-sm">
              <p
                className={`font-display text-xl font-bold ${
                  gotItRight ? 'text-mint' : 'text-coral'
                }`}
              >
                {gotItRight
                  ? `You got it! +${viewer?.points ?? 0}`
                  : 'Wrong answer'}
              </p>
              <p className="mt-1 text-sm font-bold text-ink/60">
                {state.waitingPlayerCount > 0
                  ? `Waiting for ${state.waitingPlayerCount} other player${
                      state.waitingPlayerCount === 1 ? '' : 's'
                    }…`
                  : 'Wrapping up…'}
              </p>
              <p className="mt-1 text-xs font-semibold text-ink/45">
                Scores update for everyone when all answers are in (or time runs out).
              </p>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-center font-bold text-coral">
              {error}
            </p>
          ) : null}
          <AnswerGrid
            answers={state.currentQuestion.answers}
            disabled={hasAnswered || locked || remainingMs <= 0}
            selectedId={viewer?.answerId || selectedId}
            onSelect={(id) => {
              void handleAnswer(id);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <PageShell>
      <p className="font-bold text-ink">Get ready…</p>
    </PageShell>
  );
}

function WaitingShell({
  playerName,
  playerCount,
  joinUrl,
  title,
  subtitle,
}: {
  playerName: string;
  playerCount: number;
  joinUrl: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <PageShell>
      <div className="mx-auto mb-4 h-16 w-16 animate-pulseGlow rounded-full bg-sun" />
      <h1 className="mt-2 font-display text-4xl font-bold text-ink">{title}</h1>
      <p className="mt-2 text-lg font-bold text-ink/70">
        You&apos;re in as <span className="text-grape">{playerName}</span>
      </p>
      {subtitle ? (
        <p className="mt-2 text-base font-semibold text-ink/60">{subtitle}</p>
      ) : null}
      <p className="mt-4 text-sm font-semibold text-ink/50">
        {playerCount} player{playerCount === 1 ? '' : 's'} connected
      </p>
      {joinUrl ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <p className="text-sm font-extrabold uppercase tracking-wide text-ink/60">
            Scan to join
          </p>
          <div className="rounded-3xl border-4 border-ink/10 bg-white p-4 shadow-pop-sm">
            <QRCodeSVG
              value={joinUrl}
              size={180}
              aria-label="QR code to join the game"
            />
          </div>
          <p className="max-w-[16rem] break-all text-xs font-semibold text-ink/45">
            {joinUrl}
          </p>
        </div>
      ) : null}
      <Button asChild size="lg" variant="outline" className="mt-6 w-full">
        <Link to="/">Back to menu</Link>
      </Button>
    </PageShell>
  );
}
