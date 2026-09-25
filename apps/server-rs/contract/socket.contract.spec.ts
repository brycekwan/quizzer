import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SYSTEM_REMOVAL_REASON = 'Removed from the system by admin';

interface Ack {
  ok: boolean;
  error?: string;
  playerId?: string;
  name?: string;
  matched?: boolean;
}

interface GameState {
  phase: string | null;
  serverNow: number;
  currentQuestion: {
    answers: Array<{ correct?: boolean }>;
  } | null;
}

interface SystemState {
  players: Array<{ playerId: string; name: string }>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function binaryPath(): string {
  if (process.env.PARTY_SERVER_BIN) {
    return path.resolve(process.env.PARTY_SERVER_BIN);
  }
  return path.resolve('dist/target/server-rs/build/debug/party-server');
}

function emitAck(socket: Socket, event: string, payload: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`ack timeout: ${event}`)), 5_000);
    socket.emit(event, payload, (result: Ack) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`event timeout: ${event}`)), 5_000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('rust socket contract', () => {
  let child: ChildProcess;
  let url: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    const port = await freePort();
    url = `http://127.0.0.1:${port}`;
    child = spawn(binaryPath(), [], {
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        PORT: String(port),
        QUESTIONS_DIR: path.resolve('apps/server/questions'),
        CROSSWORD_PUZZLES_DIR: path.resolve('apps/server/crossword/puzzles'),
        WORDSEARCH_PUZZLES_DIR: path.resolve('apps/server/wordsearch/puzzles'),
        STATIC_DIR: path.resolve('dist/apps/web'),
      },
      stdio: 'pipe',
    });
    child.stderr?.on('data', () => undefined);
    await waitForHealth(url);
  });

  afterAll(async () => {
    for (const client of clients) {
      client.close();
    }
    if (child && !child.killed) {
      child.kill('SIGTERM');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  });

  function connect(): Socket {
    const client = io(url, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
    });
    clients.push(client);
    return client;
  }

  it('logs in, plays each game, and removes a player from the party', async () => {
    const player = connect();
    await waitFor(player, 'game:state');

    const login = await emitAck(player, 'session:login', { name: 'Maple' });
    expect(login.ok).toBe(true);

    const join = await emitAck(player, 'player:join', {
      name: login.name,
      playerId: login.playerId,
    });
    expect(join.ok).toBe(true);

    const duplicate = connect();
    await waitFor(duplicate, 'game:state');
    const rejected = await emitAck(duplicate, 'player:join', { name: 'maple' });
    expect(rejected.ok).toBe(false);

    const otherLogin = await emitAck(duplicate, 'session:login', { name: 'Scout' });
    expect(otherLogin.ok).toBe(true);
    const otherJoin = await emitAck(duplicate, 'player:join', {
      name: 'Scout',
      playerId: otherLogin.playerId,
    });
    expect(otherJoin.ok).toBe(true);

    const admin = connect();
    await waitFor(admin, 'game:state');
    admin.emit('admin:subscribe');

    const statePromise = waitFor<GameState>(player, 'game:state');
    const started = await emitAck(admin, 'admin:start', {});
    expect(started.ok).toBe(true);
    const state = await statePromise;
    expect(state.phase).toBe('answering');
    expect(state.currentQuestion?.answers.every((answer) => answer.correct === undefined)).toBe(
      true
    );
    expect(typeof state.serverNow).toBe('number');

    const crossword = await emitAck(player, 'crossword:subscribe', {});
    expect(crossword.ok).toBe(true);
    const letter = await emitAck(player, 'crossword:setLetter', {
      row: 0,
      col: 1,
      letter: 'A',
    });
    expect(letter.ok).toBe(true);

    const wordSearch = await emitAck(player, 'wordsearch:subscribe', {});
    expect(wordSearch.ok).toBe(true);
    const miss = await emitAck(player, 'wordsearch:submitSelection', {
      cells: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    });
    expect(miss).toEqual({ ok: true, matched: false });

    const boardPromise = waitFor<SystemState>(admin, 'system:admin:state');
    const subscribed = await emitAck(admin, 'system:admin:subscribe', {});
    expect(subscribed.ok).toBe(true);
    const board = await boardPromise;
    expect(board.players.map((entry) => entry.name)).toEqual(expect.arrayContaining(['Maple', 'Scout']));

    const kicked = waitFor<{ reason?: string }>(player, 'player:kicked');
    const removal = await emitAck(admin, 'system:admin:kick', { playerId: login.playerId });
    expect(removal.ok).toBe(true);
    expect(await kicked).toEqual({ reason: SYSTEM_REMOVAL_REASON });
  });
});

async function waitForHealth(url: string) {
  const deadline = Date.now() + 10_000;
  let lastError = 'server did not start';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = `health ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(lastError);
}
