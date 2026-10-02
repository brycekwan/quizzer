import { Button } from '@/components/ui/button';

export function PlayerActionList({
  empty,
  players,
  actionLabel,
  actionVariant = 'outline',
  onAction,
}: {
  empty: string;
  players: Array<{ id: string; name: string }>;
  actionLabel: string;
  actionVariant?: 'outline' | 'coral';
  onAction: (player: { id: string; name: string }) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[2rem] border-4 border-white/60 bg-white/75 shadow-pop backdrop-blur">
      <div className="border-b-4 border-ink/10 px-5 py-3">
        <h2 className="font-display text-2xl font-bold">Players</h2>
      </div>
      {players.length === 0 ? (
        <p className="px-5 py-8 text-center font-semibold text-ink/50">{empty}</p>
      ) : (
        <ul className="divide-y-2 divide-ink/10">
          {players.map((player) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-3 px-5 py-4"
            >
              <p className="min-w-0 truncate font-display text-xl font-bold">
                {player.name}
              </p>
              <Button
                variant={actionVariant}
                size="sm"
                onClick={() => onAction(player)}
              >
                {actionLabel}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
