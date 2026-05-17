/**
 * Cloud Functions adapter for availability matching.
 * Pure logic lives in matchingCore (built from src/shared/matching).
 */

const {
  expandRecurringAvailability,
  overlaps,
  calculateMatchScore,
  calculateOfferTimeWindow: coreCalculateOfferTimeWindow,
  rangesOverlapWithTolerance,
  BLOCK_TOLERANCE_MS,
  mergeIntervals,
  getFreeTimeWindowsFromBlocked,
} = require('./matchingCore');

function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  return new Date(v);
}

/**
 * Collect merged blocking intervals on a spot within [rangeFrom, rangeUntil].
 */
async function collectBlockingIntervals(
  admin,
  db,
  spotId,
  facilityCode,
  rangeFrom,
  rangeUntil,
  excludeRequestId,
  extraBlocks,
) {
  const avFrom = rangeFrom.getTime();
  const avUntil = rangeUntil.getTime();
  const raw = [];

  function addBlock(startMs, endMs) {
    const start = Math.max(startMs, avFrom);
    const end = Math.min(endMs, avUntil);
    if (end > start) raw.push({start, end});
  }

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

    const offersSnap = await doc.ref.collection('offers').where('spotId', '==', spotId).get();
    let matchedOffer = false;
    for (const offerDoc of offersSnap.docs) {
      const offerData = offerDoc.data();
      const st = offerData.status || 'active';
      if (st !== 'accepted') continue;
      const offerFrom = toDate(offerData.from);
      const offerUntil = toDate(offerData.until);
      if (!offerFrom || !offerUntil) continue;
      matchedOffer = true;
      addBlock(offerFrom.getTime(), offerUntil.getTime());
    }

    const reqFrom = toDate(data.from);
    const reqUntil = toDate(data.until);
    if (!matchedOffer && reqFrom && reqUntil) {
      addBlock(reqFrom.getTime(), reqUntil.getTime());
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
      if (status === 'withdrawn' || status === 'standby') continue;
      if (status !== 'active' && status !== 'accepted') continue;
      const offerFrom = toDate(offerData.from);
      const offerUntil = toDate(offerData.until);
      if (!offerFrom || !offerUntil) continue;
      addBlock(offerFrom.getTime(), offerUntil.getTime());
    }
  }

  if (extraBlocks) {
    for (const b of extraBlocks) {
      if (b && typeof b.start === 'number' && typeof b.end === 'number') {
        addBlock(b.start, b.end);
      }
    }
  }

  return mergeIntervals(raw);
}

/** @deprecated use collectBlockingIntervals; kept for scripts */
async function isTimeWindowBlocked(admin, db, spotId, facilityCode, from, until, excludeRequestId) {
  const windowStart = from.getTime();
  const windowEnd = until.getTime();
  const blocked = await collectBlockingIntervals(
    admin,
    db,
    spotId,
    facilityCode,
    from,
    until,
    excludeRequestId,
  );
  for (const b of blocked) {
    if (
      rangesOverlapWithTolerance(windowStart, windowEnd, b.start, b.end, BLOCK_TOLERANCE_MS) &&
      b.start <= windowStart + BLOCK_TOLERANCE_MS &&
      b.end >= windowEnd - BLOCK_TOLERANCE_MS
    ) {
      return true;
    }
  }
  return blocked.some((b) =>
    rangesOverlapWithTolerance(windowStart, windowEnd, b.start, b.end, BLOCK_TOLERANCE_MS),
  );
}

/**
 * Find best matching availability for a request (uses core for expand/overlap/score).
 * Splits each candidate window into spot-free sub-windows (aligns with calendar).
 */
