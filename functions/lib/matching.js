/**
 * Cloud Functions adapter for availability matching.
 * Pure logic lives in matchingCore (built from src/shared/matching).
 * This file only implements Firestore-specific blocking and orchestrates findBestMatchingAvailability.
 */

const {
  expandRecurringAvailability,
  overlaps,
  calculateMatchScore,
  calculateOfferTimeWindow: coreCalculateOfferTimeWindow,
} = require('./matchingCore');

const ONE_MINUTE_MS = 60 * 1000;
const TOLERANCE_MS = ONE_MINUTE_MS;

/**
 * Check if spot is blocked by fulfilled requests and active/accepted offers.
 * Uses 1-minute tolerance: booking ending at 18:00 allows next to start at 18:00.
 */
async function isTimeWindowBlocked(admin, db, spotId, facilityCode, from, until, excludeRequestId) {
  const newStartsAt = from.getTime();
  const newEndsAt = until.getTime();

  function blocks(existingStartsAt, existingEndsAt, logContext) {
    const overlapStart = Math.max(newStartsAt, existingStartsAt);
    const overlapEnd = Math.min(newEndsAt, existingEndsAt);
    const overlapMs = overlapEnd - overlapStart;
    const timeGapStart = newStartsAt - existingEndsAt;
    const timeGapEnd = existingStartsAt - newEndsAt;
    if (timeGapStart >= -TOLERANCE_MS && timeGapStart <= TOLERANCE_MS) return false;
    if (timeGapEnd >= -TOLERANCE_MS && timeGapEnd <= TOLERANCE_MS) return false;
    if (overlapMs > TOLERANCE_MS) {
      console.log('[isTimeWindowBlocked] Blocked:', logContext, { overlapMs, timeGapStart, timeGapEnd });
      return true;
    }
    return false;
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
    const reqFrom = data.from?.toDate ? data.from.toDate() : null;
    const reqUntil = data.until?.toDate ? data.until.toDate() : null;
    if (!reqFrom || !reqUntil) continue;
    if (blocks(reqFrom.getTime(), reqUntil.getTime(), `fulfilled request ${doc.id}`)) return true;
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

    const offersSnap = await requestDoc.ref
      .collection('offers')
      .where('spotId', '==', spotId)
      .limit(10)
      .get();

    for (const offerDoc of offersSnap.docs) {
      const offerData = offerDoc.data();
      const status = offerData.status || 'active';
      if (status !== 'active' && status !== 'accepted') continue;
      const offerFrom = offerData.from?.toDate ? offerData.from.toDate() : null;
      const offerUntil = offerData.until?.toDate ? offerData.until.toDate() : null;
      if (!offerFrom || !offerUntil) continue;
      if (
        blocks(
          offerFrom.getTime(),
          offerUntil.getTime(),
          `offer ${offerDoc.id} in request ${requestDoc.id}`,
        )
      )
        return true;
    }
  }

  return false;
}

/**
 * Find best matching availability for a request (uses core for expand/overlap/score).
 * Checks blocking for the REQUEST window so partial availability works.
 */
async function findBestMatchingAvailability(admin, db, request, availabilities) {
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

      if (!allowPartialOffers) {
        const winFromTime = window.from.getTime();
        const winUntilTime = window.until.getTime();
        if (winFromTime > reqFromDate.getTime() || winUntilTime < reqUntilDate.getTime()) continue;
      }

      const isBlocked = await isTimeWindowBlocked(
        admin,
        db,
        window.spotId,
        request.facilityCode,
        reqFromDate,
        reqUntilDate,
        request.id,
      );
      if (isBlocked) continue;

      allWindows.push(window);
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

function calculateOfferTimeWindow(requestFrom, requestUntil, windowFrom, windowUntil) {
  return coreCalculateOfferTimeWindow(requestFrom, requestUntil, windowFrom, windowUntil);
}

module.exports = {
  findBestMatchingAvailability,
  calculateOfferTimeWindow,
};
