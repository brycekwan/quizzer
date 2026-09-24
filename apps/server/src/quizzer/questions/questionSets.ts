import fs from 'fs';
import path from 'path';
import {
  validateQuestionsFile,
  type Question,
  type QuestionSetInfo,
  type QuestionsFile,
} from '@party/shared';

export function resolveQuestionsDir(): string {
  if (process.env.QUESTIONS_DIR) {
    return path.resolve(process.env.QUESTIONS_DIR);
  }

  // Dev (tsx from repo root) and bundled server next to a questions/ copy.
  const candidates = [
    path.resolve(process.cwd(), 'apps/server/questions'),
    path.resolve(process.cwd(), 'questions'),
    path.resolve(__dirname, 'questions'),
    path.resolve(__dirname, '../questions'),
    path.resolve(__dirname, '../../questions'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0];
}

/** Turn `cat-facts` into `Cat Facts` for the admin dropdown. */
export function labelFromQuestionSetId(id: string): string {
  return id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function listQuestionSets(dir = resolveQuestionsDir()): QuestionSetInfo[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => file.replace(/\.json$/i, ''))
    .sort((a, b) => a.localeCompare(b))
    .map((id) => ({ id, label: labelFromQuestionSetId(id) }));
}

export function loadQuestionSet(
  id: string,
  dir = resolveQuestionsDir()
): { ok: true; questions: Question[] } | { ok: false; error: string } {
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) {
    return { ok: false, error: 'Invalid question set id' };
  }

  const filePath = path.join(dir, `${id}.json`);
  if (!fs.existsSync(filePath)) {
    return { ok: false, error: `Question set "${id}" not found` };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return { ok: false, error: `Could not read question set "${id}"` };
  }

  const validationError = validateQuestionsFile(raw as QuestionsFile);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  return { ok: true, questions: (raw as QuestionsFile).questions };
}

/** Load one or more packs in order; question ids are prefixed to avoid collisions. */
export function loadQuestionSetsInOrder(
  ids: string[],
  dir = resolveQuestionsDir()
): { ok: true; questions: Question[] } | { ok: false; error: string } {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: 'At least one question set is required' };
  }

  const questions: Question[] = [];
  for (const id of ids) {
    const loaded = loadQuestionSet(id, dir);
    if (!loaded.ok) {
      return loaded;
    }
    for (const question of loaded.questions) {
      questions.push({
        ...question,
        id: `${id}:${question.id}`,
      });
    }
  }

  return { ok: true, questions };
}

export function loadDefaultQuestionSet(
  dir = resolveQuestionsDir()
): { id: string; questions: Question[] } {
  const sets = listQuestionSets(dir);
  if (sets.length === 0) {
    throw new Error(`No question sets found in ${dir}`);
  }

  const preferred =
    sets.find((s) => s.id === 'dog-facts') ?? sets[0];
  const loaded = loadQuestionSetsInOrder([preferred.id], dir);
  if (!loaded.ok) {
    throw new Error(loaded.error);
  }

  return { id: preferred.id, questions: loaded.questions };
}
