import { useEffect, useMemo, useState } from 'react';
import type { PartyTheme, SystemAdminSnapshot } from '@party/shared';
import { unlockHost } from '@/lib/hostSecret';
import { usePartySocket } from '@/components/PartySocketProvider';
import { whenConnected } from '@/lib/partySocket';

export function useSystemSocket(hostSecret: string | null = null, hostAttempt = 0) {
  const { socket, connected } = usePartySocket();
  const [adminState, setAdminState] = useState<SystemAdminSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostReady, setHostReady] = useState(false);

  useEffect(() => {
    let active = true;

    const onReady = () => {
      unlockHost(
        socket,
        hostSecret,
        () => {
          if (!active) {
            return;
          }
          socket.emit(
            'system:admin:subscribe',
            {},
            (result: { ok?: boolean; error?: string }) => {
              if (!active) {
                return;
              }
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
          if (!active) {
            return;
          }
          setHostReady(false);
          setError(message);
        }
      );
    };

    const detachReady = whenConnected(socket, onReady);
    const onAdminState = (snapshot: SystemAdminSnapshot) => {
      setAdminState(snapshot);
    };
    socket.on('system:admin:state', onAdminState);

    return () => {
      active = false;
      detachReady();
      socket.off('system:admin:state', onAdminState);
    };
  }, [socket, hostSecret, hostAttempt]);

  const api = useMemo(
    () => ({
      kick: (playerId: string) =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socket.emit('system:admin:kick', { playerId }, resolve);
        }),
      resetAll: () =>
        new Promise<{ ok: boolean; error?: string }>((resolve) => {
          socket.emit('system:admin:reset', {}, resolve);
        }),
      setTheme: (theme: PartyTheme) =>
        new Promise<{ ok: boolean; error?: string; theme?: PartyTheme }>((resolve) => {
          socket.emit('system:admin:setTheme', { theme }, resolve);
        }),
    }),
    [socket]
  );

  return { connected, adminState, error, setError, hostReady, ...api };
}
