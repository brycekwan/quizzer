import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameConfig, GameStateSnapshot, QuestionSetMode } from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';

export function useGameSocket(role: 'player' | 'admin' = 'player') {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<GameStateSnapshot | null>(null);
  const stored = readStoredSession();
  const [playerId, setPlayerId] = useState<string | null>(stored.playerId);
  const [playerName, setPlayerName] = useState<string | null>(stored.playerName);
  const [kicked, setKicked] = useState(false);
  const [gameReset, setGameReset] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinedQuizzer, setJoinedQuizzer] = useState(false);
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
      setJoinedQuizzer(false);
    };

    const ensureSessionThenJoinQuiz = () => {
      const id = playerIdRef.current;
      const name = playerNameRef.current;
      if (role !== 'player' || !id || !name) {
        return;
      }
      socket.emit(
        'session:login',
        { name, playerId: id },
        (loginResult: {
          ok: boolean;
          playerId?: string;
          name?: string;
          error?: string;
        }) => {
          if (!loginResult.ok || !loginResult.playerId || !loginResult.name) {
            clearSession();
            if (loginResult.error) {
              setError(loginResult.error);
            }
            return;
          }
          writeStoredSession(loginResult.playerId, loginResult.name);
          setPlayerId(loginResult.playerId);
          setPlayerName(loginResult.name);
          socket.emit(
            'player:join',
            { name: loginResult.name, playerId: loginResult.playerId },
            (joinResult: {
              ok: boolean;
              playerId?: string;
              name?: string;
              error?: string;
            }) => {
              if (joinResult.ok && joinResult.playerId && joinResult.name) {
                writeStoredSession(joinResult.playerId, joinResult.name);
                setPlayerId(joinResult.playerId);
                setPlayerName(joinResult.name);
                setJoinedQuizzer(true);
                setGameReset(false);
                setError(null);
              } else {
                setJoinedQuizzer(false);
                if (joinResult.error) {
                  setError(joinResult.error);
                }
              }
            }
          );
        }
      );
    };

    socket.on('connect', () => {
      setConnected(true);
      if (role === 'admin') {
        socket.emit('admin:subscribe');
      } else {
        ensureSessionThenJoinQuiz();
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('game:state', (snapshot: GameStateSnapshot) => {
      setState(snapshot);
    });
    socket.on('player:kicked', (payload?: { reason?: string }) => {
      if (!active) {
        return;
      }
      if (isSystemRemoval(payload)) {
        noteSystemRemoval();
        setPlayerId(null);
        setPlayerName(null);
        setJoinedQuizzer(false);
        return;
      }
      setKicked(true);
      clearSession();
    });
    socket.on('game:reset', () => {
      setJoinedQuizzer(false);
      setGameReset(true);
      setError('Game was reset — back to the menu.');
    });

    return () => {
      active = false;
      socket.disconnect();
      socketRef.current = null;
    };
  }, [role]);

  const api = useMemo(
    () => ({
      join: (name: string) =>
        new Promise<{ ok: true; playerId: string; name: string } | { ok: false; error: string }>(
          (resolve) => {
            socketRef.current?.emit(
              'session:login',
              { name, playerId: playerIdRef.current ?? undefined },
              (loginResult: {
                ok: boolean;
                playerId?: string;
                name?: string;
                error?: string;
              }) => {
                if (!loginResult.ok || !loginResult.playerId || !loginResult.name) {
                  const message = loginResult.error ?? 'Could not log in';
                  setError(message);
                  resolve({ ok: false, error: message });
                  return;
                }
                writeStoredSession(loginResult.playerId, loginResult.name);
                setPlayerId(loginResult.playerId);
                setPlayerName(loginResult.name);
                socketRef.current?.emit(
                  'player:join',
                  {
                    name: loginResult.name,
                    playerId: loginResult.playerId,
                  },
                  (joinResult: {
                    ok: boolean;
                    playerId?: string;
                    name?: string;
                    error?: string;
                  }) => {
                    if (joinResult.ok && joinResult.playerId && joinResult.name) {
                      writeStoredSession(joinResult.playerId, joinResult.name);
                      setPlayerId(joinResult.playerId);
                      setPlayerName(joinResult.name);
                      setJoinedQuizzer(true);
                      setKicked(false);
                      setGameReset(false);
                      setError(null);
                      resolve({
                        ok: true,
                        playerId: joinResult.playerId,
                        name: joinResult.name,
                      });
                    } else {
                      const message = joinResult.error ?? 'Could not join';
                      setError(message);
                      resolve({ ok: false, error: message });
                    }
                  }
                );
              }
            );
          }
        ),
      answer: (answerId: string) =>
        new Promise<{ ok: boolean; error?: string; points?: number }>((resolve) => {
          socketRef.current?.emit(
            'player:answer',
            { answerId, playerId: playerIdRef.current ?? undefined },
            resolve
          );
        }),
      start: (options?: { delayMinutes?: number }) =>
        new Promise((resolve) =>
          socketRef.current?.emit('admin:start', options ?? {}, resolve)
        ),
      pause: () =>
        new Promise((resolve) => socketRef.current?.emit('admin:pause', {}, resolve)),
      resume: () =>
        new Promise((resolve) => socketRef.current?.emit('admin:resume', {}, resolve)),
      reset: () =>
        new Promise((resolve) => socketRef.current?.emit('admin:reset', {}, resolve)),
      config: (partial: Partial<GameConfig>) =>
        new Promise((resolve) =>
          socketRef.current?.emit('admin:config', partial, resolve)
        ),
      kick: (id: string) =>
        new Promise((resolve) =>
          socketRef.current?.emit('admin:kick', { playerId: id }, resolve)
        ),
      setQuestionSets: (payload: {
        mode: QuestionSetMode;
        questionSetIds: string[];
      }) =>
        new Promise((resolve) =>
          socketRef.current?.emit('admin:questionSet', payload, resolve)
        ),
    }),
    []
  );

  return {
    connected,
    state,
    playerId,
    playerName,
    kicked,
    gameReset,
    joinedQuizzer,
    error,
    setError,
    ...api,
  };
}

export function useSyncedCountdown(
  endsAt: number | null | undefined,
  serverNow: number | null | undefined
) {
  const [remainingMs, setRemainingMs] = useState(0);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (serverNow) {
      offsetRef.current = serverNow - Date.now();
    }
  }, [serverNow]);

  useEffect(() => {
    if (!endsAt) {
      setRemainingMs(0);
      return;
    }

    const tick = () => {
      const now = Date.now() + offsetRef.current;
      setRemainingMs(Math.max(0, endsAt - now));
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [endsAt]);

  return remainingMs;
}
