import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { SystemAdminSnapshot } from '@party/shared';
import { unlockHost } from '@/lib/hostSecret';

export function useSystemSocket(hostSecret: string | null = null, hostAttempt = 0) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [adminState, setAdminState] = useState<SystemAdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(false);

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      unlockHost(
        socket,
        hostSecret,
        () => {
          socket.emit(
            'system:admin:subscribe',
            {},
            (result: { ok?: boolean; error?: string }) => {
              if (result?.ok === false) {
                setHostReady(false);
                setError(result.error ?? 'Could not subscribe as system admin');
                return;
              }
              setError(null);
              setHostReady(true);
            }
          );
        },
        (message) => {
          setHostReady(false);
          setError(message);
        }
      );
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('system:admin:state', (snapshot: SystemAdminSnapshot) => {
      setAdminState(snapshot);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [hostSecret, hostAttempt]);

  const api = useMemo(
    () => ({
      kick: (playerId: string) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit(
            'system:admin:kick',
            { playerId },
            resolve
          );
        }),
      resetAll: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socketRef.current?.emit('system:admin:reset', {}, resolve);
        }),
    }),
    []
  );

  return { connected, adminState, error, setError, hostReady, ...api };
}
