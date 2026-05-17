/**
 * Detailed match diagnosis for one request (+ optional spot).
 */

const {
  expandRecurringAvailability,
  getFreeTimeWindowsFromBlocked,
  calculateOfferTimeWindow,
  mergeIntervals,
} = require('./matchingCore');
const {collectBlockingIntervals, findBestMatchingAvailability} = require('./matching');
const {getUncoveredGaps} = require('./rematchFacility');

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

/** Avoid collection-group index: scan facility requests and query offers per request. */
async function loadOffersOnSpotViaRequests(admin, db, facilityCode, spotId) {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const seen = new Set();
  const rows = [];

  async function scan(querySnap) {
    for (const doc of querySnap.docs) {
      if (seen.has(doc.id)) continue;
      seen.add(doc.id);
      const reqData = doc.data();
      if (reqData.isArchived === true) continue;
      const offersSnap = await doc.ref.collection('offers').where('spotId', '==', String(spotId)).get();
      for (const d of offersSnap.docs) {
        rows.push({offerDoc: d, requestId: doc.id, requestData: reqData});
      }
    }
  }

  const openSnap = await db
    .collection('parking_requests')
    .where('facilityCode', '==', facilityCode)
    .where('until', '>', cutoff)
    .limit(150)
    .get();
  await scan(openSnap);

  const fulfilledSnap = await db
    .collection('parking_requests')
    .where('facilityCode', '==', facilityCode)
    .where('isFulfilled', '==', true)
    .where('until', '>', cutoff)
    .limit(100)
    .get();
  await scan(fulfilledSnap);

  return rows;
}

