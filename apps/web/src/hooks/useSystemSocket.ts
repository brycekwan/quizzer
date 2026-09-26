import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { SystemAdminSnapshot } from '@party/shared';

export function useSystemSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [adminState, setAdminState] = useState<SystemAdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit(
        'system:admin:subscribe',
        {},
        (result: { ok?: boolean }) => {
          if (result?.ok === false) {
            setError('Could not subscribe as system admin');
          }
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
  }, []);

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

  return { connected, adminState, error, setError, ...api };
}
