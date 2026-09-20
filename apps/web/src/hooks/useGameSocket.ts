import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameStateSnapshot } from '@quizzer/shared';

const PLAYER_ID_KEY = 'quizzer.playerId';
const PLAYER_NAME_KEY = 'quizzer.playerName';

export function useGameSocket(role: 'player' | 'admin' = 'player') {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<GameStateSnapshot | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(PLAYER_ID_KEY) : null
  );
  const [playerName, setPlayerName] = useState<string | null>(() =>
    typeof window !== 'undefined' ? localStorage.getItem(PLAYER_NAME_KEY) : null
  );
  const [kicked, setKicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

    const rejoinIfNeeded = () => {
      const id = playerIdRef.current;
      const name = playerNameRef.current;
      if (role !== 'player' || !id || !name) {
        return;
      }
      socket.emit(
        'player:join',
        { name, playerId: id },
        (result: { ok: boolean; playerId?: string; name?: string }) => {
          if (result.ok && result.playerId && result.name) {
            localStorage.setItem(PLAYER_ID_KEY, result.playerId);
            localStorage.setItem(PLAYER_NAME_KEY, result.name);
            setPlayerId(result.playerId);
            setPlayerName(result.name);
          }
        }
      );
    };

    socket.on('connect', () => {
      setConnected(true);
      if (role === 'admin') {
        socket.emit('admin:subscribe');
      } else {
        rejoinIfNeeded();
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('game:state', (snapshot: GameStateSnapshot) => {
      setState(snapshot);
    });
    socket.on('player:kicked', () => {
      setKicked(true);
      localStorage.removeItem(PLAYER_ID_KEY);
      localStorage.removeItem(PLAYER_NAME_KEY);
      setPlayerId(null);
      setPlayerName(null);
    });

    return () => {
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
              'player:join',
              { name, playerId: playerIdRef.current ?? undefined },
              (result: {
                ok: boolean;
                playerId?: string;
                name?: string;
                error?: string;
              }) => {
                if (result.ok && result.playerId && result.name) {
                  localStorage.setItem(PLAYER_ID_KEY, result.playerId);
                  localStorage.setItem(PLAYER_NAME_KEY, result.name);
                  setPlayerId(result.playerId);
                  setPlayerName(result.name);
                  setError(null);
                  resolve({
                    ok: true,
                    playerId: result.playerId,
                    name: result.name,
                  });
                } else {
                  setError(result.error ?? 'Could not join');
                  resolve({ ok: false, error: result.error ?? 'Could not join' });
                }
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
      start: () =>
        new Promise((resolve) => socketRef.current?.emit('admin:start', {}, resolve)),
      pause: () =>
        new Promise((resolve) => socketRef.current?.emit('admin:pause', {}, resolve)),
      resume: () =>
        new Promise((resolve) => socketRef.current?.emit('admin:resume', {}, resolve)),
      reset: () =>
        new Promise((resolve) => socketRef.current?.emit('admin:reset', {}, resolve)),
      config: (partial: Record<string, number>) =>
        new Promise((resolve) =>
          socketRef.current?.emit('admin:config', partial, resolve)
        ),
      kick: (id: string) =>
        new Promise((resolve) =>
          socketRef.current?.emit('admin:kick', { playerId: id }, resolve)
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
