import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import { Server } from 'socket.io';
import {
  questionsData,
  validateQuestionsFile,
} from '@quizzer/shared';
import { GameEngine } from './game/GameEngine';
import { registerSocketHandlers } from './socket/handlers';

const validationError = validateQuestionsFile(questionsData);
if (validationError) {
  throw new Error(`Invalid questions.json: ${validationError}`);
}

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

  const engine = new GameEngine(questionsData.questions);
  registerSocketHandlers(io, engine);

  return { app, server, io, engine };
}
