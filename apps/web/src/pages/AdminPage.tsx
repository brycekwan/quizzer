import { FormEvent, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { GameConfig } from '@quizzer/shared';
import { useGameSocket, useSyncedCountdown } from '@/hooks/useGameSocket';
import { AnswerGrid } from '@/components/AnswerGrid';
import { Leaderboard } from '@/components/Leaderboard';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function AdminPage() {
  const { connected, state, start, pause, resume, reset, config, kick } =
    useGameSocket('admin');
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<GameConfig | null>(null);

  useEffect(() => {
    if (state?.config && !form) {
      setForm(state.config);
    }
  }, [state?.config, form]);

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}/play`;
  }, []);

  const remainingMs = useSyncedCountdown(
    state?.phase === 'answering' ? state.questionEndsAt : state?.phaseEndsAt,
    state?.serverNow
  );

  const canPause = state?.status === 'active' && state.phase === 'leaderboard';
  const canResume = state?.status === 'paused';

  const run = async (
    action: () => Promise<unknown>,
    okMessage: string
  ) => {
    const result = (await action()) as { ok?: boolean; error?: string };
    if (result?.ok === false) {
      setMessage(result.error ?? 'Action failed');
    } else {
      setMessage(okMessage);
    }
  };

  const saveConfig = async (event: FormEvent) => {
    event.preventDefault();
    if (!form) return;
    const result = (await config(form)) as { ok?: boolean; error?: string };
    setMessage(result?.ok === false ? result.error ?? 'Invalid config' : 'Config saved');
  };

  if (!state) {
    return (
      <div className="min-h-screen bg-playfield p-6 font-bold text-ink">
        Connecting to game server{connected ? '…' : '…'}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-playfield px-4 py-6 text-ink">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-extrabold uppercase tracking-widest text-grape">
                Quizzer host
              </p>
              <h1 className="font-display text-4xl font-bold">Admin console</h1>
            </div>
            <StatusBadge status={state.status} phase={state.phase} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              onClick={() => void run(start, 'Game started')}
              disabled={state.status === 'active' || state.status === 'paused'}
            >
              Start
            </Button>
            <Button
              variant="sun"
              disabled={!canPause}
              onClick={() => void run(pause, 'Game paused')}
            >
              Pause
            </Button>
            <Button
              variant="mint"
              disabled={!canResume}
              onClick={() => void run(resume, 'Game resumed')}
            >
              Resume
            </Button>
            <Button variant="coral" onClick={() => void run(reset, 'Game reset')}>
              Reset
            </Button>
          </div>
          {message ? (
            <p className="mt-3 font-bold text-grape" role="status">
              {message}
            </p>
          ) : null}
          {!canPause && state.status === 'active' && state.phase === 'answering' ? (
            <p className="mt-2 text-sm font-semibold text-ink/60">
              Pause unlocks after the question ends (on the leaderboard).
            </p>
          ) : null}

          <div className="mt-6 rounded-2xl border-4 border-ink/10 bg-cream/80 p-4">
            <Label>Player join link</Label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input readOnly value={joinUrl} aria-label="Join link" />
              <Button
                variant="outline"
                type="button"
                onClick={() => void navigator.clipboard.writeText(joinUrl)}
              >
                Copy
              </Button>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="sky" type="button">
                    QR code
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Scan to join</DialogTitle>
                  </DialogHeader>
                  <div className="flex flex-col items-center gap-4 print:p-4">
                    <QRCodeSVG value={joinUrl} size={220} />
                    <p className="break-all text-center text-sm font-semibold text-ink/70">
                      {joinUrl}
                    </p>
                    <Button type="button" onClick={() => window.print()}>
                      Print
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <form onSubmit={saveConfig} className="mt-6 grid gap-3 sm:grid-cols-2">
            <h2 className="font-display text-2xl font-bold sm:col-span-2">
              Game config
            </h2>
            {form ? (
              <>
                <Field
                  label="Seconds per question (min 10)"
                  value={form.timeLimitSeconds}
                  onChange={(v) => setForm({ ...form, timeLimitSeconds: v })}
                />
                <Field
                  label="Default score"
                  value={form.defaultScore}
                  onChange={(v) => setForm({ ...form, defaultScore: v })}
                />
                <Field
                  label="Minimum score"
                  value={form.minScore}
                  onChange={(v) => setForm({ ...form, minScore: v })}
                />
                <Field
                  label="Scale (ms)"
                  value={form.scaleMs}
                  onChange={(v) => setForm({ ...form, scaleMs: v })}
                />
                <Button type="submit" className="sm:col-span-2" variant="outline">
                  Save config
                </Button>
              </>
            ) : null}
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
            <Leaderboard
              entries={state.leaderboard}
              title="Live scores"
              paused={state.status === 'paused'}
              onKick={(id) => void kick(id)}
            />
          </div>

          {state.currentQuestion &&
          (state.status === 'active' || state.status === 'paused') ? (
            <div className="rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
              <p className="text-xs font-extrabold uppercase text-ink/60">
                Current question · {Math.ceil(remainingMs / 1000)}s · phase{' '}
                {state.phase}
                {state.phase === 'answering'
                  ? ` · ${state.answeredPlayerCount}/${state.totalPlayerCount} answered`
                  : ''}
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold">
                {state.currentQuestion.question}
              </h2>
              {state.currentQuestion.multiplier &&
              state.currentQuestion.multiplier > 1 ? (
                <p className="mt-2 font-display text-lg font-bold text-grape">
                  {state.currentQuestion.multiplier}X multiplier
                  {state.phase === 'multiplier' ? ' — splash' : ''}
                </p>
              ) : null}
              <p className="mt-2 text-sm font-bold text-emerald-700">
                Correct answer is highlighted in green
              </p>
              <div className="mt-4">
                <AnswerGrid
                  answers={state.currentQuestion.answers}
                  disabled
                  reveal
                />
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function StatusBadge({
  status,
  phase,
}: {
  status: string;
  phase: string | null;
}) {
  return (
    <div className="rounded-2xl bg-ink px-4 py-2 text-right text-cream shadow-pop-sm">
      <div className="font-display text-lg font-bold capitalize">{status}</div>
      <div className="text-xs font-semibold uppercase tracking-wide text-cream/70">
        {phase ?? 'idle'}
      </div>
    </div>
  );
}
