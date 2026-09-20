import { cn } from '@/lib/utils';

interface CountdownProps {
  remainingMs: number;
  totalMs?: number;
  label?: string;
}

export function Countdown({
  remainingMs,
  totalMs,
  label = 'Time left',
}: CountdownProps) {
  const seconds = Math.ceil(remainingMs / 1000);
  const progress =
    totalMs && totalMs > 0 ? Math.min(1, Math.max(0, remainingMs / totalMs)) : 0;

  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-sm font-extrabold uppercase tracking-wide text-ink/70">
        <span>{label}</span>
        <span className={cn(seconds <= 5 && 'text-coral')}>{seconds}s</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-ink/10">
        <div
          className="h-full rounded-full bg-grape transition-[width] duration-100"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