async function runDiagnoseParkingMatch(admin, db, opts) {
  const {requestId, spotId, facilityCode: facilityIn} = opts;
  const lines = [];

  const reqDoc = await db.collection('parking_requests').doc(requestId).get();
  if (!reqDoc.exists) {
    return {lines: [`Anfrage ${requestId} nicht gefunden.`]};
  }
  const reqData = {id: requestId, ...reqDoc.data()};
  const facilityCode = (facilityIn || reqData.facilityCode || '').trim().toUpperCase();
  const reqFrom = toDate(reqData.from);
  const reqUntil = toDate(reqData.until);

  lines.push(`Anfrage ${requestId} (${reqData.requestedByUsername || reqData.requestedBy || '?'})`);
  lines.push(`Zeit Berlin: ${fmtBerlin(reqFrom)} – ${fmtBerlin(reqUntil)}`);
  lines.push(`Facility: ${facilityCode} | isFulfilled=${!!reqData.isFulfilled} | offeredSpotId=${reqData.offeredSpotId || '—'}`);

  const offersSnap = await reqDoc.ref.collection('offers').get();
  lines.push('Offers auf dieser Anfrage:');
  if (offersSnap.empty) lines.push('  (keine)');
  for (const d of offersSnap.docs) {
    const o = d.data();
    lines.push(
      `  ${d.id} status=${o.status || 'active'} spot=${o.spotId} ${fmtBerlin(toDate(o.from))}–${fmtBerlin(toDate(o.until))}`,
    );
  }

  const offers = offersSnap.docs.map((d) => ({id: d.id, ...d.data()}));
  const gaps = getUncoveredGaps(reqFrom, reqUntil, offers);
  lines.push(`Offene Lücken (${gaps.length}):`);
  gaps.forEach((g, i) => lines.push(`  ${i + 1}. ${fmtBerlin(g.from)} – ${fmtBerlin(g.until)}`));

  if (spotId) {
    lines.push('');
    lines.push(`=== Spot ${spotId} (Offers, ohne archivierte Anfragen) ===`);
    const spotRows = await loadOffersOnSpotViaRequests(admin, db, facilityCode, spotId);
    if (spotRows.length === 0) {
      lines.push('  Keine Offer-Dokumente auf diesem Spot (in den letzten 14 Tagen).');
    }
    for (const {offerDoc: d, requestId: parentId, requestData: pData} of spotRows) {
      const o = d.data();
      const st = o.status || 'active';
      const label = pData?.requestedByUsername || parentId;
      const blocksMatcher = st === 'active' || st === 'accepted';
      lines.push(
        `  ${d.id} @ ${label} status=${st}${blocksMatcher ? ' → BLOCKIERT Matcher' : ' → blockiert NICHT'}`,
      );
      lines.push(`    ${fmtBerlin(toDate(o.from))} – ${fmtBerlin(toDate(o.until))}`);
    }
  }

  const avSnap = await db.collection('parking_availabilities').get();
  const allAv = avSnap.docs
    .map((d) => ({id: d.id, ...d.data()}))
    .filter(
      (a) =>
        String(a.facilityCode || '')
          .trim()
          .toUpperCase() === facilityCode &&
        a.isArchived !== true &&
        (a.isActive === true || a.isActive === undefined),
    );

  lines.push('');
  lines.push(`Aktive Verfügbarkeiten in ${facilityCode}: ${allAv.length}`);
  const avsForSpot = spotId ? allAv.filter((a) => String(a.spotId) === String(spotId)) : allAv;

  for (const gap of gaps.length ? gaps : [{from: reqFrom, until: reqUntil}]) {
    lines.push('');
    lines.push(`--- Lücke ${fmtBerlin(gap.from)} – ${fmtBerlin(gap.until)} ---`);
    const gapFromTs = admin.firestore.Timestamp.fromDate(gap.from);
    const gapUntilTs = admin.firestore.Timestamp.fromDate(gap.until);
    const gapReq = {
      id: requestId,
      requestedBy: reqData.requestedBy,
      facilityCode,
      from: gapFromTs,
      until: gapUntilTs,
      allowPartialOffers: reqData.allowPartialOffers !== false,
    };

    const best = await findBestMatchingAvailability(
      admin,
      db,
      gapReq,
      allAv.filter((a) => a.userId !== reqData.requestedBy),
    );
    lines.push(best ? `Bestes Match: Spot ${best.spotId} ${fmtBerlin(best.from)}–${fmtBerlin(best.until)}` : 'Bestes Match: keins');

    for (const av of avsForSpot) {
      if (av.userId === reqData.requestedBy) {
        lines.push(`Spot ${av.spotId} AV ${av.id.slice(0, 8)}: eigener User → kein Auto-Offer`);
        continue;
      }
      const windows = expandRecurringAvailability(av, gapFromTs, gapUntilTs);
      if (windows.length === 0) {
        lines.push(
          `Spot ${av.spotId} AV ${av.id.slice(0, 8)}: kein Fenster in Lücke (AV ${fmtBerlin(toDate(av.from))}–${fmtBerlin(toDate(av.until))})`,
        );
        continue;
      }
      for (const w of windows) {
        const blocked = await collectBlockingIntervals(
          admin,
          db,
          w.spotId,
          facilityCode,
          w.from,
          w.until,
          requestId,
        );
        const free = getFreeTimeWindowsFromBlocked(w.from, w.until, blocked);
        lines.push(
          `Spot ${w.spotId}: Fenster ${fmtBerlin(w.from)}–${fmtBerlin(w.until)} | ${free.length} frei, ${blocked.length} Blocker`,
        );
        blocked.forEach((b) =>
          lines.push(`  block ${fmtBerlin(new Date(b.start))}–${fmtBerlin(new Date(b.end))}`),
        );
        free.forEach((f) => {
          const ow = calculateOfferTimeWindow(gap.from, gap.until, f.from, f.until);
          lines.push(`  FREI ${fmtBerlin(f.from)}–${fmtBerlin(f.until)} → Offer ${fmtBerlin(ow.from)}–${fmtBerlin(ow.until)}`);
        });
      }
    }
  }

  return {requestId, spotId: spotId || null, facilityCode, lines};
}

module.exports = {runDiagnoseParkingMatch};
