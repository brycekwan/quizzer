import { z } from 'zod';
import {
  MAX_LEADERBOARD_DURATION_MS,
  MAX_REVEAL_DURATION_MS,
  MAX_SCHEDULE_DELAY_MINUTES,
  MIN_LEADERBOARD_DURATION_MS,
  MIN_REVEAL_DURATION_MS,
  MIN_SCHEDULE_DELAY_MINUTES,
  MIN_TIME_LIMIT_SECONDS,
} from '@party/shared';

const positiveInt = (message: string) =>
  z.coerce.number({ invalid_type_error: message }).int().finite();

export const adminConfigSchema = z
  .object({
    timeLimitSeconds: positiveInt('Enter seconds per question').min(
      MIN_TIME_LIMIT_SECONDS,
      `Must be at least ${MIN_TIME_LIMIT_SECONDS} seconds`
    ),
    defaultScore: positiveInt('Enter a default score').min(
      0,
      'Must be 0 or greater'
    ),
    minScore: positiveInt('Enter a minimum score').min(
      0,
      'Must be 0 or greater'
    ),
    scaleMs: positiveInt('Enter scale in milliseconds').min(
      1,
      'Must be at least 1 ms'
    ),
    revealDurationMs: positiveInt('Enter reveal delay in milliseconds')
      .min(
        MIN_REVEAL_DURATION_MS,
        `Must be at least ${MIN_REVEAL_DURATION_MS} ms`
      )
      .max(
        MAX_REVEAL_DURATION_MS,
        `Must be at most ${MAX_REVEAL_DURATION_MS} ms`
      ),
    leaderboardDurationMs: positiveInt('Enter leaderboard delay in milliseconds')
      .min(
        MIN_LEADERBOARD_DURATION_MS,
        `Must be at least ${MIN_LEADERBOARD_DURATION_MS} ms`
      )
      .max(
        MAX_LEADERBOARD_DURATION_MS,
        `Must be at most ${MAX_LEADERBOARD_DURATION_MS} ms`
      ),
  })
  .refine((data) => data.minScore <= data.defaultScore, {
    message: 'Minimum score cannot exceed default score',
    path: ['minScore'],
  });

export type AdminConfigFormValues = z.infer<typeof adminConfigSchema>;

export const scheduleStartSchema = z
  .object({
    scheduleEnabled: z.boolean(),
    delayMinutes: positiveInt('Enter delay in minutes')
      .min(
        MIN_SCHEDULE_DELAY_MINUTES,
        `Must be at least ${MIN_SCHEDULE_DELAY_MINUTES} minute`
      )
      .max(
        MAX_SCHEDULE_DELAY_MINUTES,
        `Must be at most ${MAX_SCHEDULE_DELAY_MINUTES} minutes`
      ),
  })
  .superRefine((data, ctx) => {
    if (!data.scheduleEnabled) {
      return;
    }
    if (
      !Number.isFinite(data.delayMinutes) ||
      data.delayMinutes < MIN_SCHEDULE_DELAY_MINUTES
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Enter ${MIN_SCHEDULE_DELAY_MINUTES}–${MAX_SCHEDULE_DELAY_MINUTES} minutes`,
        path: ['delayMinutes'],
      });
    }
  });

export type ScheduleStartFormValues = z.infer<typeof scheduleStartSchema>;

export const questionSetsSchema = z
  .object({
    mode: z.enum(['single', 'continuous']),
    questionSetIds: z.array(z.string().min(1)).min(1, 'Select at least one set'),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'single' && data.questionSetIds.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Pick exactly one question set',
        path: ['questionSetIds'],
      });
    }
    if (data.mode === 'continuous' && data.questionSetIds.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select one or more question sets',
        path: ['questionSetIds'],
      });
    }
  });

export type QuestionSetsFormValues = z.infer<typeof questionSetsSchema>;
