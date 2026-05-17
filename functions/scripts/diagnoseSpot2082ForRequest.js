/**
 * Diagnose why spot 2082 does/does not match request jFqhKg0gG1yUS3Wk4X7c gap.
 * Run: cd functions && node scripts/diagnoseSpot2082ForRequest.js
 */
const admin = require('firebase-admin');
const {
  expandRecurringAvailability,
  getFreeTimeWindowsFromBlocked,
  calculateOfferTimeWindow,
  mergeIntervals,
} = require('../lib/matchingCore');
const {collectBlockingIntervals, findBestMatchingAvailability} = require('../lib/matching');

const REQUEST_ID = process.env.REQUEST_ID || 'jFqhKg0gG1yUS3Wk4X7c';
const SPOT = process.env.SPOT || '2082';
const FACILITY = 'SPIX!1739';

function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  return new Date(v);
}

function fmtBerlin(d) {
  if (!d) return '?';
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function fmtIso(d) {
  return d ? d.toISOString() : '?';
}

async function main() {
  if (!admin.apps.length) admin.initializeApp({projectId: 'parkplatz-38fe3'});
  const db = admin.firestore();

  const reqDoc = await db.collection('parking_requests').doc(REQUEST_ID).get();
  if (!reqDoc.exists) {
    console.error('Request not found:', REQUEST_ID);
    process.exit(1);
  }
  const req = {id: REQUEST_ID, ...reqDoc.data()};
  const reqFrom = toDate(req.from);
  const reqUntil = toDate(req.until);

  console.log('\n=== Diagnose', FACILITY, 'Request', REQUEST_ID, 'Spot', SPOT, '===\n');
  console.log('Anfrage (Berlin):', fmtBerlin(reqFrom), '–', fmtBerlin(reqUntil));
  console.log('Anfragender:', req.requestedBy, req.requestedByUsername || '');

  const offersSnap = await reqDoc.ref.collection('offers').get();
  console.log('\n--- Offers auf dieser Anfrage ---');
  for (const d of offersSnap.docs) {
    const o = d.data();
    console.log(
      `  ${d.id} status=${o.status || 'active'} spot=${o.spotId} ` +
        `${fmtBerlin(toDate(o.from))} – ${fmtBerlin(toDate(o.until))}`,
    );
  }

  const blocking = offersSnap.docs
    .map((d) => ({...d.data(), id: d.id}))
    .filter((o) => (o.status || 'active') === 'active' || (o.status || 'active') === 'accepted');
  const intervals = blocking
    .map((o) => {
      const f = toDate(o.from);
      const u = toDate(o.until);
      if (!f || !u) return null;
      return {
        start: Math.max(f.getTime(), reqFrom.getTime()),
        end: Math.min(u.getTime(), reqUntil.getTime()),
      };
    })
    .filter((i) => i && i.end > i.start);
  const merged = mergeIntervals(intervals);
  let cursor = reqFrom.getTime();
  const gaps = [];
  for (const b of merged) {
    if (b.start > cursor) gaps.push({from: new Date(cursor), until: new Date(b.start)});
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < reqUntil.getTime()) gaps.push({from: new Date(cursor), until: new Date(reqUntil)});

  console.log('\n--- Offene Lücken (Rematch) ---');
  gaps.forEach((g, i) => {
    console.log(`  Lücke ${i + 1}: ${fmtBerlin(g.from)} – ${fmtBerlin(g.until)}`);
  });

  const gap = gaps[0] || {from: reqFrom, until: reqUntil};
  if (gaps.length > 1) console.log('(Analyse nutzt erste Lücke; Rematch prüft alle)');

  console.log('\n--- Alle Offers auf Spot', SPOT, '(collection group) ---');
  const spotOffersSnap = await db.collectionGroup('offers').where('spotId', '==', SPOT).get();
  const spotOffers = [];
  for (const d of spotOffersSnap.docs) {
    const o = d.data();
    const parentId = d.ref.parent.parent?.id;
    let reqLabel = parentId;
    if (parentId) {
      const p = await db.collection('parking_requests').doc(parentId).get();
      if (p.exists) {
        reqLabel = `${parentId} (${p.data().requestedByUsername || p.data().requestedBy?.slice(0, 8)})`;
      }
    }
    const st = o.status || 'active';
    const row = {
      offerId: d.id,
      requestId: parentId,
      reqLabel,
      status: st,
      from: toDate(o.from),
      until: toDate(o.until),
    };
    spotOffers.push(row);
    const overlapsGap =
      row.from &&
      row.until &&
      row.from.getTime() < gap.until.getTime() &&
      row.until.getTime() > gap.from.getTime();
    console.log(
      `  ${d.id} @ ${reqLabel}\n` +
        `    status=${st} ${fmtBerlin(row.from)} – ${fmtBerlin(row.until)}` +
        (overlapsGap ? '  ** überlappt Lücke **' : '') +
        (st === 'withdrawn' || st === 'standby' ? ' (blockiert Matcher NICHT)' : ''),
    );
  }

  console.log('\n--- Verfügbarkeiten Spot', SPOT, '---');
  const avSnap = await db.collection('parking_availabilities').get();
  const avs = avSnap.docs
    .map((d) => ({id: d.id, ...d.data()}))
    .filter(
      (a) =>
        String(a.facilityCode || '')
          .trim()
          .toUpperCase() === FACILITY &&
        String(a.spotId) === SPOT &&
        a.isArchived !== true,
    );

  if (avs.length === 0) {
    console.log('  KEINE Verfügbarkeit für Spot', SPOT, '→ kein Auto-Match möglich');
  }

  const gapFromTs = admin.firestore.Timestamp.fromDate(gap.from);
  const gapUntilTs = admin.firestore.Timestamp.fromDate(gap.until);

  for (const av of avs) {
    const active = av.isActive === true || av.isActive === undefined;
    console.log(
      `\n  AV ${av.id} active=${active} isMatched=${!!av.isMatched} autoOffer=${av.autoOffer !== false}`,
    );
    console.log(
      `    ${fmtBerlin(toDate(av.from))} – ${fmtBerlin(toDate(av.until))}` +
        (av.recurrence ? ' (wiederkehrend)' : ''),
    );
    if (!active) {
      console.log('    → übersprungen (inaktiv)');
      continue;
    }
    if (av.userId === req.requestedBy) {
      console.log('    → übersprungen (eigener Spot des Anfragenden)');
      continue;
    }

    const windows = expandRecurringAvailability(av, gapFromTs, gapUntilTs);
    console.log(`    Fenster in Lücke: ${windows.length}`);
    for (const w of windows) {
      const blocked = await collectBlockingIntervals(
        admin,
        db,
        SPOT,
        FACILITY,
        w.from,
        w.until,
        REQUEST_ID,
      );
      const free = getFreeTimeWindowsFromBlocked(w.from, w.until, blocked);
      const ow = calculateOfferTimeWindow(gap.from, gap.until, w.from, w.until);
      console.log(`    Fenster ${fmtBerlin(w.from)} – ${fmtBerlin(w.until)}`);
      console.log(`      Blocker-Intervalle: ${blocked.length}, freie Teile: ${free.length}`);
      blocked.forEach((b) => {
        console.log(`        block ${fmtBerlin(new Date(b.start))} – ${fmtBerlin(new Date(b.end))}`);
      });
      free.forEach((f) => {
        console.log(
          `        FREI ${fmtBerlin(f.from)} – ${fmtBerlin(f.until)} → Offer ${fmtBerlin(ow.from)} – ${fmtBerlin(ow.until)}`,
        );
      });
    }
  }

  const allAv = avSnap.docs
    .map((d) => ({id: d.id, ...d.data()}))
    .filter(
      (a) =>
        String(a.facilityCode || '')
          .trim()
          .toUpperCase() === FACILITY &&
        a.isArchived !== true &&
        (a.isActive === true || a.isActive === undefined),
    );

  const gapReq = {
    id: REQUEST_ID,
    requestedBy: req.requestedBy,
    facilityCode: FACILITY,
    from: gapFromTs,
    until: gapUntilTs,
    allowPartialOffers: req.allowPartialOffers !== false,
  };
  const best = await findBestMatchingAvailability(admin, db, gapReq, allAv);
  console.log('\n--- Ergebnis findBestMatchingAvailability (Lücke) ---');
  console.log(best ? `  Match: Spot ${best.spotId} ${fmtBerlin(best.from)} – ${fmtBerlin(best.until)}` : '  Kein Match');

  console.log('\n=== Ende ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
