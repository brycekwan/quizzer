import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PlayerActionList } from '@/components/PlayerActionList';
import { Button } from '@/components/ui/button';
import { useSystemSocket } from '@/hooks/useSystemSocket';
import { useHostSecret } from '@/hooks/useHostSecret';
import { HostPassphrasePrompt } from '@/components/HostPassphrasePrompt';
import {
  MAX_IDLE_TIMEOUT_MINUTES,
  MIN_IDLE_TIMEOUT_MINUTES,
  PARTY_THEMES,
  type PartyTheme,
} from '@party/shared';
import { Label } from '@/components/ui/label';

type PendingAction =
  | { kind: 'reset' }
  | { kind: 'kick'; playerId: string; name: string };

export function SystemAdminPage() {
  const host = useHostSecret();
  const {
    connected,
    adminState,
    error,
    setError,
    kick,
    resetAll,
    setTheme,
    setIdleTimeout,
    hostReady,
  } = useSystemSocket(host.secret, host.attempt);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [working, setWorking] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState<string | null>(null);

  if (!hostReady) {
    return (
      <HostPassphrasePrompt
        checking={Boolean(host.secret) && !error}
        error={error}
        onSubmit={host.save}
      />
    );
  }

  if (!adminState) {
    return (
      <div className="min-h-screen bg-playfield p-6 font-bold text-ink">
        Connecting to system{connected ? '…' : '…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
      </div>
    );
  }

  const confirm = async () => {
    if (!pending) {
      return;
    }
    setWorking(true);
    const result =
      pending.kind === 'reset'
        ? await resetAll()
        : await kick(pending.playerId);
    setWorking(false);
    if (!result.ok) {
      setError(
        result.error ??
          (pending.kind === 'reset'
            ? 'Could not reset the party'
            : 'Could not remove player')
      );
      return;
    }
    setPending(null);
  };

  const idleMinutesValue =
    idleMinutes ?? String(Math.round(adminState.idleTimeoutMs / 60_000));

  const commitIdleTimeout = async () => {
    const value = Number(idleMinutesValue);
    if (
      !Number.isInteger(value) ||
      value < MIN_IDLE_TIMEOUT_MINUTES ||
      value > MAX_IDLE_TIMEOUT_MINUTES
    ) {
      setError(
        `Choose between ${MIN_IDLE_TIMEOUT_MINUTES} and ${MAX_IDLE_TIMEOUT_MINUTES} minutes`
      );
      setIdleMinutes(String(Math.round(adminState.idleTimeoutMs / 60_000)));
      return;
    }
    const result = await setIdleTimeout(value);
    setIdleMinutes(null);
    if (!result?.ok) {
      setError(result?.error ?? 'Could not update the idle timeout');
    }
  };

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              System host
            </p>
            <h1 className="font-display text-4xl font-bold">Players</h1>
            <p className="mt-1 text-sm font-semibold text-ink/60">
              {adminState.players.length}{' '}
              {adminState.players.length === 1 ? 'player' : 'players'} connected
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[10rem]">
              <Label htmlFor="party-theme">Theme</Label>
              <select
                id="party-theme"
                value={adminState.theme}
                className="mt-1 flex h-10 w-full rounded-2xl border-4 border-ink/15 bg-white px-3 text-sm font-bold text-ink shadow-pop-sm outline-none focus-visible:ring-4 focus-visible:ring-sun/70"
                onChange={(event) => {
                  const next = event.target.value as PartyTheme;
                  void setTheme(next).then((result) => {
                    if (!result?.ok) {
                      setError(result?.error ?? 'Could not change the theme');
                    }
                  });
                }}
              >
                {PARTY_THEMES.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme === 'standard' ? 'Standard' : theme === 'dark' ? 'Dark' : 'Baby'}
                  </option>
                ))}
              </select>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/host">Back to host menu</Link>
            </Button>
            <Button
              variant="coral"
              size="sm"
              onClick={() => setPending({ kind: 'reset' })}
            >
              Reset all
            </Button>
          </div>
        </div>

        <section className="space-y-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <h2 className="font-display text-2xl font-bold">Idle timeout</h2>
          <div className="space-y-1">
            <Label htmlFor="idle-minutes">Minutes before sign-out</Label>
            <input
              id="idle-minutes"
              type="number"
              min={MIN_IDLE_TIMEOUT_MINUTES}
              max={MAX_IDLE_TIMEOUT_MINUTES}
              step={1}
              className="flex h-12 w-full max-w-xs rounded-2xl border-4 border-ink/15 bg-white px-4 text-base font-bold text-ink shadow-pop-sm outline-none focus-visible:ring-4 focus-visible:ring-sun/70"
              value={idleMinutesValue}
              onChange={(event) => setIdleMinutes(event.target.value)}
              onBlur={() => void commitIdleTimeout()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <p className="text-sm font-semibold text-ink/55">
            Whole minutes from {MIN_IDLE_TIMEOUT_MINUTES} to {MAX_IDLE_TIMEOUT_MINUTES}.
            Players with an open connection but no gameplay input are signed out so the
            name can be reused. Scores are kept.
          </p>
        </section>

        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}

        <PlayerActionList
          empty="No players are connected."
          actionLabel="Kick"
          actionVariant="coral"
          players={[...adminState.players]
            .sort((left, right) => left.name.localeCompare(right.name))
            .map((player) => ({ id: player.playerId, name: player.name }))}
          onAction={(player) =>
            setPending({
              kind: 'kick',
              playerId: player.id,
              name: player.name,
            })
          }
        />
      </div>

      <ConfirmDialog
        open={pending != null}
        title={pending?.kind === 'kick' ? `Kick ${pending.name}?` : 'Reset the party?'}
        description={
          pending?.kind === 'kick'
            ? `${pending.name} will be removed from every game. Their scores will be wiped, and they will need to log in again.`
            : 'Every player will be removed from the party. Scores in the quiz, crossword, word search, sudoku, maze, and word survivor will be wiped, and everyone will need to log in again.'
        }
        confirmLabel={pending?.kind === 'kick' ? 'Kick' : 'Reset all'}
        pending={working}
        onConfirm={() => void confirm()}
        onOpenChange={(open) => {
          if (!open) {
            setPending(null);
          }
        }}
      />
    </div>
  );
}
