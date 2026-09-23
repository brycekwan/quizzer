import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

/** Fire a short colorful confetti burst for the top finisher. */
export function WinnerConfetti({ active }: { active: boolean }) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!active || firedRef.current) {
      return;
    }
    firedRef.current = true;

    const colors = ['#ff6b6b', '#ffd166', '#06d6a0', '#4cc9f0', '#7b2cbf', '#fff7ed'];
    const end = Date.now() + 2_400;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0 },
        colors,
        startVelocity: 45,
        gravity: 0.9,
        ticks: 200,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 3,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0 },
        colors,
        startVelocity: 45,
        gravity: 0.9,
        ticks: 200,
        disableForReducedMotion: true,
      });
      confetti({
        particleCount: 2,
        angle: 90,
        spread: 70,
        origin: { x: 0.5, y: 0 },
        colors,
        startVelocity: 35,
        gravity: 0.85,
        ticks: 200,
        disableForReducedMotion: true,
      });

      if (Date.now() < end) {
        requestAnimationFrame(frame);
      }
    };

    frame();
  }, [active]);

  return null;
}
