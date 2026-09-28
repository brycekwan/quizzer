import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { SudokuAdminSnapshot, SudokuPlayerSnapshot } from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';
import { unlockHost } from '@/lib/hostSecret';

type Ack = { ok: boolean; error?: string; correct?: boolean };

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

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;
    let active = true;

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
    socket.on('disconnect', () => setConnected(false));
    socket.on('sudoku:state', (snapshot: SudokuPlayerSnapshot) => {
      setPlayerState(snapshot);
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
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role, hostSecret, hostAttempt]);

  const api = useMemo(() => {
    const emit = (event: string, payload: unknown) =>
      new Promise<Ack>((resolve) => {
        socketRef.current?.emit(event, payload, resolve);
      });
    return {
      commit: (row: number, col: number, value: number) =>
        emit('sudoku:commit', { row, col, value }),
      toggleDraft: (row: number, col: number, value: number) =>
        emit('sudoku:draft', { row, col, value }),
      erase: (row: number, col: number) => emit('sudoku:erase', { row, col }),
      hint: (row?: number, col?: number) =>
        emit('sudoku:hint', row == null || col == null ? {} : { row, col }),
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
