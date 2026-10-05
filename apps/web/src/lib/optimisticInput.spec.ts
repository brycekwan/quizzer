import { describe, expect, it, vi } from 'vitest';
import { createOptimisticQueue, createSerialSender, type InputAck } from './optimisticInput';

function harness() {
  const sent: { input: string; reply: (ack: InputAck) => void }[] = [];
  const onChange = vi.fn();
  const queue = createOptimisticQueue<string, string>({
    apply: (state, input) => state + input,
    send: (input, done) => sent.push({ input, reply: done }),
    onChange,
  });
  return { queue, sent, onChange };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createOptimisticQueue', () => {
  it('shows inputs at once and sends them one at a time in order', async () => {
    const { queue, sent } = harness();
    queue.receive('');
    void queue.push('a');
    void queue.push('b');
    expect(queue.view()).toBe('ab');
    await flush();
    expect(sent.map((entry) => entry.input)).toEqual(['a']);
    sent[0].reply({ ok: true });
    await flush();
    expect(sent.map((entry) => entry.input)).toEqual(['a', 'b']);
  });

  it('keeps an acknowledged input until the state that includes it arrives', async () => {
    const { queue, sent } = harness();
    queue.receive('');
    void queue.push('a');
    void queue.push('b');
    await flush();
    sent[0].reply({ ok: true });
    expect(queue.view()).toBe('ab');
    queue.receive('a');
    expect(queue.view()).toBe('ab');
    expect(queue.pending()).toEqual(['b']);
  });

  it('drops a refused input from the replay', async () => {
    const { queue, sent } = harness();
    queue.receive('');
    const result = queue.push('x');
    await flush();
    sent[0].reply({ ok: false, error: 'No' });
    expect(await result).toEqual({ ok: false, error: 'No' });
    expect(queue.view()).toBe('');
  });

  it('drops queued inputs on reset', async () => {
    const { queue, sent } = harness();
    queue.receive('');
    void queue.push('a');
    const second = queue.push('b');
    await flush();
    queue.reset();
    sent[0].reply({ ok: true });
    expect(await second).toEqual({ ok: false, dropped: true });
    expect(sent).toHaveLength(1);
    expect(queue.view()).toBe('');
  });
});

describe('createSerialSender', () => {
  it('starts the next send only after the previous one settles', async () => {
    const send = createSerialSender();
    const order: string[] = [];
    let finishFirst: (value: string) => void = () => undefined;
    const first = send<string>((done) => {
      order.push('first');
      finishFirst = done;
    });
    const second = send<string>((done) => {
      order.push('second');
      done('two');
    });
    await flush();
    expect(order).toEqual(['first']);
    finishFirst('one');
    expect(await first).toBe('one');
    expect(await second).toBe('two');
    expect(order).toEqual(['first', 'second']);
  });
});
