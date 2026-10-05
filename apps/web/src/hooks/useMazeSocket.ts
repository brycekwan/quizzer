import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  predictMazeMove,
  type MazeAdminSnapshot,
  type MazeDifficulty,
  type MazeDirection,
  type MazePlayerSnapshot,
  type MazePublicPuzzle,
  type MazeStateUpdate,
} from '@party/shared';
import {
  DROPPED,
  createOptimisticQueue,
  emitInput,
  type InputAck,
  type OptimisticQueue,
} from '@/lib/optimisticInput';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';
import { unlockHost } from '@/lib/hostSecret';

type Ack = InputAck;

type MazeInput = { kind: 'move'; direction: MazeDirection } | { kind: 'restart' };

export function useMazeSocket(
  role: 'player' | 'admin' = 'player',
  hostSecret: string | null = null,
  hostAttempt = 0
) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const stored = readStoredSession();
  const [playerId, setPlayerId] = useState<string | null>(stored.playerId);
  const [playerName, setPlayerName] = useState<string | null>(stored.playerName);
  const [playerState, setPlayerState] = useState<MazePlayerSnapshot | null>(null);
  const [adminState, setAdminState] = useState<MazeAdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [hostReady, setHostReady] = useState(role !== 'admin');
  /** Counts successful subscribes, so the page can resume the clock after a reconnect. */
  const [subscription, setSubscription] = useState(0);
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;
  const puzzleRef = useRef<MazePublicPuzzle | null>(null);
  const queueRef = useRef<OptimisticQueue<MazePlayerSnapshot, MazeInput> | null>(null);
  if (!queueRef.current) {
    const queue = createOptimisticQueue<MazePlayerSnapshot, MazeInput>({
      apply: (state, input) =>
        input.kind === 'move' ? (predictMazeMove(state, input.direction) ?? state) : state,
      send: (input, done) =>
        input.kind === 'move'
          ? emitInput(socketRef.current, 'maze:move', { direction: input.direction }, done)
          : emitInput(socketRef.current, 'maze:restart', {}, done),
      onChange: () => setPlayerState(queue.view()),
    });
    queueRef.current = queue;
  }

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
    let active = true;
    const queue = queueRef.current;
    puzzleRef.current = null;
    queue?.reset();

    const clearSession = () => {
      clearStoredSession();
      setPlayerId(null);
      setPlayerName(null);
    };

    const ensureSession = (then: () => void) => {
      const id = playerIdRef.current;
      const name = playerNameRef.current;
      if (!id || !name) {
        return;
      }
      socket.emit(
        'session:login',
        { name, playerId: id },
        (result: {
          ok: boolean;
          playerId?: string;
          name?: string;
          error?: string;
        }) => {
          if (!result.ok || !result.playerId || !result.name) {
            clearSession();
            setError(result.error ?? 'Session expired');
            return;
          }
          writeStoredSession(result.playerId, result.name);
          setPlayerId(result.playerId);
          setPlayerName(result.name);
          then();
        }
      );
    };

    socket.on('connect', () => {
      setConnected(true);
      if (role === 'admin') {
        unlockHost(
          socket,
          hostSecret,
          () => {
            if (!active) {
              return;
            }
            socket.emit('maze:admin:subscribe', {}, (result: { ok?: boolean; error?: string }) => {
              if (!active) {
                return;
              }
              if (result?.ok === false) {
                setHostReady(false);
                setError(result.error ?? 'Could not subscribe as maze admin');
                return;
              }
              setError(null);
              setHostReady(true);
            });
          },
          (message) => {
            if (!active) {
              return;
            }
            setHostReady(false);
            setError(message);
          }
        );
      } else {
        ensureSession(() => {
          socket.emit('maze:subscribe', {}, (result: { ok?: boolean; error?: string }) => {
            if (result?.ok === false) {
              setError(result.error ?? 'Could not join the maze');
              return;
            }
            setSubscription((count) => count + 1);
          });
        });
      }
    });
    socket.on('disconnect', () => {
      setConnected(false);
      puzzleRef.current = null;
      queue?.reset();
    });
    socket.on('maze:state', (update: MazeStateUpdate) => {
      const puzzle = update.puzzle ?? puzzleRef.current;
      if (!puzzle) {
        return;
      }
      puzzleRef.current = puzzle;
      queue?.receive({ ...update, puzzle });
    });
    socket.on('maze:admin:state', (snapshot: MazeAdminSnapshot) => {
      setAdminState(snapshot);
    });
    socket.on('player:kicked', (payload?: { reason?: string }) => {
      if (!active) {
        return;
      }
      if (isSystemRemoval(payload)) {
        noteSystemRemoval();
        setPlayerId(null);
        setPlayerName(null);
        return;
      }
      if (isQuizRemoval(payload)) {
        return;
      }
      setKicked(true);
      clearSession();
    });

    return () => {
      active = false;
      if (role === 'player') {
        socket.emit('maze:pauseTimer', {});
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, hostSecret, hostAttempt]);

  const api = useMemo(() => {
    const emit = (event: string, payload: unknown) =>
      new Promise<Ack>((resolve) => {
        socketRef.current?.emit(event, payload, resolve);
      });
    const queue = queueRef.current;
    return {
      ackIntro: () => emit('maze:ackIntro', {}),
      move: (direction: MazeDirection): Promise<Ack> => {
        const current = queue?.view();
        if (!queue || !current || !predictMazeMove(current, direction)) {
          return Promise.resolve(DROPPED);
        }
        return queue.push({ kind: 'move', direction });
      },
      restart: (): Promise<Ack> =>
        queue ? queue.push({ kind: 'restart' }) : Promise.resolve(DROPPED),
      pauseTimer: () => emit('maze:pauseTimer', {}),
      resumeTimer: () => emit('maze:resumeTimer', {}),
      reset: () => emit('maze:admin:reset', {}),
      resetPlayer: (id: string) => emit('maze:admin:resetPlayer', { playerId: id }),
      selectPuzzle: (difficulty: MazeDifficulty, puzzleId: string) =>
        emit('maze:admin:select', { difficulty, puzzleId }),
    };
  }, []);

  return {
    connected,
    playerId,
    playerName,
    playerState,
    adminState,
    error,
    kicked,
    setError,
    hostReady,
    subscription,
    ...api,
  };
}
