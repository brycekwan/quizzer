import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import { GameEngine } from './quizzer/game/GameEngine';
import { SessionRegistry } from './session/SessionRegistry';
import { registerSocketHandlers } from './quizzer/socket/handlers';
import {
  listQuestionSets,
  loadDefaultQuestionSet,
  resolveQuestionsDir,
} from './quizzer/questions/questionSets';

export function createApp(staticDir?: string) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  const publicDir =
    staticDir ??
    (process.env.STATIC_DIR
      ? path.resolve(process.env.STATIC_DIR)
      : path.resolve(process.cwd(), 'dist/apps/web'));

  app.use(express.static(publicDir));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      next();
      return;
    }
    res.sendFile(path.join(publicDir, 'index.html'), (err) => {
      if (err) {
        res.status(404).send('Web client not built yet.');
      }
    });
  });

  return app;
}

export function createServer(options?: { staticDir?: string }) {
  const app = createApp(options?.staticDir);
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  const questionsDir = resolveQuestionsDir();
  const questionSets = listQuestionSets(questionsDir);
  if (questionSets.length === 0) {
    throw new Error(`No question sets found in ${questionsDir}`);
  }

  const { id, questions } = loadDefaultQuestionSet(questionsDir);
  const engine = new GameEngine(questions, {
    questionSetId: id,
    questionSetIds: [id],
    questionSetMode: 'single',
    questionSets,
  });
  const sessions = new SessionRegistry();
  registerSocketHandlers(io, engine, sessions);

  return { app, server, io, engine, sessions };
}
