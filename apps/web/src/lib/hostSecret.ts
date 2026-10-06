const HOST_SECRET_KEY = 'party.hostSecret';
const UNLOCK_TIMEOUT_MS = 5_000;

export function readHostSecret(): string | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  const value = sessionStorage.getItem(HOST_SECRET_KEY)?.trim();
  return value ? value : null;
}

export function writeHostSecret(secret: string): void {
  sessionStorage.setItem(HOST_SECRET_KEY, secret);
}

type UnlockAck = { ok?: boolean; error?: string };

type UnlockSocket = {
  connected: boolean;
  timeout: (ms: number) => {
    emit: (
      event: string,
      payload: unknown,
      ack: (error: Error | null, result: UnlockAck) => void
    ) => void;
  };
};

export function unlockHost(
  socket: UnlockSocket,
  secret: string | null,
  onReady: () => void,
  onDenied: (message: string | null) => void
): void {
  if (!secret) {
    onDenied(null);
    return;
  }
  if (!socket.connected) {
    onDenied('Not connected');
    return;
  }
  // A lost ack used to leave host pages on "Checking passphrase…" forever.
  socket.timeout(UNLOCK_TIMEOUT_MS).emit('host:unlock', { secret }, (error, result) => {
    if (error) {
      onDenied('The server did not answer');
      return;
    }
    if (!result?.ok) {
      onDenied(result?.error ?? 'Incorrect host passphrase');
      return;
    }
    onReady();
  });
}
