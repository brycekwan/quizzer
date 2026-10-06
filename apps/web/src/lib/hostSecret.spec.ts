import { describe, expect, it, vi } from 'vitest';
import { unlockHost } from './hostSecret';

function mockSocket(options: {
  connected?: boolean;
  reply?: { error: Error | null; result?: { ok?: boolean; error?: string } };
}) {
  const emit = vi.fn(
    (
      _event: string,
      _payload: unknown,
      ack: (error: Error | null, result: { ok?: boolean; error?: string }) => void
    ) => {
      if (options.reply) {
        ack(options.reply.error, options.reply.result ?? {});
      }
    }
  );
  return {
    connected: options.connected ?? true,
    timeout: vi.fn(() => ({ emit })),
    emit,
  };
}

describe('unlockHost', () => {
  it('denies when there is no secret', () => {
    const onReady = vi.fn();
    const onDenied = vi.fn();
    unlockHost(mockSocket({}), null, onReady, onDenied);
    expect(onDenied).toHaveBeenCalledWith(null);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('denies when the socket is offline', () => {
    const onReady = vi.fn();
    const onDenied = vi.fn();
    unlockHost(mockSocket({ connected: false }), 'secret', onReady, onDenied);
    expect(onDenied).toHaveBeenCalledWith('Not connected');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('calls onReady after a successful unlock', () => {
    const onReady = vi.fn();
    const onDenied = vi.fn();
    unlockHost(
      mockSocket({ reply: { error: null, result: { ok: true } } }),
      'secret',
      onReady,
      onDenied
    );
    expect(onReady).toHaveBeenCalled();
    expect(onDenied).not.toHaveBeenCalled();
  });

  it('surfaces a lost ack instead of hanging', () => {
    const onReady = vi.fn();
    const onDenied = vi.fn();
    unlockHost(
      mockSocket({ reply: { error: new Error('timeout') } }),
      'secret',
      onReady,
      onDenied
    );
    expect(onDenied).toHaveBeenCalledWith('The server did not answer');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('surfaces an incorrect passphrase', () => {
    const onReady = vi.fn();
    const onDenied = vi.fn();
    unlockHost(
      mockSocket({
        reply: { error: null, result: { ok: false, error: 'Incorrect host passphrase' } },
      }),
      'secret',
      onReady,
      onDenied
    );
    expect(onDenied).toHaveBeenCalledWith('Incorrect host passphrase');
    expect(onReady).not.toHaveBeenCalled();
  });
});
