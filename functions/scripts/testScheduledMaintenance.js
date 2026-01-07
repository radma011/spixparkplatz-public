/**
 * Local test harness for the scheduled parking maintenance job.
 *
 * Runs WITHOUT Firebase emulator/network by simulating a minimal Firestore+Transaction surface
 * and capturing "push sends" + "writes".
 *
 * Usage:
 *   node scripts/testScheduledMaintenance.js
 */

const {Timestamp} = require('firebase-admin/firestore');

// Require after Timestamp so the module can load admin; we won't call initializeApp here.
const fn = require('../index.js');

function tsFromMs(ms) {
  return Timestamp.fromMillis(ms);
}

function fmtBerlin(ms) {
  const d = new Date(ms);
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(d);
}

function fmtBerlinTime(ms) {
  const d = new Date(ms);
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function msToMin(ms) {
  return Math.round(ms / 60000);
}

function makeDoc(id, data, store) {
  const ref = {
    id,
    async set(patch, opts) {
      store.writes.push({type: 'set', id, patch, opts});
      // Merge semantics (very simplified)
      const cur = store.docs.get(id) || {};
      const next = {...cur, ...patch};
      store.docs.set(id, next);
    },
  };

  return {
    id,
    ref,
    data() {
      return store.docs.get(id) || data || {};
    },
  };
}

function makeFakeDb(initialDocs) {
  const store = {
    docs: new Map(Object.entries(initialDocs)),
    writes: [],
    pushes: [],
  };

  const db = {
    _store: store,
    collection(name) {
      if (name !== 'parking_requests') throw new Error(`unexpected collection: ${name}`);
      const q = {
        _where: [],
        _orderBy: null,
        _limit: null,
        where(field, op, value) {
          this._where.push({field, op, value});
          return this;
        },
        orderBy(field, dir) {
          this._orderBy = {field, dir};
          return this;
        },
        limit(n) {
          this._limit = n;
          return this;
        },
        async get() {
          // Apply minimal filtering for until ranges only (what our function uses)
          let entries = Array.from(store.docs.entries()).map(([id, data]) => ({id, data}));

          for (const w of this._where) {
            const val = w.value;
            if (w.field !== 'until') continue;
            entries = entries.filter(({data}) => {
              const until = data.until;
              if (!until || !until.toMillis) return false;
              const ms = until.toMillis();
              const cmp = val.toMillis();
              if (w.op === '>=') return ms >= cmp;
              if (w.op === '<=') return ms <= cmp;
              throw new Error(`unsupported op: ${w.op}`);
            });
          }

          if (this._orderBy?.field === 'until') {
            entries.sort((a, b) => a.data.until.toMillis() - b.data.until.toMillis());
          }

          if (typeof this._limit === 'number') {
            entries = entries.slice(0, this._limit);
          }

          const docs = entries.map(({id, data}) => makeDoc(id, data, store));
          return {docs, empty: docs.length === 0};
        },
      };
      return q;
    },
    batch() {
      const ops = [];
      return {
        set(ref, patch, opts) {
          ops.push({ref, patch, opts});
        },
        async commit() {
          for (const op of ops) {
            await op.ref.set(op.patch, op.opts);
          }
        },
      };
    },
    async runTransaction(fnTx) {
      // naive transaction: we just provide get/set and run synchronously
      const tx = {
        async get(ref) {
          const data = store.docs.get(ref.id);
          return {exists: data != null, data: () => data};
        },
        set(ref, patch, opts) {
          store.writes.push({type: 'tx.set', id: ref.id, patch, opts});
          const cur = store.docs.get(ref.id) || {};
          store.docs.set(ref.id, {...cur, ...patch});
        },
      };
      return await fnTx(tx);
    },
  };

  return {db, store};
}

async function main() {
  // Allow pinning "now" for reproducible outputs:
  //   NOW_MS=1735558200000 node scripts/testScheduledMaintenance.js
  const nowMs = process.env.NOW_MS ? Number(process.env.NOW_MS) : Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('NOW_MS must be a number (milliseconds since epoch)');

  // Build sample docs:
  // - one fulfilled request due for reminder in 32 minutes
  // - one not fulfilled in window (should be skipped)
  // - one fulfilled but archived (should be skipped)
  // - one expired > 3h ago (should be auto-archived)
  const docs = {
    r1: {
      requestedBy: 'U1',
      offeredBy: 'U2',
      fulfilledByUserIds: ['U2'],
      fulfilledSpotIds: ['A1'],
      isFulfilled: true,
      isArchived: false,
      until: tsFromMs(nowMs + 32 * 60 * 1000),
      // new deterministic reminder field (normally set server-side at fulfillment)
      reminder30mAt: tsFromMs(nowMs + 2 * 60 * 1000),
    },
    r2: {
      requestedBy: 'U3',
      isFulfilled: false,
      isArchived: false,
      until: tsFromMs(nowMs + 33 * 60 * 1000),
    },
    r3: {
      requestedBy: 'U4',
      isFulfilled: true,
      isArchived: true,
      until: tsFromMs(nowMs + 34 * 60 * 1000),
    },
    r4: {
      requestedBy: 'U5',
      isFulfilled: false,
      isArchived: false,
      until: tsFromMs(nowMs - 4 * 60 * 60 * 1000),
    },
  };

  const {db, store} = makeFakeDb(docs);

  const sendPushToUser = async (uid, title, body, data) => {
    store.pushes.push({uid, title, body, data});
  };

  // Explain what should happen (human-friendly)
  const reminderWindowFromMs = nowMs - 60 * 1000;
  const reminderWindowToMs = nowMs + 6 * 60 * 1000;
  const fallbackUntilFromMs = nowMs + 30 * 60 * 1000;
  const fallbackUntilToMs = nowMs + 35 * 60 * 1000;

  console.log('NOW (ms):', nowMs);
  console.log('NOW (Berlin):', fmtBerlin(nowMs));
  console.log(
    'Scheduler reminder window (reminder30mAt):',
    fmtBerlin(reminderWindowFromMs),
    '→',
    fmtBerlin(reminderWindowToMs),
  );
  console.log(
    'Fallback window (until 30-35min):',
    fmtBerlin(fallbackUntilFromMs),
    '→',
    fmtBerlin(fallbackUntilToMs),
  );
  console.log('\nREQUESTS:');

  for (const [id, data] of Object.entries(docs)) {
    const untilMs = data.until?.toMillis ? data.until.toMillis() : null;
    const reminderAtMs = data.reminder30mAt?.toMillis ? data.reminder30mAt.toMillis() : null;
    const expectedReminderAtMs = untilMs != null ? untilMs - 30 * 60 * 1000 : null;

    const inReminderWindow =
      reminderAtMs != null && reminderAtMs >= reminderWindowFromMs && reminderAtMs <= reminderWindowToMs;
    const inFallbackWindow =
      untilMs != null && untilMs >= fallbackUntilFromMs && untilMs <= fallbackUntilToMs;

    const reasons = [];
    if (data.isArchived === true) reasons.push('archived');
    if (data.isFulfilled !== true) reasons.push('not-fulfilled');
    if (reminderAtMs == null) reasons.push('no-reminder30mAt');
    if (reminderAtMs != null && !inReminderWindow) reasons.push('reminder30mAt-not-in-window');
    if (inReminderWindow) reasons.push('matches-reminder30mAt-window');
    if (inFallbackWindow) reasons.push('matches-fallback-until-window');

    console.log(
      `- ${id}: until=${untilMs != null ? fmtBerlin(untilMs) : '—'} (${untilMs != null ? `+${msToMin(untilMs - nowMs)}m` : '—'})`,
    );
    console.log(
      `      reminder30mAt=${reminderAtMs != null ? fmtBerlin(reminderAtMs) : '—'} (${reminderAtMs != null ? `${msToMin(reminderAtMs - nowMs)}m` : '—'})`,
    );
    console.log(
      `      expected trigger (until-30m)=${expectedReminderAtMs != null ? fmtBerlin(expectedReminderAtMs) : '—'} (${expectedReminderAtMs != null ? `${msToMin(expectedReminderAtMs - nowMs)}m` : '—'})`,
    );
    console.log(
      `      state: fulfilled=${String(data.isFulfilled)} archived=${String(data.isArchived)}; notes: ${reasons.join(
        ', ',
      )}`,
    );
  }
  console.log('');

  const res = await fn._runScheduledParkingMaintenance({db, nowMs, sendPushToUser});

  console.log('RESULT:', res);
  console.log('PUSHES:', store.pushes);
  console.log('WRITES:', store.writes);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


