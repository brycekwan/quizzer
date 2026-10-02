import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { MazeDirection, MazePhase } from '@party/shared';
import { GamePlayHeader, GameScore } from '@/components/GamePlayHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { MazeGrid } from '@/components/maze/MazeGrid';
import { MazePad } from '@/components/maze/MazePad';
import { MilkBottle } from '@/components/maze/icons';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useMazeSocket } from '@/hooks/useMazeSocket';
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
    if (activeSince == null && elapsedMs === 0) {
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

function levelName(level: 'easy' | 'medium' | 'hard') {
  if (level === 'easy') {
    return 'Easy';
  }
  if (level === 'medium') {
    return 'Medium';
  }
  return 'Hard';
}

function finished(phase: MazePhase) {
  return phase === 'won' || phase === 'lost';
}

export function MazePage() {
  const {
    connected,
    playerId,
    playerName,
    playerState,
    error,
    kicked,
    setError,
    ackIntro,
    move,
    restart,
    pauseTimer,
    resumeTimer,
  } = useMazeSocket('player');
  const [instructionsOpen, setInstructionsOpen] = useState(true);
  const [showSplash, setShowSplash] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const instructionsOpenRef = useRef(instructionsOpen);
  instructionsOpenRef.current = instructionsOpen;
  const seen = useRef<{ phase: MazePhase; level: string } | null>(null);
  const moving = useRef(false);

  useEffect(() => {
    if (!playerState) {
      return;
    }
    const previous = seen.current;
    if (previous?.phase === 'playing' && playerState.phase === 'splash') {
      setShowSplash(true);
    }
    seen.current = { phase: playerState.phase, level: playerState.level };
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
    if (!playerState || finished(playerState.phase)) {
      return;
    }
    const splashBlocking =
      playerState.phase === 'splash' &&
      (showSplash || (playerState.splashUntil != null && playerState.splashUntil > Date.now()));
    const hold = instructionsOpen || splashBlocking || playerState.phase === 'intro';
    if (hold) {
      void pauseTimer();
      return;
    }
    void resumeTimer();
  }, [instructionsOpen, pauseTimer, playerState, resumeTimer, showSplash]);

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
  const elapsedLabel = useElapsedClock(
    playerState?.elapsedMs ?? 0,
    playerState?.activeSince ?? null,
    !playerState || instructionsOpen || Boolean(splashBlocking) || playerState.phase !== 'playing',
    playerState != null && finished(playerState.phase)
  );

  const sendMove = async (direction: MazeDirection) => {
    if (moving.current || !playerState) {
      return;
    }
    if (playerState.phase !== 'playing' && playerState.phase !== 'splash') {
      return;
    }
    if (instructionsOpenRef.current || showSplash || splashBlocking) {
      return;
    }
    moving.current = true;
    const result = await move(direction);
    moving.current = false;
    if (!result?.ok) {
      const message = result?.error ?? '';
      if (message === 'That way is blocked' || message === 'You cannot go back') {
        return;
      }
      setError(message || 'Could not move');
    } else {
      setError(null);
    }
  };
  const sendMoveRef = useRef(sendMove);
  sendMoveRef.current = sendMove;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (instructionsOpenRef.current || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const direction =
        event.key === 'ArrowUp'
          ? 'n'
          : event.key === 'ArrowLeft'
            ? 'w'
            : event.key === 'ArrowDown'
              ? 's'
              : event.key === 'ArrowRight'
                ? 'e'
                : null;
      if (!direction) {
        return;
      }
      event.preventDefault();
      void sendMoveRef.current(direction);
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
        {connected ? 'Loading maze…' : 'Connecting…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
        <Button asChild size="lg" variant="outline" className="mt-8">
          <Link to="/">Return to Lobby</Link>
        </Button>
      </div>
    );
  }

  const intro = playerState.phase === 'intro';
  const splashVisible = Boolean(splashBlocking) && !instructionsOpen;
  const controlsDisabled =
    instructionsOpen || splashVisible || (playerState.phase !== 'playing' && playerState.phase !== 'splash');

  const confirmInstructions = async () => {
    if (playerState.phase === 'intro') {
      const result = await ackIntro();
      if (!result.ok) {
        setError(result.error ?? 'Could not start');
        return;
      }
      setShowSplash(true);
    }
    setInstructionsOpen(false);
  };

  return (
    <div className="min-h-[100dvh] bg-playfield text-ink">
      <div className="mx-auto flex w-full max-w-xl flex-col px-3 py-3">
        <GamePlayHeader
          game="Maze"
          title={playerState.puzzle.title}
          detail={`${playerName} · ${levelName(playerState.level)}`}
          elapsedLabel={elapsedLabel}
          instructions={
            <MazeInstructions
              open={instructionsOpen}
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
          <MazeGrid state={playerState} disabled={controlsDisabled} onMove={(direction) => void sendMove(direction)} />
          {splashVisible ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-ink/80 px-6 text-center text-white">
              <p className="text-sm font-extrabold uppercase tracking-widest text-sun">Next level</p>
              <p className="font-display text-5xl font-bold">{levelName(playerState.level)}</p>
              <p className="mt-2 text-lg font-semibold">{playerState.puzzle.title}</p>
            </div>
          ) : null}
        </div>

        <div className="mt-4">
          <MazePad
            lives={playerState.lives}
            disabled={controlsDisabled}
            onMove={(direction) => void sendMove(direction)}
            onRestart={() => setConfirmRestart(true)}
          />
        </div>
      </div>

      {playerState.phase === 'lost' || playerState.phase === 'won' ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/75 px-4 text-center text-white">
          {playerState.phase === 'won' ? <MilkSpray /> : null}
          <div className="relative z-10 max-w-md">
            <h2 className="font-display text-5xl font-bold">
              {playerState.phase === 'won' ? 'Congratulations' : 'Game over'}
            </h2>
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

      <ConfirmDialog
        open={confirmRestart}
        title="Restart this maze?"
        description="Restarting costs 1 life. Your path on this maze is cleared and you cannot undo the restart."
        confirmLabel="Spend a life"
        pending={confirming}
        onConfirm={() => {
          void (async () => {
            setConfirming(true);
            const result = await restart();
            setConfirming(false);
            setConfirmRestart(false);
            if (!result.ok) {
              setError(result.error ?? 'Could not restart');
            }
          })();
        }}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmRestart(false);
          }
        }}
      />
    </div>
  );
}

