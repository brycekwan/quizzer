import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  CrosswordAdminSnapshot,
  CrosswordPlayerSnapshot,
} from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';

export function useCrosswordSocket(role: 'player' | 'admin' = 'player') {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const stored = readStoredSession();
  const [playerId, setPlayerId] = useState<string | null>(stored.playerId);
  const [playerName, setPlayerName] = useState<string | null>(stored.playerName);
  const [playerState, setPlayerState] = useState<CrosswordPlayerSnapshot | null>(
    null
  );
  const [adminState, setAdminState] = useState<CrosswordAdminSnapshot | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [kicked, setKicked] = useState(false);
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
        socket.emit('crossword:admin:subscribe', {}, (result: { ok?: boolean }) => {
          if (result?.ok === false) {
            setError('Could not subscribe as crossword admin');
          }
        });
      } else {
        ensureSession(() => {
          socket.emit('crossword:subscribe', {}, (result: { ok?: boolean; error?: string }) => {
            if (result?.ok === false) {
              setError(result.error ?? 'Could not join crossword');
            }
          });
        });
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('crossword:state', (snapshot: CrosswordPlayerSnapshot) => {
      setPlayerState(snapshot);
    });
    socket.on('crossword:admin:state', (snapshot: CrosswordAdminSnapshot) => {
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
  }, [role]);

  const api = useMemo(
    () => ({
      setLetter: (row: number, col: number, letter: string) =>
        new Promise<{
          ok: boolean;
          error?: string;
          correctWordIds?: string[];
        }>((resolve) => {
          socketRef.current?.emit(
            'crossword:setLetter',
            { row, col, letter },
            resolve
          );
        }),
      clearLetter: (row: number, col: number) =>
        new Promise<{
          ok: boolean;
          error?: string;
          correctWordIds?: string[];
        }>((resolve) => {
          socketRef.current?.emit(
            'crossword:clearLetter',
            { row, col },
            resolve
          );
        }),
      pauseTimer: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('crossword:pauseTimer', {}, resolve);
        }),
      resumeTimer: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('crossword:resumeTimer', {}, resolve);
        }),
      reset: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('crossword:admin:reset', {}, resolve);
        }),
      resetPlayer: (playerId: string) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit(
            'crossword:admin:resetPlayer',
            { playerId },
            resolve
          );
        }),
      selectPuzzle: (puzzleId: string) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit(
            'crossword:admin:selectPuzzle',
            { puzzleId },
            resolve
          );
        }),
    }),
    []
  );

  return {
    connected,
    playerId,
    playerName,
    playerState,
    adminState,
    error,
    kicked,
    setError,
    ...api,
  };
}
