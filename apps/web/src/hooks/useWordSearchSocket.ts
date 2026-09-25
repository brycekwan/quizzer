import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  WordSearchAdminSnapshot,
  WordSearchPlayerSnapshot,
} from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';

export function useWordSearchSocket(role: 'player' | 'admin' = 'player') {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const stored = readStoredSession();
  const [playerId, setPlayerId] = useState<string | null>(stored.playerId);
  const [playerName, setPlayerName] = useState<string | null>(stored.playerName);
  const [playerState, setPlayerState] = useState<WordSearchPlayerSnapshot | null>(
    null
  );
  const [adminState, setAdminState] = useState<WordSearchAdminSnapshot | null>(
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
        socket.emit(
          'wordsearch:admin:subscribe',
          {},
          (result: { ok?: boolean }) => {
            if (result?.ok === false) {
              setError('Could not subscribe as word search admin');
            }
          }
        );
      } else {
        ensureSession(() => {
          socket.emit(
            'wordsearch:subscribe',
            {},
            (result: { ok?: boolean; error?: string }) => {
              if (result?.ok === false) {
                setError(result.error ?? 'Could not join word search');
              }
            }
          );
        });
      }
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('wordsearch:state', (snapshot: WordSearchPlayerSnapshot) => {
      setPlayerState(snapshot);
    });
    socket.on('wordsearch:admin:state', (snapshot: WordSearchAdminSnapshot) => {
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
      submitSelection: (cells: { row: number; col: number }[]) =>
        new Promise<{ ok: boolean; matched?: boolean; error?: string }>(
          (resolve) => {
            socketRef.current?.emit(
              'wordsearch:submitSelection',
              { cells },
              resolve
            );
          }
        ),
      reset: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('wordsearch:admin:reset', {}, resolve);
        }),
      resetPlayer: (playerId: string) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit(
            'wordsearch:admin:resetPlayer',
            { playerId },
            resolve
          );
        }),
      selectPuzzle: (puzzleId: string) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit(
            'wordsearch:admin:selectPuzzle',
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