function MazeInstructions({
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
        <Button type="button" variant="outline" size="sm">
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
          <DialogTitle>Baby is hungry</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-base font-semibold leading-relaxed text-ink/80 md:text-sm">
          <p>
            Baby is hungry and has to crawl a long way: out the nursery door, past the refrigerator,
            and all the way to a bottle of milk. Can you finish the quest?
          </p>
          <p>
            Move one square at a time with the controller at the bottom of the screen. On a
            desktop, the keyboard arrows work too.
          </p>
          <p>
            You cannot go back or retrace a square you already crawled. If you get stuck, Restart
            clears this maze and costs one life. You start with three hearts for the whole journey.
          </p>
          <p>The timer starts on your first move. It pauses during these instructions and between levels.</p>
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

function MilkSpray() {
  const bottles = [8, 22, 38, 54, 70, 86];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes milk-rise {
          0% { transform: translateY(0) scale(1); opacity: 0.95; }
          100% { transform: translateY(-110vh) scale(0.6); opacity: 0; }
        }
        @keyframes bottle-pop {
          0%, 100% { transform: translateY(0) rotate(-8deg); }
          50% { transform: translateY(-8px) rotate(8deg); }
        }
      `}</style>
      {bottles.map((left, index) => (
        <div
          key={left}
          className="absolute bottom-0 text-white"
          style={{ left: `${left}%`, animation: `bottle-pop 0.8s ease-in-out ${index * 0.1}s infinite` }}
        >
          <MilkBottle className="h-16 w-10" />
          {Array.from({ length: 6 }, (_, drop) => (
            <span
              key={drop}
              className="absolute left-1/2 top-0 h-3 w-2 rounded-full bg-white"
              style={{
                animation: `milk-rise 1.6s ease-out ${drop * 0.18 + index * 0.05}s infinite`,
                marginLeft: `${(drop - 3) * 6}px`,
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
