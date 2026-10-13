#!/usr/bin/env node
// Open many Socket.IO clients against a party server, log in, hold, and report lag.
//
//   node scripts/load-test-connections.mjs --url https://quizzer.brycekwan.synology.me
//   node scripts/load-test-connections.mjs --url http://127.0.0.1:8080 --clients 50 --hold 45
//
// Env overrides: LOAD_TEST_URL, LOAD_TEST_CLIENTS, LOAD_TEST_HOLD_S

import { io } from 'socket.io-client';

const DEFAULT_URL = 'https://quizzer.brycekwan.synology.me';
const ACK_TIMEOUT_MS = 10_000;
const CONNECT_TIMEOUT_MS = 15_000;

function usage() {
  return [
    'Usage: node scripts/load-test-connections.mjs [options]',
    '',
    'Options:',
    '  --url <url>         Server base URL (default: synology host or LOAD_TEST_URL)',
    '  --clients <n>       Concurrent connections (default: 50)',
    '  --hold <seconds>    Keep connections open after login (default: 30)',
    '  --ramp-ms <ms>      Delay between starting each client (default: 50)',
    '  --activity <mode>   none | leaderboard (default: leaderboard)',
    '  --ping-every <s>    Re-emit activity while holding (default: 5; 0 = once)',
    '  --prefix <name>     Login name prefix, max keeps names ≤24 chars (default: LT)',
    '  --help              Show this help',
  ].join('\n');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseArgs(argv) {
  const flags = {
    url: process.env.LOAD_TEST_URL || DEFAULT_URL,
    clients: Number(process.env.LOAD_TEST_CLIENTS || 50),
    hold: Number(process.env.LOAD_TEST_HOLD_S || 30),
    rampMs: 50,
    activity: 'leaderboard',
    pingEvery: 5,
    prefix: 'LT',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    }
    const next = argv[i + 1];
    if (arg === '--url' && next) {
      flags.url = next;
      i += 1;
    } else if (arg === '--clients' && next) {
      flags.clients = Number(next);
      i += 1;
    } else if (arg === '--hold' && next) {
      flags.hold = Number(next);
      i += 1;
    } else if (arg === '--ramp-ms' && next) {
      flags.rampMs = Number(next);
      i += 1;
    } else if (arg === '--activity' && next) {
      flags.activity = next;
      i += 1;
    } else if (arg === '--ping-every' && next) {
      flags.pingEvery = Number(next);
      i += 1;
    } else if (arg === '--prefix' && next) {
      flags.prefix = next;
      i += 1;
    } else {
      fail(`Unknown or incomplete argument: ${arg}\n\n${usage()}`);
    }
  }

  if (!Number.isFinite(flags.clients) || flags.clients < 1) {
    fail('--clients must be a positive number');
  }
  if (!Number.isFinite(flags.hold) || flags.hold < 0) {
    fail('--hold must be a non-negative number of seconds');
  }
  if (!Number.isFinite(flags.rampMs) || flags.rampMs < 0) {
    fail('--ramp-ms must be a non-negative number');
  }
  if (!['none', 'leaderboard'].includes(flags.activity)) {
    fail('--activity must be none or leaderboard');
  }
  if (!Number.isFinite(flags.pingEvery) || flags.pingEvery < 0) {
    fail('--ping-every must be a non-negative number of seconds');
  }
  if (!flags.prefix || flags.prefix.length > 10) {
    fail('--prefix must be 1–10 characters');
  }

  return flags;
}

function percentile(sorted, p) {
  if (sorted.length === 0) {
    return null;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
  );
  return sorted[index];
}

function formatMs(value) {
  return value == null ? 'n/a' : `${value}ms`;
}

function summarize(label, samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    label,
    count: sorted.length,
    min: sorted[0] ?? null,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? null,
  };
}

function printSummary(stats) {
  console.log(
    [
      `${stats.label}: n=${stats.count}`,
      `min=${formatMs(stats.min)}`,
      `p50=${formatMs(stats.p50)}`,
      `p95=${formatMs(stats.p95)}`,
      `max=${formatMs(stats.max)}`,
    ].join('  ')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForConnect(socket) {
  if (socket.connected) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('connect timeout'));
    }, CONNECT_TIMEOUT_MS);

    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    };

    socket.once('connect', onConnect);
    socket.once('connect_error', onError);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`ack timeout: ${event}`));
    }, ACK_TIMEOUT_MS);
    socket.emit(event, payload, (result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function clientName(prefix, index) {
  // Keep ≤24 chars: prefix + "-" + zero-padded index.
  const body = `${prefix}-${String(index).padStart(3, '0')}`;
  return body.slice(0, 24);
}

async function runActivity(socket, mode) {
  if (mode === 'none') {
    return { ok: true, ms: 0 };
  }
  const started = Date.now();
  // leaderboard:subscribe has no ack; wait briefly for state as a lag signal.
  const state = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('leaderboard:state', onState);
      reject(new Error('leaderboard:state timeout'));
    }, ACK_TIMEOUT_MS);
    const onState = (payload) => {
      clearTimeout(timer);
      socket.off('leaderboard:state', onState);
      resolve(payload);
    };
    socket.once('leaderboard:state', onState);
    socket.emit('leaderboard:subscribe', {});
  });
  return { ok: Boolean(state), ms: Date.now() - started };
}

