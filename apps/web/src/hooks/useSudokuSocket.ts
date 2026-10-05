import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  SudokuAdminSnapshot,
  SudokuCellState,
  SudokuPlayerSnapshot,
} from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';
import { unlockHost } from '@/lib/hostSecret';
import {
  DROPPED,
  createOptimisticQueue,
  emitInput,
  type InputAck,
  type OptimisticQueue,
} from '@/lib/optimisticInput';

type Ack = InputAck & { correct?: boolean };

type SudokuInput =
  | { kind: 'commit' | 'draft'; row: number; col: number; value: number }
  | { kind: 'erase'; row: number; col: number }
  | { kind: 'hint'; row?: number; col?: number };

/**
 * Notes follow the server's rules exactly. A committed digit shows plain until
 * the server says whether it is right. Erase and hint wait for the server.
 */
function applySudokuInput(state: SudokuPlayerSnapshot, input: SudokuInput): SudokuPlayerSnapshot {
  if (state.completed || (input.kind !== 'commit' && input.kind !== 'draft')) {
    return state;
  }
  const cell = state.cells[input.row]?.[input.col];
  if (!cell || cell.given || cell.solved) {
    return state;
  }
  let next: SudokuCellState;
  if (input.kind === 'commit') {
    next = { ...cell, value: input.value, wrong: false };
  } else if (cell.wrongDrafts.includes(input.value)) {
    return state;
  } else if (cell.drafts.includes(input.value)) {
    next = { ...cell, drafts: cell.drafts.filter((digit) => digit !== input.value) };
  } else {
    next = { ...cell, drafts: [...cell.drafts, input.value].sort((a, b) => a - b) };
  }
  return {
    ...state,
    cells: state.cells.map((cells, row) =>
      row === input.row ? cells.map((entry, col) => (col === input.col ? next : entry)) : cells
    ),
  };
}

function sudokuEvent(input: SudokuInput): [string, unknown] {
  switch (input.kind) {
    case 'commit':
      return ['sudoku:commit', { row: input.row, col: input.col, value: input.value }];
    case 'draft':
      return ['sudoku:draft', { row: input.row, col: input.col, value: input.value }];
    case 'erase':
      return ['sudoku:erase', { row: input.row, col: input.col }];
    case 'hint':
      return [
        'sudoku:hint',
        input.row == null || input.col == null ? {} : { row: input.row, col: input.col },
      ];
  }
}

export function useSudokuSocket(
  role: 'player' | 'admin' = 'player',
  hostSecret: string | null = null,
  hostAttempt = 0
) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const stored = readStoredSession();
  const [playerId, setPlayerId] = useState<string | null>(stored.playerId);
  const [playerName, setPlayerName] = useState<string | null>(stored.playerName);
  const [playerState, setPlayerState] = useState<SudokuPlayerSnapshot | null>(
    null
  );
  const [adminState, setAdminState] = useState<SudokuAdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
  const [hostReady, setHostReady] = useState(role !== 'admin');
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;
  const queueRef = useRef<OptimisticQueue<SudokuPlayerSnapshot, SudokuInput> | null>(null);
  if (!queueRef.current) {
    const queue = createOptimisticQueue<SudokuPlayerSnapshot, SudokuInput>({
      apply: applySudokuInput,
      send: (input, done) => {
        const [event, payload] = sudokuEvent(input);
        emitInput(socketRef.current, event, payload, done);
      },
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
            socket.emit('sudoku:admin:subscribe', {}, (result: { ok?: boolean; error?: string }) => {
              if (!active) {
                return;
              }
              if (result?.ok === false) {
                setHostReady(false);
                setError(result.error ?? 'Could not subscribe as sudoku admin');
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
          socket.emit(
            'sudoku:subscribe',
            {},
            (result: { ok?: boolean; error?: string }) => {
              if (result?.ok === false) {
                setError(result.error ?? 'Could not join sudoku');
              }
            }
          );
        });
      }
    });
    socket.on('disconnect', () => {
      setConnected(false);
      queue?.reset();
    });
    socket.on('sudoku:state', (snapshot: SudokuPlayerSnapshot) => {
      queue?.receive(snapshot);
    });
    socket.on('sudoku:admin:state', (snapshot: SudokuAdminSnapshot) => {
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
        socket.emit('sudoku:pauseTimer', {});
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
    const input = (next: SudokuInput): Promise<Ack> =>
      queue ? queue.push(next) : Promise.resolve(DROPPED);
    return {
      commit: (row: number, col: number, value: number) =>
        input({ kind: 'commit', row, col, value }),
      toggleDraft: (row: number, col: number, value: number) =>
        input({ kind: 'draft', row, col, value }),
      erase: (row: number, col: number) => input({ kind: 'erase', row, col }),
      hint: (row?: number, col?: number) => input({ kind: 'hint', row, col }),
      pauseTimer: () => emit('sudoku:pauseTimer', {}),
      resumeTimer: () => emit('sudoku:resumeTimer', {}),
      reset: () => emit('sudoku:admin:reset', {}),
      resetPlayer: (id: string) => emit('sudoku:admin:resetPlayer', { playerId: id }),
      selectPuzzle: (puzzleId: string) =>
        emit('sudoku:admin:selectPuzzle', { puzzleId }),
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
    ...api,
  };
}
