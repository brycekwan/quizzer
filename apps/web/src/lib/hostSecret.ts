const HOST_SECRET_KEY = 'party.hostSecret';

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

export function unlockHost(
  socket: { emit: (event: string, payload: unknown, ack?: (result: UnlockAck) => void) => void },
  secret: string | null,
  onReady: () => void,
  onDenied: (message: string | null) => void
): void {
  if (!secret) {
    onDenied(null);
    return;
  }
  socket.emit('host:unlock', { secret }, (result) => {
    if (!result?.ok) {
      onDenied(result?.error ?? 'Incorrect host passphrase');
      return;
    }
    onReady();
  });
}
