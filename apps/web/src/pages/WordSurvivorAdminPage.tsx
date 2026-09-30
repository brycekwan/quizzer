import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { WordSurvivorPhase } from '@party/shared';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { HostPassphrasePrompt } from '@/components/HostPassphrasePrompt';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useHostSecret } from '@/hooks/useHostSecret';
import { useWordSurvivorSocket } from '@/hooks/useWordSurvivorSocket';
import { computeElapsedMs, formatElapsedMs } from '@/lib/crosswordClient';

function ElapsedCell({
  elapsedMs,
  activeSince,
}: {
  elapsedMs: number;
  activeSince: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (activeSince == null) {
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [activeSince]);

  if (elapsedMs === 0 && activeSince == null) {
    return <span className="text-ink/40">—</span>;
  }

  return (
    <span className="tabular-nums">{formatElapsedMs(computeElapsedMs(elapsedMs, activeSince, now))}</span>
  );
}

function phaseName(phase: WordSurvivorPhase) {
  if (phase === 'intro') {
    return 'Not started';
  }
  if (phase === 'playing') {
    return 'Playing';
  }
  if (phase === 'reveal') {
    return 'Correct';
  }
  if (phase === 'splash') {
    return 'Next word';
  }
  if (phase === 'won') {
    return 'Survived';
  }
  return 'Out';
}

export function WordSurvivorAdminPage() {
  const host = useHostSecret();
  const { connected, adminState, error, setError, reset, resetPlayer, setSplash, selectList, hostReady } =
    useWordSurvivorSocket('admin', host.secret, host.attempt);
  const [confirm, setConfirm] = useState<
    { kind: 'all' } | { kind: 'player'; playerId: string; name: string } | null
  >(null);
  const [confirming, setConfirming] = useState(false);
  const [seconds, setSeconds] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);

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
        {connected ? 'Loading word survivor…' : 'Connecting…'}
        {error ? <p className="mt-4 text-coral">{error}</p> : null}
      </div>
    );
  }

  const splashSeconds = seconds ?? String(adminState.splashMs / 1000);
  const selectedFile = fileId ?? adminState.fileId;
  const topicValue = topic ?? adminState.topic;

  const submitList = async () => {
    setError(null);
    setAccepted(null);
    const result = await selectList(selectedFile, topicValue);
    setFileId(null);
    setTopic(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not select that word list');
      return;
    }
    setAccepted(result.message ?? 'Selection accepted');
  };

  const commitSplash = async () => {
    const value = Number(splashSeconds);
    if (!Number.isInteger(value) || value < 1 || value > 10) {
      setSeconds(null);
      setError('Splash must be a whole number of seconds from 1 to 10');
      return;
    }
    const result = await setSplash(value);
    setSeconds(null);
    if (!result.ok) {
      setError(result.error ?? 'Could not update the splash');
    }
  };

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
              Word Survivor host
            </p>
            <h1 className="font-display text-4xl font-bold">Word Survivor</h1>
            <p className="mt-1 text-sm font-semibold text-ink/60">
              {adminState.players.length} {adminState.players.length === 1 ? 'player' : 'players'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/host">Back to host menu</Link>
            </Button>
            <Button variant="coral" size="sm" onClick={() => setConfirm({ kind: 'all' })}>
              Reset all
            </Button>
          </div>
        </div>

        {error ? (
          <p role="alert" className="font-bold text-coral">
            {error}
          </p>
        ) : null}
        {adminState.loadError ? (
          <p role="alert" className="font-bold text-coral">
            Word list: {adminState.loadError}
          </p>
        ) : null}

        <section className="space-y-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <h2 className="font-display text-2xl font-bold">Word list</h2>
          <div className="space-y-1">
            <Label htmlFor="word-list">File</Label>
            <select
              id="word-list"
              className="flex h-12 w-full rounded-2xl border-4 border-ink/15 bg-white px-4 text-base font-bold text-ink shadow-pop-sm outline-none focus-visible:ring-4 focus-visible:ring-sun/70"
              value={selectedFile}
              onChange={(event) => {
                setFileId(event.target.value);
                setAccepted(null);
              }}
            >
              {adminState.files.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="word-topic">Topic hint</Label>
            <input
              id="word-topic"
              maxLength={40}
              className="flex h-12 w-full rounded-2xl border-4 border-ink/15 bg-white px-4 text-base font-bold text-ink shadow-pop-sm outline-none focus-visible:ring-4 focus-visible:ring-sun/70"
              value={topicValue}
              placeholder="Leave blank to hide the hint"
              onChange={(event) => {
                setTopic(event.target.value);
                setAccepted(null);
              }}
            />
          </div>
          <Button type="button" onClick={() => void submitList()}>
            Submit
          </Button>
          {accepted ? (
            <p role="status" className="font-bold text-grape">
              {accepted}
            </p>
          ) : null}
          <p className="text-sm font-semibold text-ink/55">
            {adminState.counts
              .map((count) => `${count.count} of ${count.length} letters`)
              .join(' · ')}. A file needs at least 25 words, with 5 of each length from 5 through 9. New runs and resets use the submitted file. Players already in a run keep their words.
          </p>
        </section>

        <section className="space-y-3 rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <h2 className="font-display text-2xl font-bold">Splash</h2>
          <div className="space-y-1">
            <Label htmlFor="splash-seconds">Seconds between words</Label>
            <input
              id="splash-seconds"
              type="number"
              min={1}
              max={10}
              step={1}
              className="flex h-12 w-full rounded-2xl border-4 border-ink/15 bg-white px-4 text-base font-bold text-ink shadow-pop-sm outline-none focus-visible:ring-4 focus-visible:ring-sun/70"
              value={splashSeconds}
              onChange={(event) => setSeconds(event.target.value)}
              onBlur={() => void commitSplash()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.currentTarget.blur();
                }
              }}
            />
          </div>
          <p className="text-sm font-semibold text-ink/55">
            Whole seconds from 1 to 10. The solved word stays green for 2 seconds before this splash.
          </p>
        </section>

        <section className="overflow-hidden rounded-[2rem] border-4 border-white/60 bg-white/75 shadow-pop backdrop-blur">
          <div className="border-b-4 border-ink/10 px-5 py-3">
            <h2 className="font-display text-2xl font-bold">Leaderboard</h2>
            <p className="text-sm font-semibold text-ink/60">
              Highest score, then shortest time. 100 for a correct word, plus 5 for each unused
              guess.
            </p>
          </div>
          {adminState.players.length === 0 ? (
            <p className="px-5 py-8 text-center font-semibold text-ink/50">
              No players have played word survivor yet.
            </p>
          ) : (
            <ul className="divide-y-2 divide-ink/10">
              {adminState.players.map((player, index) => (
                <li
                  key={player.playerId}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold">
                      <span className="mr-2 text-ink/40">{index + 1}.</span>
                      {player.name}
                    </p>
                    <p className="text-sm font-semibold text-ink/55">
                      {phaseName(player.phase)} · word {player.wordNumber} · {player.length}{' '}
                      letters ·{' '}
                      <ElapsedCell elapsedMs={player.elapsedMs} activeSince={player.activeSince} />
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="font-display text-2xl font-bold text-grape">{player.score}</p>
                      <p className="text-xs font-extrabold uppercase tracking-wide text-ink/45">
                        points
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setConfirm({
                          kind: 'player',
                          playerId: player.playerId,
                          name: player.name,
                        })
                      }
                    >
                      Reset
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <ConfirmDialog
        open={confirm != null}
        title={
          confirm?.kind === 'player'
            ? `Reset ${confirm.name}'s run?`
            : 'Reset word survivor?'
        }
        description={
          confirm?.kind === 'player'
            ? `${confirm.name} starts over on the first 5-letter word. Their score and time are cleared.`
            : 'Every player starts over on the first 5-letter word. Scores and times are cleared.'
        }
        confirmLabel="Reset"
        pending={confirming}
        onConfirm={() => {
          void (async () => {
            if (!confirm) {
              return;
            }
            setConfirming(true);
            const result =
              confirm.kind === 'all' ? await reset() : await resetPlayer(confirm.playerId);
            setConfirming(false);
            setConfirm(null);
            if (!result.ok) {
              setError(result.error ?? 'Could not reset');
            }
          })();
        }}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
          }
        }}
      />
    </div>
  );
}
