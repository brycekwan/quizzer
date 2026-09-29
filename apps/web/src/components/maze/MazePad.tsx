import type { MazeDirection } from '@party/shared';
import { Button } from '@/components/ui/button';
import { Heart } from './icons';

const ARROWS: { direction: MazeDirection; label: string; glyph: string }[] = [
  { direction: 'n', label: 'Up', glyph: '↑' },
  { direction: 'w', label: 'Left', glyph: '←' },
  { direction: 's', label: 'Down', glyph: '↓' },
  { direction: 'e', label: 'Right', glyph: '→' },
];

export function MazePad({
  lives,
  disabled,
  onMove,
  onRestart,
}: {
  lives: number;
  disabled: boolean;
  onMove: (direction: MazeDirection) => void;
  onRestart: () => void;
}) {
  const byDirection = Object.fromEntries(ARROWS.map((arrow) => [arrow.direction, arrow])) as Record<
    MazeDirection,
    (typeof ARROWS)[number]
  >;

  return (
    <div className="flex items-end justify-center gap-4">
      <div className="grid grid-cols-3 gap-2">
        <span />
        <PadButton arrow={byDirection.n} disabled={disabled} onMove={onMove} />
        <span />
        <PadButton arrow={byDirection.w} disabled={disabled} onMove={onMove} />
        <PadButton arrow={byDirection.s} disabled={disabled} onMove={onMove} />
        <PadButton arrow={byDirection.e} disabled={disabled} onMove={onMove} />
      </div>
      <div className="flex items-center gap-3 pb-1">
        <Button type="button" variant="outline" disabled={disabled} onClick={onRestart}>
          Restart
        </Button>
        <div className="flex" role="img" aria-label={`${lives} ${lives === 1 ? 'life' : 'lives'} left`}>
          {[0, 1, 2].map((index) => (
            <Heart key={index} filled={index < lives} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PadButton({
  arrow,
  disabled,
  onMove,
}: {
  arrow: (typeof ARROWS)[number];
  disabled: boolean;
  onMove: (direction: MazeDirection) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-14 w-14 text-2xl"
      aria-label={arrow.label}
      disabled={disabled}
      onClick={() => onMove(arrow.direction)}
    >
      {arrow.glyph}
    </Button>
  );
}
