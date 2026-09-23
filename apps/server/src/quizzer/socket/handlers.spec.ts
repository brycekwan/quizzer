import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer as createHttpServer, type Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { GameEngine } from '../game/GameEngine';
import { registerSocketHandlers } from './handlers';
import type { GameStateSnapshot, Question } from '@party/shared';

const questions: Question[] = [
  {
    id: 'q1',
    question: 'Q1?',
    answers: [
      { id: 'a', text: 'A', correct: false },
      { id: 'b', text: 'B', correct: true },
      { id: 'c', text: 'C', correct: false },
      { id: 'd', text: 'D', correct: false },
    ],
  },
];

function waitForEvent<T>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => {
    socket.once(event, (payload: T) => resolve(payload));
  });
}

describe('socket handlers', () => {
  let io: Server;
  let httpServer: HttpServer;
  let url: string;
  let engine: GameEngine;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    httpServer = createHttpServer();
    io = new Server(httpServer, { cors: { origin: '*' } });
    engine = new GameEngine(questions);
    registerSocketHandlers(io, engine);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });
    const address = httpServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('No port');
    }
    url = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    for (const c of clients) {
      c.close();
    }
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  });

  function connect(): ClientSocket {
    const client = ioc(url, { transports: ['websocket'], forceNew: true });
    clients.push(client);
    return client;
  }

  it('logs in via session:login then joins the quiz', async () => {
    engine.reset();
    const player = connect();
    await waitForEvent(player, 'game:state');

    const login = await new Promise<{
      ok: boolean;
      playerId?: string;
      name?: string;
    }>((resolve) => {
      player.emit('session:login', { name: 'Maple' }, resolve);
    });
    expect(login.ok).toBe(true);

    const join = await new Promise<{ ok: boolean }>((resolve) => {
      player.emit(
        'player:join',
        { name: login.name, playerId: login.playerId },
        resolve
      );
    });
    expect(join.ok).toBe(true);
  });

  it('rejects duplicate join names and accepts unique ones', async () => {
    const a = connect();
    await waitForEvent(a, 'game:state');

    const joinA = await new Promise<{ ok: boolean }>((resolve) => {
      a.emit('player:join', { name: 'Rex' }, resolve);
    });
    expect(joinA.ok).toBe(true);

    const b = connect();
    await waitForEvent(b, 'game:state');
    const joinB = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      b.emit('player:join', { name: 'rex' }, resolve);
    });
    expect(joinB.ok).toBe(false);
  });

  it('does not include correct flags for players until reveal', async () => {
    engine.reset();
    const player = connect();
    await waitForEvent(player, 'game:state');
    await new Promise((resolve) => {
      player.emit('player:join', { name: 'Scout' }, resolve);
    });

    const statePromise = waitForEvent<GameStateSnapshot>(player, 'game:state');
    const startResult = await new Promise<{ ok: boolean }>((resolve) => {
      const admin = connect();
      admin.emit('admin:subscribe');
      admin.emit('admin:start', {}, resolve);
    });
    expect(startResult.ok).toBe(true);

    const state = await statePromise;
    expect(state.phase).toBe('answering');
    expect(
      state.currentQuestion?.answers.every((ans) => ans.correct === undefined)
    ).toBe(true);
    expect(typeof state.serverNow).toBe('number');
  });
});
