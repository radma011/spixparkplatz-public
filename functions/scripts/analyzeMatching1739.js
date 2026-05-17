/**
 * Analyze auto-matching for SPIX!1739: availabilities, open requests, blocking.
 * Run: cd functions && node scripts/analyzeMatching1739.js
 */
const admin = require('firebase-admin');
const {
  expandRecurringAvailability,
  overlaps,
  calculateOfferTimeWindow,
} = require('../lib/matchingCore');

const FACILITY = 'SPIX!1739';
const TOLERANCE_MS = 60 * 1000;

function normCode(c) {
  return String(c || '').trim().toUpperCase();
}

function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  return new Date(v);
}

function fmt(d) {
  if (!d) return '?';
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

function blocks(newStartsAt, newEndsAt, existingStartsAt, existingEndsAt) {
  const overlapStart = Math.max(newStartsAt, existingStartsAt);
  const overlapEnd = Math.min(newEndsAt, existingEndsAt);
  const overlapMs = overlapEnd - overlapStart;
  const timeGapStart = newStartsAt - existingEndsAt;
  const timeGapEnd = existingStartsAt - newEndsAt;
  if (timeGapStart >= -TOLERANCE_MS && timeGapStart <= TOLERANCE_MS) return { blocked: false, overlapMs, timeGapStart, timeGapEnd };
  if (timeGapEnd >= -TOLERANCE_MS && timeGapEnd <= TOLERANCE_MS) return { blocked: false, overlapMs, timeGapStart, timeGapEnd };
  if (overlapMs > TOLERANCE_MS) return { blocked: true, overlapMs, timeGapStart, timeGapEnd };
  return { blocked: false, overlapMs, timeGapStart, timeGapEnd };
}

async function isTimeWindowBlocked(db, spotId, facilityCode, from, until, excludeRequestId) {
  const reasons = [];
  const newStartsAt = from.getTime();
  const newEndsAt = until.getTime();
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const fulfilledSnap = await db
    .collection('parking_requests')
    .where('facilityCode', '==', facilityCode)
    .where('isFulfilled', '==', true)
    .where('until', '>', cutoff)
    .limit(100)
    .get();

  for (const doc of fulfilledSnap.docs) {
    if (excludeRequestId && doc.id === excludeRequestId) continue;
    const data = doc.data();
    if (data.isArchived === true) continue;
    if (!(data.fulfilledSpotIds || []).includes(spotId)) continue;
    const reqFrom = toDate(data.from);
    const reqUntil = toDate(data.until);
    if (!reqFrom || !reqUntil) continue;
    const r = blocks(newStartsAt, newEndsAt, reqFrom.getTime(), reqUntil.getTime());
    if (r.blocked) {
      reasons.push({
        type: 'fulfilled',
        id: doc.id,
        spotId,
        fulfilledFrom: fmt(reqFrom),
        fulfilledUntil: fmt(reqUntil),
        ...r,
      });
    }
  }

  const requestsSnap = await db
    .collection('parking_requests')
    .where('facilityCode', '==', facilityCode)
    .where('until', '>', cutoff)
    .limit(100)
    .get();

  for (const requestDoc of requestsSnap.docs) {
    if (excludeRequestId && requestDoc.id === excludeRequestId) continue;
    const requestData = requestDoc.data();
    if (requestData.isArchived === true || requestData.isFulfilled === true) continue;

    const offersSnap = await requestDoc.ref.collection('offers').where('spotId', '==', spotId).limit(10).get();

    for (const offerDoc of offersSnap.docs) {
      const offerData = offerDoc.data();
      const status = offerData.status || 'active';
      if (status !== 'active' && status !== 'accepted') continue;
      const offerFrom = toDate(offerData.from);
      const offerUntil = toDate(offerData.until);
      if (!offerFrom || !offerUntil) continue;
      const r = blocks(newStartsAt, newEndsAt, offerFrom.getTime(), offerUntil.getTime());
      if (r.blocked) {
        reasons.push({
          type: 'offer',
          requestId: requestDoc.id,
          offerId: offerDoc.id,
          status,
          offerFrom: fmt(offerFrom),
          offerUntil: fmt(offerUntil),
          ...r,
        });
      }
    }
  }

  return reasons;
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'parkplatz-38fe3' });
  }
  const db = admin.firestore();
  const facilityCode = normCode(FACILITY);

  console.log('\n=== SPIX!1739 Auto-Matching Analyse ===\n');

  const avSnap = await db.collection('parking_availabilities').get();
  const availabilities = avSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((av) => normCode(av.facilityCode) === facilityCode && av.isArchived !== true)
    .filter((av) => av.isActive === true || av.isActive === undefined);

  console.log(`Aktive Verfügbarkeiten: ${availabilities.length}`);
  for (const av of availabilities) {
    console.log(
      `  - ${av.id} spot=${av.spotId} user=${av.userId?.slice(0, 8)}… ` +
        `${fmt(toDate(av.from))} → ${fmt(toDate(av.until))}` +
        `${av.recurrence ? ' (recurring)' : ''} autoOffer=${av.autoOffer !== false}`,
    );
  }

  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const reqSnap = await db.collection('parking_requests').where('until', '>', cutoff).orderBy('until', 'asc').limit(200).get();

  const allInFacility = reqSnap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((r) => normCode(r.facilityCode) === facilityCode && r.isArchived !== true);

  const open = allInFacility.filter((r) => !r.isFulfilled && !r.offeredSpotId);
  const withOffer = allInFacility.filter((r) => !r.isFulfilled && r.offeredSpotId);
  const fulfilled = allInFacility.filter((r) => r.isFulfilled === true);

  console.log(`\nAnfragen (14d, ${facilityCode}): gesamt=${allInFacility.length} offen=${open.length} mit Angebot=${withOffer.length} erfüllt=${fulfilled.length}`);

  console.log('\n--- Offene Anfragen (kein offeredSpotId) ---');
  for (const r of open.slice(0, 15)) {
    console.log(
      `  ${r.id} ${fmt(toDate(r.from))} → ${fmt(toDate(r.until))} ` +
        `partial=${r.allowPartialOffers !== false} by=${r.requestedBy?.slice(0, 8)}…`,
    );
  }
  if (open.length > 15) console.log(`  … +${open.length - 15} weitere`);

  console.log('\n--- Erfüllte mit fulfilledSpotIds (Blocker-Kandidaten) ---');
  for (const r of fulfilled.slice(0, 20)) {
    const spots = (r.fulfilledSpotIds || []).join(',') || '—';
    console.log(`  ${r.id} spots=[${spots}] ${fmt(toDate(r.from))} → ${fmt(toDate(r.until))}`);
  }

  console.log('\n--- Matching-Simulation pro offener Anfrage ---\n');

  for (const reqData of open) {
    const requestFrom = toDate(reqData.from);
    const requestUntil = toDate(reqData.until);
    if (!requestFrom || !requestUntil) continue;

    console.log(`Anfrage ${reqData.id}`);
    console.log(`  Zeit: ${fmt(requestFrom)} → ${fmt(requestUntil)} (${Math.round((requestUntil - requestFrom) / 3600000)}h)`);
    console.log(`  Teilangebote: ${reqData.allowPartialOffers !== false}`);

    let anyCandidate = false;
    for (const availability of availabilities) {
      if (availability.userId === reqData.requestedBy) continue;

      const windows = expandRecurringAvailability(availability, requestFrom, requestUntil);
      for (const window of windows) {
        if (!overlaps(requestFrom, requestUntil, window.from, window.until)) continue;

        const allowPartial = reqData.allowPartialOffers !== false;
        if (!allowPartial) {
          if (window.from.getTime() > requestFrom.getTime() || window.until.getTime() < requestUntil.getTime()) {
            console.log(`  ⊗ Spot ${window.spotId} (${availability.id.slice(0, 8)}…): Fenster deckt Anfrage nicht vollständig ab`);
            continue;
          }
        }

        anyCandidate = true;
        const blockReasons = await isTimeWindowBlocked(
          db,
          window.spotId,
          facilityCode,
          window.from,
          window.until,
          reqData.id,
        );

        if (blockReasons.length === 0) {
          const ow = calculateOfferTimeWindow(requestFrom, requestUntil, window.from, window.until);
          console.log(
            `  ✓ Spot ${window.spotId} FREI → Offer ${fmt(ow.from)} → ${fmt(ow.until)} (av ${fmt(window.from)}–${fmt(window.until)})`,
          );
        } else {
          console.log(`  ✗ Spot ${window.spotId} BLOCKIERT (Prüfung über gesamte Anfrage ${fmt(requestFrom)}–${fmt(requestUntil)}):`);
          for (const br of blockReasons) {
            if (br.type === 'fulfilled') {
              console.log(`      fulfilled ${br.id}: ${br.fulfilledFrom}–${br.fulfilledUntil} overlapMs=${br.overlapMs}`);
            } else {
              console.log(
                `      offer ${br.offerId} in ${br.requestId} (${br.status}): ${br.offerFrom}–${br.offerUntil} overlapMs=${br.overlapMs}`,
              );
            }
          }
        }
      }
    }
    if (!anyCandidate) console.log('  (kein überlappendes Verfügbarkeitsfenster)');
    console.log('');
  }

  console.log('=== Ende ===\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
