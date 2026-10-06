import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  WordSearchAdminSnapshot,
  WordSearchPlayerSnapshot,
} from '@party/shared';
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from '@/lib/sessionStorage';
import { isQuizRemoval } from '@/lib/quizRemoval';
import { isSystemRemoval, noteSystemRemoval } from '@/lib/systemRemoval';
import { unlockHost } from '@/lib/hostSecret';
import { usePartySocket } from '@/components/PartySocketProvider';
import { whenConnected } from '@/lib/partySocket';

export function useWordSearchSocket(
  role: 'player' | 'admin' = 'player',
  hostSecret: string | null = null,
  hostAttempt = 0
) {
  const { socket, connected } = usePartySocket();
  const socketRef = useRef(socket);
  socketRef.current = socket;
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
  const [hostReady, setHostReady] = useState(role !== 'admin');
  const playerIdRef = useRef(playerId);
  playerIdRef.current = playerId;
  const playerNameRef = useRef(playerName);
  playerNameRef.current = playerName;

  useEffect(() => {
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
          if (!active) {
            return;
          }
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

    const onReady = () => {
      if (role === 'admin') {
        unlockHost(
          socket,
          hostSecret,
          () => {
            if (!active) {
              return;
            }
            setError(null);
            setHostReady(true);
            socket.emit(
              'wordsearch:admin:subscribe',
              {},
              (result: { ok?: boolean; error?: string }) => {
                if (!active) {
                  return;
                }
                if (result?.ok === false) {
                  setHostReady(false);
                  setError(result.error ?? 'Could not subscribe as word search admin');
                }
              }
            );
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
            'wordsearch:subscribe',
            {},
            (result: { ok?: boolean; error?: string }) => {
              if (!active) {
                return;
              }
              if (result?.ok === false) {
                setError(result.error ?? 'Could not join word search');
              }
            }
          );
        });
      }
    };

    const detachReady = whenConnected(socket, onReady);
    const onPlayerState = (snapshot: WordSearchPlayerSnapshot) => {
      setPlayerState(snapshot);
    };
    const onAdminState = (snapshot: WordSearchAdminSnapshot) => {
      setAdminState(snapshot);
      setHostReady(true);
    };
    const onKicked = (payload?: { reason?: string }) => {
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
    };
    socket.on('wordsearch:state', onPlayerState);
    socket.on('wordsearch:admin:state', onAdminState);
    socket.on('player:kicked', onKicked);

    return () => {
      active = false;
      if (role === 'player') {
        socket.emit('wordsearch:pauseTimer', {});
      }
      detachReady();
      socket.off('wordsearch:state', onPlayerState);
      socket.off('wordsearch:admin:state', onAdminState);
      socket.off('player:kicked', onKicked);
    };
  }, [socket, role, hostSecret, hostAttempt]);

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
      pauseTimer: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('wordsearch:pauseTimer', {}, resolve);
        }),
      resumeTimer: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('wordsearch:resumeTimer', {}, resolve);
        }),
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
    hostReady,
    ...api,
  };
}