async function runClient(index, options, shared) {
  const name = clientName(options.prefix, index);
  const socket = io(options.url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: false,
    timeout: CONNECT_TIMEOUT_MS,
  });

  const record = {
    index,
    name,
    socket,
    connectMs: null,
    loginMs: null,
    activityMs: [],
    error: null,
    disconnectedDuringHold: false,
  };
  shared.clients.push(record);

  socket.on('disconnect', (reason) => {
    if (shared.holding) {
      record.disconnectedDuringHold = true;
      shared.holdDisconnects += 1;
      console.warn(`[${name}] disconnected during hold: ${reason}`);
    }
  });

  try {
    const connectStarted = Date.now();
    await waitForConnect(socket);
    record.connectMs = Date.now() - connectStarted;
    shared.connectSamples.push(record.connectMs);

    const loginStarted = Date.now();
    const login = await emitAck(socket, 'session:login', { name });
    record.loginMs = Date.now() - loginStarted;
    shared.loginSamples.push(record.loginMs);

    if (!login?.ok) {
      throw new Error(login?.error || 'login failed');
    }

    if (options.activity !== 'none') {
      const first = await runActivity(socket, options.activity);
      record.activityMs.push(first.ms);
      shared.activitySamples.push(first.ms);
    }

    console.log(
      `[${name}] connected ${record.connectMs}ms  login ${record.loginMs}ms` +
        (record.activityMs[0] != null ? `  activity ${record.activityMs[0]}ms` : '')
    );
  } catch (error) {
    record.error = error instanceof Error ? error.message : String(error);
    shared.errors.push({ name, error: record.error });
    console.error(`[${name}] FAILED: ${record.error}`);
    try {
      socket.close();
    } catch {
      // ignore
    }
  }

  return record;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const shared = {
    clients: [],
    connectSamples: [],
    loginSamples: [],
    activitySamples: [],
    errors: [],
    holdDisconnects: 0,
    holding: false,
  };

  console.log('Party connection load test');
  console.log(
    JSON.stringify(
      {
        url: options.url,
        clients: options.clients,
        holdSeconds: options.hold,
        rampMs: options.rampMs,
        activity: options.activity,
        pingEvery: options.pingEvery,
      },
      null,
      2
    )
  );
  console.log('');

  const startedAt = Date.now();
  const starters = [];
  for (let i = 1; i <= options.clients; i += 1) {
    starters.push(
      (async () => {
        await sleep((i - 1) * options.rampMs);
        return runClient(i, options, shared);
      })()
    );
  }
  await Promise.all(starters);

  const connectedOk = shared.clients.filter((c) => c.error == null && c.socket.connected);
  console.log('');
  console.log(
    `Ramp complete in ${Date.now() - startedAt}ms — ` +
      `${connectedOk.length}/${options.clients} live, ${shared.errors.length} errors`
  );

  if (connectedOk.length === 0) {
    printFinalReport(shared, options, startedAt);
    process.exit(1);
  }

  shared.holding = true;
  const holdMs = Math.round(options.hold * 1000);
  console.log(`Holding ${connectedOk.length} connections for ${options.hold}s…`);

  const pingTimers = [];
  if (options.activity !== 'none' && options.pingEvery > 0) {
    const intervalMs = Math.round(options.pingEvery * 1000);
    for (const client of connectedOk) {
      const timer = setInterval(() => {
        if (!client.socket.connected) {
          return;
        }
        const pingStarted = Date.now();
        const onState = () => {
          client.socket.off('leaderboard:state', onState);
          const ms = Date.now() - pingStarted;
          client.activityMs.push(ms);
          shared.activitySamples.push(ms);
        };
        client.socket.once('leaderboard:state', onState);
        client.socket.emit('leaderboard:subscribe', {});
        setTimeout(() => client.socket.off('leaderboard:state', onState), ACK_TIMEOUT_MS);
      }, intervalMs);
      pingTimers.push(timer);
    }
  }

  await sleep(holdMs);
  for (const timer of pingTimers) {
    clearInterval(timer);
  }
  shared.holding = false;

  for (const client of shared.clients) {
    try {
      client.socket.close();
    } catch {
      // ignore
    }
  }

  printFinalReport(shared, options, startedAt);

  const failedHard =
    shared.errors.length > 0 ||
    shared.holdDisconnects > 0 ||
    connectedOk.length < options.clients;
  process.exit(failedHard ? 1 : 0);
}

function printFinalReport(shared, options, startedAt) {
  console.log('');
  console.log('=== Results ===');
  console.log(`Duration: ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);
  console.log(
    `Success: ${shared.clients.filter((c) => c.error == null).length}/${options.clients}`
  );
  console.log(`Errors: ${shared.errors.length}`);
  console.log(`Disconnects during hold: ${shared.holdDisconnects}`);
  printSummary(summarize('Connect', shared.connectSamples));
  printSummary(summarize('Login ack', shared.loginSamples));
  if (options.activity !== 'none') {
    printSummary(summarize('Activity (leaderboard)', shared.activitySamples));
  }

  if (shared.errors.length > 0) {
    console.log('');
    console.log('First errors:');
    for (const entry of shared.errors.slice(0, 10)) {
      console.log(`  ${entry.name}: ${entry.error}`);
    }
  }

  const loginP95 = percentile(
    [...shared.loginSamples].sort((a, b) => a - b),
    95
  );
  console.log('');
  if (shared.errors.length === 0 && shared.holdDisconnects === 0) {
    if (loginP95 != null && loginP95 > 2000) {
      console.log(
        `Verdict: survived ${options.clients} clients, but login p95=${loginP95}ms suggests excess lag (>2s).`
      );
    } else {
      console.log(
        `Verdict: handled ${options.clients} concurrent logins without disconnects; lag looks acceptable.`
      );
    }
  } else {
    console.log(
      `Verdict: instability under ${options.clients} clients (errors and/or hold disconnects).`
    );
  }
  console.log(
    'Note: sessions stay on the server as disconnected until host system reset/kick; names are reclaimable.'
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
