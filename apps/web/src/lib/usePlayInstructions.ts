import { useEffect, useRef, useState } from 'react';
import { playHasStarted } from '@/lib/playHasStarted';

type ClockState = {
  elapsedMs: number;
  activeSince: number | null;
  completed: boolean;
};

/**
 * First-run how-to-play for crossword / word search / sudoku.
 * Open state is derived from server clock progress so the dialog is correct on
 * the first paint after `playerState` arrives — no false→true effect flicker.
 */
export function usePlayInstructions(
  playerState: ClockState | null,
  pauseTimer: () => Promise<unknown>,
  resumeTimer: () => Promise<unknown>
) {
  const [introDismissed, setIntroDismissed] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const instructionsOpenRef = useRef(false);
  const timerChain = useRef(Promise.resolve());
  const didResume = useRef(false);

  const needsIntro =
    playerState != null && !playHasStarted(playerState) && !introDismissed;
  const open = needsIntro || manualOpen;
  instructionsOpenRef.current = open;

  useEffect(() => {
    if (!playerState || !playHasStarted(playerState) || didResume.current) {
      return;
    }
    didResume.current = true;
    void resumeTimer();
  }, [playerState, resumeTimer]);

  const onOpenChange = (next: boolean) => {
    if (needsIntro && !next) {
      setIntroDismissed(true);
    }
    setManualOpen(next);
    timerChain.current = timerChain.current.then(async () => {
      if (next) {
        await pauseTimer();
      } else {
        await resumeTimer();
      }
    });
  };

  return {
    open,
    intro: needsIntro,
    instructionsOpenRef,
    onOpenChange,
  };
}
