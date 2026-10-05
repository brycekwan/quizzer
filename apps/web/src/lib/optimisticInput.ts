import type { Socket } from 'socket.io-client';

export interface InputAck {
  ok: boolean;
  error?: string;
  /** Never sent: refused on the client or the socket was offline. */
  dropped?: boolean;
}

export const DROPPED: InputAck = { ok: false, dropped: true };

const INPUT_TIMEOUT_MS = 5_000;

/** Emit with an ack that always settles, so a lost reply cannot stall the queue. */
export function emitInput<T extends InputAck>(
  socket: Socket | null,
  event: string,
  payload: unknown,
  done: (ack: T) => void
) {
  if (!socket?.connected) {
    done(DROPPED as T);
    return;
  }
  socket.timeout(INPUT_TIMEOUT_MS).emit(event, payload, (error: Error | null, ack: T) => {
    done(error ? ({ ok: false, error: 'The server did not answer' } as T) : ack);
  });
}

/**
 * Sends one input at a time. The server runs each event as its own task, so
 * inputs sent together could be applied out of order.
 */
export function createSerialSender() {
  let tail: Promise<unknown> = Promise.resolve();
  return function send<T>(start: (done: (ack: T) => void) => void): Promise<T> {
    const result = tail.then(() => new Promise<T>(start));
    tail = result.catch(() => undefined);
    return result;
  };
}

export interface OptimisticQueue<S, I> {
  /** Server state with every unconfirmed input replayed on top. */
  view(): S | null;
  /** Inputs not yet reflected in server state. */
  pending(): I[];
  receive(state: S): void;
  push(input: I): Promise<InputAck>;
  /** Drop every unconfirmed input, including ones still waiting to be sent. */
  reset(): void;
}

/**
 * The server answers an input with its ack and then the new state, so an
 * acknowledged input stays in the replay until that state arrives. A refused
 * input changed nothing on the server and leaves the replay at once.
 */
export function createOptimisticQueue<S, I>(options: {
  apply: (state: S, input: I) => S;
  send: (input: I, done: (ack: InputAck) => void) => void;
  onChange: () => void;
}): OptimisticQueue<S, I> {
  let server: S | null = null;
  let entries: { input: I; acked: boolean }[] = [];
  let generation = 0;
  let serial = createSerialSender();

  return {
    view() {
      if (server == null) {
        return null;
      }
      return entries.reduce<S>((state, entry) => options.apply(state, entry.input), server);
    },
    pending() {
      return entries.map((entry) => entry.input);
    },
    receive(state) {
      server = state;
      entries = entries.filter((entry) => !entry.acked);
      options.onChange();
    },
    push(input) {
      const entry = { input, acked: false };
      entries.push(entry);
      options.onChange();
      const sentIn = generation;
      return serial<InputAck>((done) => {
        if (sentIn !== generation) {
          done(DROPPED);
          return;
        }
        options.send(input, (ack) => {
          if (sentIn !== generation) {
            done(ack);
            return;
          }
          entry.acked = true;
          if (!ack?.ok) {
            entries = entries.filter((candidate) => candidate !== entry);
            options.onChange();
          }
          done(ack);
        });
      });
    },
    reset() {
      generation += 1;
      entries = [];
      serial = createSerialSender();
      options.onChange();
    },
  };
}
