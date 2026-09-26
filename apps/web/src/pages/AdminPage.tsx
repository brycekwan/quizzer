import { useEffect, useMemo, useState, type InputHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { QRCodeSVG } from 'qrcode.react';
import type { GameConfig } from '@party/shared';
import { useGameSocket, useSyncedCountdown } from '@/hooks/useGameSocket';
import { AnswerGrid } from '@/components/AnswerGrid';
import { Leaderboard } from '@/components/Leaderboard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
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
import { Switch } from '@/components/ui/switch';
import {
  adminConfigSchema,
  questionSetsSchema,
  scheduleStartSchema,
  type AdminConfigFormValues,
  type QuestionSetsFormValues,
  type ScheduleStartFormValues,
} from './adminFormSchema';

export function AdminPage() {
  const {
    connected,
    state,
    start,
    pause,
    resume,
    reset,
    config,
    kick,
    setQuestionSets,
  } = useGameSocket('admin');
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: 'reset' } | { kind: 'kick'; playerId: string; name: string } | null
  >(null);
  const [confirming, setConfirming] = useState(false);

  const configForm = useForm<AdminConfigFormValues>({
    resolver: zodResolver(adminConfigSchema),
    mode: 'onChange',
    defaultValues: {
      timeLimitSeconds: 30,
      defaultScore: 1000,
      minScore: 100,
      scaleMs: 100,
      revealDurationMs: 2000,
      leaderboardDurationMs: 3000,
    },
  });

  const scheduleForm = useForm<ScheduleStartFormValues>({
    resolver: zodResolver(scheduleStartSchema),
    mode: 'onChange',
    defaultValues: {
      scheduleEnabled: false,
      delayMinutes: 15,
    },
  });

  const questionForm = useForm<QuestionSetsFormValues>({
    resolver: zodResolver(questionSetsSchema),
    mode: 'onChange',
    defaultValues: {
      mode: 'single',
      questionSetIds: [],
    },
  });

  useEffect(() => {
    if (!state?.config) {
      return;
    }
    configForm.reset(state.config);
    void configForm.trigger();
  }, [state?.config, configForm]);

  useEffect(() => {
    if (!state) {
      return;
    }
    questionForm.reset({
      mode: state.questionSetMode,
      questionSetIds: state.questionSetIds,
    });
    void questionForm.trigger();
  }, [state?.questionSetMode, state?.questionSetIds, state, questionForm]);

  const joinUrl = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return `${window.location.origin}/login`;
  }, []);

  const remainingMs = useSyncedCountdown(
    state?.phase === 'answering'
      ? state.questionEndsAt
      : state?.scheduledStartAt ?? state?.phaseEndsAt,
    state?.serverNow
  );

  const canPause = state?.status === 'active' && state.phase === 'leaderboard';
  const canResume = state?.status === 'paused';
  const canEditSetup = state?.status === 'waiting';
  const scheduleEnabled = scheduleForm.watch('scheduleEnabled');
  const questionMode = questionForm.watch('mode');
  const selectedSets = questionForm.watch('questionSetIds');

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

  const saveConfig = configForm.handleSubmit(async (values) => {
    const result = (await config(values as GameConfig)) as {
      ok?: boolean;
      error?: string;
    };
    setMessage(
      result?.ok === false ? result.error ?? 'Invalid config' : 'Config saved'
    );
  });

  const saveQuestionSets = questionForm.handleSubmit(async (values) => {
    const result = (await setQuestionSets(values)) as {
      ok?: boolean;
      error?: string;
    };
    setMessage(
      result?.ok === false
        ? result.error ?? 'Could not update question sets'
        : values.mode === 'continuous'
          ? `Continuous mode · ${values.questionSetIds.length} packs`
          : 'Question set updated'
    );
  });

  const handleStart = scheduleForm.handleSubmit(async (values) => {
    if (values.scheduleEnabled) {
      await run(
        () => start({ delayMinutes: values.delayMinutes }),
        `Game scheduled in ${values.delayMinutes} minute${
          values.delayMinutes === 1 ? '' : 's'
        }`
      );
      return;
    }
    await run(() => start({}), 'Game started');
  });

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
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/host">Back to host menu</Link>
              </Button>
              <StatusBadge status={state.status} phase={state.phase} />
            </div>
          </div>

          <div className="mt-5 space-y-3 rounded-2xl border-4 border-ink/10 bg-cream/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-bold">Start timing</p>
                <p className="text-sm font-semibold text-ink/60">
                  {scheduleEnabled
                    ? 'Schedule a delayed start'
                    : 'Start the game immediately'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="schedule-toggle" className="text-sm font-bold">
                  Schedule
                </Label>
                <Switch
                  id="schedule-toggle"
                  checked={scheduleEnabled}
                  disabled={!canEditSetup}
                  onCheckedChange={(checked) =>
                    scheduleForm.setValue('scheduleEnabled', checked, {
                      shouldValidate: true,
                    })
                  }
                />
              </div>
            </div>
            {scheduleEnabled ? (
              <div className="space-y-1">
                <Label htmlFor="delay-minutes">Delay (minutes)</Label>
                <Input
                  id="delay-minutes"
                  type="number"
                  min={1}
                  max={180}
                  disabled={!canEditSetup}
                  {...scheduleForm.register('delayMinutes')}
                />
                {scheduleForm.formState.errors.delayMinutes ? (
                  <p className="text-sm font-bold text-coral" role="alert">
                    {scheduleForm.formState.errors.delayMinutes.message}
                  </p>
                ) : null}
              </div>
            ) : null}
            {state.scheduledStartAt ? (
              <p className="font-bold text-grape" role="status">
                Starts in {Math.ceil(remainingMs / 1000)}s
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void handleStart()}
                disabled={
                  state.status === 'active' ||
                  state.status === 'paused' ||
                  Boolean(state.scheduledStartAt)
                }
              >
                {scheduleEnabled ? 'Schedule start' : 'Start'}
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
              <Button variant="coral" onClick={() => setConfirm({ kind: 'reset' })}>
                Reset
              </Button>
            </div>
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

          <form onSubmit={saveQuestionSets} className="mt-6 space-y-3">
            <h2 className="font-display text-2xl font-bold">Question sets</h2>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-4 border-ink/10 bg-cream/60 px-4 py-3">
              <div>
                <p className="font-bold">Continuous mode</p>
                <p className="text-sm font-semibold text-ink/60">
                  Play selected packs back-to-back; scores carry over.
                </p>
              </div>
              <Switch
                checked={questionMode === 'continuous'}
                disabled={!canEditSetup}
                onCheckedChange={(checked) => {
                  const nextMode = checked ? 'continuous' : 'single';
                  const current = questionForm.getValues('questionSetIds');
                  questionForm.setValue('mode', nextMode, { shouldValidate: true });
                  if (nextMode === 'single' && current.length > 1) {
                    questionForm.setValue('questionSetIds', [current[0]], {
                      shouldValidate: true,
                    });
                  }
                }}
              />
            </div>

            {questionMode === 'single' ? (
              <div className="space-y-1">
                <Label htmlFor="question-set">Question set</Label>
                <select
                  id="question-set"
                  className="flex h-12 w-full rounded-2xl border-4 border-ink/15 bg-white px-4 text-base font-bold text-ink shadow-pop-sm outline-none focus-visible:ring-4 focus-visible:ring-sun/70 disabled:opacity-50"
                  disabled={!canEditSetup}
                  value={selectedSets[0] ?? ''}
                  onChange={(e) =>
                    questionForm.setValue('questionSetIds', [e.target.value], {
                      shouldValidate: true,
                    })
                  }
                >
                  {state.questionSets.map((set) => (
                    <option key={set.id} value={set.id}>
                      {set.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Question sets (play order)</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {state.questionSets.map((set) => {
                    const checked = selectedSets.includes(set.id);
                    return (
                      <label
                        key={set.id}
                        className="flex cursor-pointer items-center gap-3 rounded-2xl border-4 border-ink/10 bg-white/80 px-3 py-2 font-bold shadow-pop-sm"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-grape"
                          disabled={!canEditSetup}
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? selectedSets.filter((id) => id !== set.id)
                              : [...selectedSets, set.id];
                            questionForm.setValue('questionSetIds', next, {
                              shouldValidate: true,
                            });
                          }}
                        />
                        {set.label}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {questionForm.formState.errors.questionSetIds ? (
              <p className="text-sm font-bold text-coral" role="alert">
                {questionForm.formState.errors.questionSetIds.message}
              </p>
            ) : (
              <p className="text-sm font-semibold text-ink/55">
                {canEditSetup
                  ? `${state.totalQuestions} questions loaded from the current selection.`
                  : 'Reset the game to change question sets.'}
              </p>
            )}
            <Button
              type="submit"
              variant="outline"
              disabled={!canEditSetup || !questionForm.formState.isValid}
            >
              Apply question sets
            </Button>
          </form>

          <form onSubmit={saveConfig} className="mt-6 grid gap-3 sm:grid-cols-2">
            <h2 className="font-display text-2xl font-bold sm:col-span-2">
              Game config
            </h2>
            <ConfigField
              label="Seconds per question (min 10)"
              error={configForm.formState.errors.timeLimitSeconds?.message}
              {...configForm.register('timeLimitSeconds')}
            />
            <ConfigField
              label="Default score"
              error={configForm.formState.errors.defaultScore?.message}
              {...configForm.register('defaultScore')}
            />
            <ConfigField
              label="Minimum score"
              error={configForm.formState.errors.minScore?.message}
              {...configForm.register('minScore')}
            />
            <ConfigField
              label="Scale (ms)"
              error={configForm.formState.errors.scaleMs?.message}
              {...configForm.register('scaleMs')}
            />
            <ConfigField
              label="Reveal answer delay (ms)"
              error={configForm.formState.errors.revealDurationMs?.message}
              {...configForm.register('revealDurationMs')}
            />
            <ConfigField
              label="Leaderboard delay (ms)"
              error={configForm.formState.errors.leaderboardDurationMs?.message}
              {...configForm.register('leaderboardDurationMs')}
            />
            <Button
              type="submit"
              className="sm:col-span-2"
              variant="outline"
              disabled={!configForm.formState.isValid}
            >
              Save config
            </Button>
          </form>
        </section>

        <section className="space-y-6">
          <div className="rounded-[2rem] border-4 border-white/60 bg-white/75 p-5 shadow-pop backdrop-blur">
            <Leaderboard
              entries={state.leaderboard}
              title="Live scores"
              paused={state.status === 'paused'}
              onKick={(id) => {
                const player = state.leaderboard.find((entry) => entry.id === id);
                setConfirm({
                  kind: 'kick',
                  playerId: id,
                  name: player?.name ?? 'this player',
                });
              }}
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
      <ConfirmDialog
        open={confirm != null}
        title={confirm?.kind === 'kick' ? `Kick ${confirm.name} from the quiz?` : 'Reset the quiz?'}
        description={
          confirm?.kind === 'kick'
            ? `${confirm.name} leaves the quiz and returns to the lobby. Their quiz score stays, and their login stays valid.`
            : 'This clears the current quiz and sends players back to the lobby.'
        }
        confirmLabel={confirm?.kind === 'kick' ? 'Kick' : 'Reset'}
        pending={confirming}
        onConfirm={() => {
          void (async () => {
            if (!confirm) {
              return;
            }
            setConfirming(true);
            if (confirm.kind === 'reset') {
              await run(reset, 'Game reset');
            } else {
              const result = (await kick(confirm.playerId)) as {
                ok?: boolean;
                error?: string;
              };
              setMessage(
                result?.ok === false
                  ? result.error ?? 'Could not kick player'
                  : `${confirm.name} was removed from the quiz`
              );
            }
            setConfirming(false);
            setConfirm(null);
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

function ConfigField({
  label,
  error,
  ...inputProps
}: {
  label: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" aria-invalid={Boolean(error)} {...inputProps} />
      {error ? (
        <p className="text-sm font-bold text-coral" role="alert">
          {error}
        </p>
      ) : null}
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
