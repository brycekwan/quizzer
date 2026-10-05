import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { WordSurvivorPhase } from '@party/shared';
import { GamePlayHeader, GameScore } from '@/components/GamePlayHeader';
import { SurvivorBoard } from '@/components/wordsurvivor/Board';
import { SurvivorKeyboard } from '@/components/wordsurvivor/Keyboard';
import { WinnerConfetti } from '@/components/WinnerConfetti';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useWordSurvivorSocket } from '@/hooks/useWordSurvivorSocket';
import { computeElapsedMs, formatElapsedMs } from '@/lib/crosswordClient';

function useElapsedClock(
  elapsedMs: number,
  activeSince: number | null,
  hold: boolean,
  completed: boolean
): string {
  const [now, setNow] = useState(() => Date.now());
  const anchor = useRef<{ displayMs: number; at: number; holding: boolean } | null>(null);
  const previousElapsed = useRef(elapsedMs);

  useEffect(() => {
    if (hold || completed) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [hold, completed]);

  if (completed || elapsedMs < previousElapsed.current) {
    anchor.current = null;
  }
  previousElapsed.current = elapsedMs;

  if (completed) {
    return formatElapsedMs(elapsedMs);
  }

  if (hold) {
    const live = computeElapsedMs(elapsedMs, activeSince, Date.now());
    if (!anchor.current?.holding) {
      anchor.current = { displayMs: live, at: Date.now(), holding: true };
    } else if (activeSince == null && elapsedMs > anchor.current.displayMs) {
      anchor.current = { displayMs: elapsedMs, at: Date.now(), holding: true };
    }
    return formatElapsedMs(anchor.current.displayMs);
  }

  if (anchor.current?.holding) {
    if ((activeSince == null && elapsedMs === 0) || (anchor.current.displayMs === 0 && elapsedMs > 0)) {
      anchor.current = null;
    } else {
      anchor.current = {
        displayMs: anchor.current.displayMs,
        at: Date.now(),
        holding: false,
      };
    }
  }

  if (anchor.current) {
    return formatElapsedMs(anchor.current.displayMs + Math.max(0, Date.now() - anchor.current.at));
  }

  return formatElapsedMs(computeElapsedMs(elapsedMs, activeSince, now));
}

function finished(phase: WordSurvivorPhase) {
  return phase === 'won' || phase === 'lost';
}

export function WordSurvivorPage() {
  const {
    connected,
    playerId,
    playerName,
    playerState,
    error,
    kicked,
    setError,
    ackIntro,
    typeLetter,
    backspace,
    submit,
    pauseTimer,
    resumeTimer,
    subscription,
  } = useWordSurvivorSocket('player');
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(false);
  const seen = useRef<WordSurvivorPhase | null>(null);

  useEffect(() => {
    if (!playerState) {
      return;
    }
    if (playerState.phase === 'splash' && seen.current !== 'splash') {
      setShowSplash(true);
    }
    seen.current = playerState.phase;
  }, [playerState]);

  useEffect(() => {
    if (!showSplash || !playerState?.splashUntil) {
      return;
    }
    const delay = Math.max(0, playerState.splashUntil - Date.now());
    const id = window.setTimeout(() => setShowSplash(false), delay);
    return () => window.clearTimeout(id);
  }, [showSplash, playerState?.splashUntil]);

  useEffect(() => {
    if (playerState?.phase !== 'reveal' || playerState.revealUntil == null) {
      return;
    }
    const revealUntil = playerState.revealUntil;
    let cancelled = false;
    let timer = 0;
    const advance = () => {
      const wait = Math.max(0, revealUntil - Date.now());
      timer = window.setTimeout(() => {
        if (cancelled) {
          return;
        }
        void resumeTimer().finally(() => {
          if (!cancelled) {
            timer = window.setTimeout(advance, 400);
          }
        });
      }, wait);
    };
    advance();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [playerState?.phase, playerState?.revealUntil, resumeTimer]);

  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (playerState?.phase !== 'splash') {
      return;
    }
    const id = window.setInterval(() => setTick(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [playerState?.phase]);

  const splashBlocking =
    playerState?.phase === 'splash' &&
    (showSplash || (playerState.splashUntil != null && playerState.splashUntil > tick));

  // Keyed on the hold itself: each pause or resume answers with new state,
  // so depending on `playerState` would send them in a loop.
  const timerHeld =
    playerState == null || finished(playerState.phase)
      ? null
      : instructionsOpen ||
        Boolean(splashBlocking) ||
        playerState.phase === 'intro' ||
        playerState.phase === 'reveal';
  useEffect(() => {
    if (timerHeld == null || subscription === 0) {
      return;
    }
    void (timerHeld ? pauseTimer() : resumeTimer());
  }, [timerHeld, subscription, pauseTimer, resumeTimer]);

  const elapsedLabel = useElapsedClock(
    playerState?.elapsedMs ?? 0,
    playerState?.activeSince ?? null,
    !playerState || instructionsOpen || Boolean(splashBlocking) || playerState.phase !== 'playing',
    playerState != null && finished(playerState.phase)
  );

  const play = (run: () => Promise<{ ok: boolean; error?: string; dropped?: boolean }>) => {
    void run().then((result) => {
      if (result?.dropped) {
        return;
      }
      if (!result?.ok) {
        setError(result?.error || 'Could not play');
      } else {
        setError(null);
      }
    });
  };
  const playRef = useRef(play);
  playRef.current = play;
  const typeRef = useRef(typeLetter);
  typeRef.current = typeLetter;
  const backspaceRef = useRef(backspace);
  backspaceRef.current = backspace;
  const submitRef = useRef(submit);
  submitRef.current = submit;

  const blocked =
    instructionsOpen ||
    Boolean(splashBlocking) ||
    playerState == null ||
    playerState.phase !== 'playing';
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (blockedRef.current || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        playRef.current(() => submitRef.current());
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        playRef.current(() => backspaceRef.current());
        return;
      }
      if (/^[a-zA-Z]$/.test(event.key)) {
        event.preventDefault();
        playRef.current(() => typeRef.current(event.key));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!playerId || !playerName) {
    return <Navigate to="/login" replace />;
  }

  if (kicked) {
    return (
      <div className="min-h-[100dvh] bg-playfield px-4 py-8 text-center">
        <h1 className="font-display text-4xl font-bold text-ink">You were removed</h1>
        <Button asChild size="lg" className="mt-8">
          <Link to="/login">Back to login</Link>
        </Button>
      </div>
    );
  }

  if (!playerState) {
    return (
      <div className="min-h-[100dvh] bg-playfield px-4 py-8 text-center font-bold text-ink">
        {connected ? 'Loading word survivor…' : 'Connecting…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
        <Button asChild size="lg" variant="outline" className="mt-8">
          <Link to="/">Return to Lobby</Link>
        </Button>
      </div>
    );
  }

  const intro = playerState.phase === 'intro';
  const modalOpen = instructionsOpen || intro;
  const splashVisible = Boolean(splashBlocking) && !modalOpen;

  const confirmInstructions = async () => {
    if (playerState.phase === 'intro') {
      const result = await ackIntro();
      if (!result.ok) {
        setError(result.error ?? 'Could not start');
        return;
      }
    }
    setInstructionsOpen(false);
  };

  return (
    <div className="min-h-[100dvh] bg-playfield text-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <GamePlayHeader
          game="Word Survivor"
          title={`Word ${playerState.wordNumber} of ${playerState.wordCount}`}
          topic={playerState.topic}
          elapsedLabel={elapsedLabel}
          instructions={
            <Instructions
              open={modalOpen}
              intro={intro}
              onOpenChange={setInstructionsOpen}
              onOk={() => void confirmInstructions()}
            />
          }
        />
        <GameScore score={playerState.score} />

        {error ? (
          <p role="alert" className="pb-2 text-center font-bold text-coral">
            {error}
          </p>
        ) : null}

        <div className="relative">
          <SurvivorBoard
            length={playerState.length}
            maxGuesses={playerState.maxGuesses}
            guesses={playerState.guesses}
            draft={playerState.draft}
            showCursor={playerState.phase === 'playing'}
          />
          {splashVisible ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-ink/80 px-6 text-center text-white">
              <p className="text-sm font-extrabold uppercase tracking-widest text-sun">Correct</p>
              <p className="font-display text-4xl font-bold">Next level</p>
              <p className="mt-2 text-lg font-semibold">
                Word {playerState.wordNumber} · {playerState.length} letters
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <SurvivorKeyboard
            guesses={playerState.guesses}
            disabled={blocked}
            onLetter={(letter) => play(() => typeLetter(letter))}
            onBackspace={() => play(() => backspace())}
            onSubmit={() => play(() => submit())}
          />
        </div>
      </div>

      {playerState.phase === 'lost' || playerState.phase === 'won' ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/75 px-4 text-center text-white">
          {playerState.phase === 'won' ? <WinnerConfetti active /> : null}
          <div className="relative z-10 max-w-md">
            <h2 className="font-display text-5xl font-bold">
              {playerState.phase === 'won' ? 'You survived!' : 'Game over'}
            </h2>
            {playerState.phase === 'won' ? (
              <p className="mt-3 text-lg font-semibold">You made it through every word.</p>
            ) : (
              <p className="mt-3 text-lg font-semibold">
                The word was <span className="uppercase">{playerState.answer}</span>
              </p>
            )}
            <p className="mt-4 text-sm font-extrabold uppercase tracking-widest text-white/70">
              Final score
            </p>
            <p className="font-display text-6xl font-bold tabular-nums">{playerState.score}</p>
            <p className="mt-3 text-lg font-semibold">Time {elapsedLabel}</p>
            <Button asChild size="lg" variant="outline" className="mt-8 bg-white text-ink">
              <Link to="/">Return to Lobby</Link>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Instructions({
  open,
  intro,
  onOpenChange,
  onOk,
}: {
  open: boolean;
  intro: boolean;
  onOpenChange: (open: boolean) => void;
  onOk: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && intro) {
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="xs" className="border-2 shadow-none">
          Instructions
        </Button>
      </DialogTrigger>
      <DialogContent
        className="m-0 flex h-[100dvh] max-h-none w-full max-w-none flex-col overflow-hidden rounded-none border-0 bg-playfield p-6 shadow-none md:m-auto md:h-fit md:max-h-[92dvh] md:w-[min(92vw,32rem)] md:overflow-y-auto md:rounded-3xl md:border-4 md:!bg-none md:!bg-cream md:shadow-pop"
        onPointerDownOutside={(event) => {
          if (intro) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (intro) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Word Survivor</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-base font-semibold leading-relaxed text-ink/80 md:text-sm">
          <p>
            Guess 25 words: five words of 5 letters, then five of 6, and so on through 9. Stay in
            as long as you can.
          </p>
          <p>
            Type with the keyboard under the board, or a physical keyboard. The cursor moves left
            to right. Backspace removes the previous letter. Enter submits the word.
          </p>
          <p>
            A correct word is worth 100 points, plus 5 for each guess you did not need. You have 5
            guesses. Missing the fifth one ends your run.
          </p>
          <p>
            The timer starts when you type the first letter. It pauses during these instructions,
            between words, and while you are away from this page.
          </p>
        </div>
        <div className="mt-6">
          {intro ? (
            <Button type="button" className="w-full" onClick={onOk}>
              OK
            </Button>
          ) : (
            <DialogClose asChild>
              <Button type="button" className="w-full">
                OK
              </Button>
            </DialogClose>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