async function findBestMatchingAvailability(admin, db, request, availabilities, options = {}) {
  const simulatedBlocks = options.simulatedBlocks || [];
  const requestFrom = request.from;
  const requestUntil = request.until;
  const allowPartialOffers = request.allowPartialOffers !== false;
  const reqFromDate = requestFrom.toDate ? requestFrom.toDate() : new Date(requestFrom);
  const reqUntilDate = requestUntil.toDate ? requestUntil.toDate() : new Date(requestUntil);
  const allWindows = [];

  for (const availability of availabilities) {
    if (availability.isActive === false || availability.isMatched === true) continue;
    if (availability.userId === request.requestedBy) continue;
    const avCode = String(availability.facilityCode || '').trim().toUpperCase();
    const reqCode = String(request.facilityCode || '').trim().toUpperCase();
    if (avCode !== reqCode) continue;

    const windows = expandRecurringAvailability(availability, requestFrom, requestUntil);

    for (const window of windows) {
      if (!overlaps(requestFrom, requestUntil, window.from, window.until)) continue;

      const extraBlocks = simulatedBlocks
        .filter((b) => String(b.spotId) === String(window.spotId))
        .map((b) => ({start: b.start, end: b.end}));
      const blocked = await collectBlockingIntervals(
        admin,
        db,
        window.spotId,
        request.facilityCode,
        window.from,
        window.until,
        request.id,
        extraBlocks.length > 0 ? extraBlocks : undefined,
      );
      const freeParts = getFreeTimeWindowsFromBlocked(window.from, window.until, blocked);

      for (const part of freeParts) {
        if (!allowPartialOffers) {
          if (part.from.getTime() > reqFromDate.getTime() || part.until.getTime() < reqUntilDate.getTime()) {
            continue;
          }
        }

        allWindows.push({
          ...window,
          from: part.from,
          until: part.until,
        });
      }
    }
  }

  if (allWindows.length === 0) return null;

  const scoredWindows = allWindows.map((window) => ({
    window,
    score: calculateMatchScore(requestFrom, requestUntil, window),
  }));
  scoredWindows.sort((a, b) => b.score - a.score);

  return scoredWindows[0].window;
}

/**
 * Dry-run helper: why a gap did not match (for rematch logging).
 */
async function diagnoseGapMatch(admin, db, request, gap, availabilities) {
  const lines = [];
  const requestFrom = admin.firestore.Timestamp.fromDate(gap.from);
  const requestUntil = admin.firestore.Timestamp.fromDate(gap.until);
  const gapReq = {...request, from: requestFrom, until: requestUntil};
  const candidates = availabilities.filter((a) => a.userId !== request.requestedBy);

  let overlappingAv = 0;
  for (const availability of candidates) {
    if (availability.isActive === false || availability.isMatched === true) continue;
    const windows = expandRecurringAvailability(availability, requestFrom, requestUntil);
    if (windows.length === 0) continue;
    overlappingAv += 1;

    for (const window of windows) {
      const blocked = await collectBlockingIntervals(
        admin,
        db,
        window.spotId,
        request.facilityCode,
        window.from,
        window.until,
        request.id,
      );
      const freeParts = getFreeTimeWindowsFromBlocked(window.from, window.until, blocked);
      if (freeParts.length === 0) {
        lines.push(`Spot ${window.spotId}: Verfügbarkeit überlappt, aber 0 freie Teilfenster (${blocked.length} Blocker)`);
      } else {
        lines.push(
          `Spot ${window.spotId}: ${freeParts.length} freies Teilfenster, autoOffer=${window.autoOffer !== false}`,
        );
      }
    }
  }

  if (overlappingAv === 0) {
    lines.unshift('Keine aktive Verfügbarkeit überlappt diese Lücke.');
  }

  const best = await findBestMatchingAvailability(admin, db, gapReq, availabilities);
  if (best) {
    lines.push(`Bestes Match: Spot ${best.spotId}`);
  }

  return lines;
}

function calculateOfferTimeWindow(requestFrom, requestUntil, windowFrom, windowUntil) {
  return coreCalculateOfferTimeWindow(requestFrom, requestUntil, windowFrom, windowUntil);
}

module.exports = {
  findBestMatchingAvailability,
  calculateOfferTimeWindow,
  diagnoseGapMatch,
  collectBlockingIntervals,
  isTimeWindowBlocked,
};
