/**
 * Re-run auto-matching for all open requests in a facility (e.g. after rule/deploy changes).
 * Skips entire request only when an accepted offer fully covers the request window.
 * Partial active/accepted offers: rematch uncovered gaps only.
 */

const {findBestMatchingAvailability, calculateOfferTimeWindow, diagnoseGapMatch} = require('./matching');
const {mergeIntervals, BLOCK_TOLERANCE_MS} = require('./matchingCore');

const REQUEST_CUTOFF_MS = 3 * 60 * 60 * 1000;

function toDate(v) {
  if (!v) return null;
  if (v.toDate) return v.toDate();
  if (v instanceof Date) return v;
  return new Date(v);
}

function coversFullRange(offerFrom, offerUntil, reqFrom, reqUntil) {
  return (
    offerFrom.getTime() <= reqFrom.getTime() + BLOCK_TOLERANCE_MS &&
    offerUntil.getTime() >= reqUntil.getTime() - BLOCK_TOLERANCE_MS
  );
}

async function loadRequestOffers(db, requestId) {
  const snap = await db.collection('parking_requests').doc(requestId).collection('offers').get();
  return snap.docs.map((d) => ({id: d.id, ...d.data()}));
}

function getBlockingOffers(offers) {
  return offers.filter((o) => {
    const st = o.status ?? 'active';
    return st === 'active' || st === 'accepted';
  });
}

/** @returns {string|null} skip reason or null to continue rematch */
function getSkipRematchReason(reqData, offers) {
  const reqFrom = toDate(reqData.from);
  const reqUntil = toDate(reqData.until);
  if (!reqFrom || !reqUntil || reqUntil <= reqFrom) {
    return 'skipped_invalid_times';
  }

  const hasFullAccepted = offers.some((o) => {
    if ((o.status ?? 'active') !== 'accepted') return false;
    const of = toDate(o.from);
    const ou = toDate(o.until);
    return of && ou && coversFullRange(of, ou, reqFrom, reqUntil);
  });
  if (hasFullAccepted) {
    return 'skipped_has_accepted_full';
  }

  return null;
}

/** Gaps in [reqFrom, reqUntil] not covered by active/accepted offers. */
function getUncoveredGaps(reqFrom, reqUntil, offers) {
  const blocking = getBlockingOffers(offers);
  const intervals = blocking
    .map((o) => {
      const f = toDate(o.from);
      const u = toDate(o.until);
      if (!f || !u) return null;
      const start = Math.max(f.getTime(), reqFrom.getTime());
      const end = Math.min(u.getTime(), reqUntil.getTime());
      if (end <= start) return null;
      return {start, end};
    })
    .filter(Boolean);

  const merged = mergeIntervals(intervals);
  const gaps = [];
  let cursor = reqFrom.getTime();

  for (const b of merged) {
    if (b.start > cursor) {
      gaps.push({from: new Date(cursor), until: new Date(b.start)});
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < reqUntil.getTime()) {
    gaps.push({from: new Date(cursor), until: new Date(reqUntil)});
  }

  return gaps.filter((g) => g.until.getTime() - g.from.getTime() > BLOCK_TOLERANCE_MS);
}

function loadFacilityAvailabilities(allAvailabilitiesSnap, facilityCode) {
  return allAvailabilitiesSnap.docs
    .map((doc) => ({id: doc.id, ...doc.data()}))
    .filter((av) => {
      const avCode = String(av.facilityCode || '').trim().toUpperCase();
      return (
        avCode === facilityCode &&
        av.isArchived !== true &&
        (av.isActive === true || av.isActive === undefined)
      );
    });
}

function loadOpenRequests(requestsSnap, facilityCode) {
  return requestsSnap.docs
    .map((doc) => ({id: doc.id, ...doc.data()}))
    .filter((r) => {
      if (r.isFulfilled === true || r.isArchived === true || r.offeredSpotId) return false;
      const rCode = String(r.facilityCode || '').trim().toUpperCase();
      if (rCode !== facilityCode || !r.requestedBy) return false;
      return true;
    });
}

/**
 * @param {object} opts
 * @param {import('firebase-admin')} opts.admin
 * @param {import('firebase-admin/firestore').Firestore} opts.db
 * @param {string} opts.facilityCode normalized uppercase
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.skipIfHasActiveOffer] default true — full/accepted only; partial gaps still rematch
 * @param {boolean} [opts.sendPush] default true when not dryRun
 * @param {(uid: string, title: string, body: string, data: object) => Promise<void>} [opts.sendPushToUser]
 */
async function runRematchFacility(opts) {
  const {
    admin,
    db,
    facilityCode,
    dryRun = false,
    skipIfHasActiveOffer = true,
    sendPush = true,
    sendPushToUser,
  } = opts;

  const stats = {
    facilityCode,
    dryRun,
    openRequests: 0,
    skippedHasOffer: 0,
    noMatch: 0,
    matchAutoOfferDisabled: 0,
    offersCreated: 0,
    gapsRematched: 0,
    errors: 0,
    details: [],
  };

  const allAvailabilitiesSnap = await db.collection('parking_availabilities').get();
  const availabilities = loadFacilityAvailabilities(allAvailabilitiesSnap, facilityCode);

  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - REQUEST_CUTOFF_MS);
  const requestsSnap = await db
    .collection('parking_requests')
    .where('until', '>', cutoff)
    .orderBy('until', 'asc')
    .limit(150)
    .get();

  const openRequests = loadOpenRequests(requestsSnap, facilityCode);
  stats.openRequests = openRequests.length;

  /** Dry-run: offers that would be created earlier in this run (same order as live). */
  const simulatedSpotBlocks = [];

  for (const reqData of openRequests) {
    const requestId = reqData.id;
    try {
      let offers = await loadRequestOffers(db, requestId);

      if (skipIfHasActiveOffer) {
        const skipReason = getSkipRematchReason(reqData, offers);
        if (skipReason) {
          stats.skippedHasOffer += 1;
          stats.details.push({requestId, result: skipReason});
          continue;
        }
      }

      const reqFrom = toDate(reqData.from);
      const reqUntil = toDate(reqData.until);
      if (!reqFrom || !reqUntil) {
        stats.errors += 1;
        stats.details.push({requestId, result: 'error', message: 'invalid request times'});
        continue;
      }

      const gaps = getUncoveredGaps(reqFrom, reqUntil, offers);
      if (gaps.length === 0) {
        stats.skippedHasOffer += 1;
        stats.details.push({requestId, result: 'skipped_no_uncovered_gaps'});
        continue;
      }

      const availabilitiesForRequest = availabilities.filter((av) => av.userId !== reqData.requestedBy);
      let requestHadMatch = false;

      for (const gap of gaps) {
        stats.gapsRematched += 1;
        const gapRequest = {
          id: requestId,
          requestedBy: reqData.requestedBy,
          facilityCode,
          from: admin.firestore.Timestamp.fromDate(gap.from),
          until: admin.firestore.Timestamp.fromDate(gap.until),
          allowPartialOffers: reqData.allowPartialOffers !== false,
        };

        const matchOptions = dryRun ? {simulatedBlocks: simulatedSpotBlocks} : undefined;
        const bestMatch = await findBestMatchingAvailability(
          admin,
          db,
          gapRequest,
          availabilitiesForRequest,
          matchOptions,
        );

        if (!bestMatch) {
          const detail = {
            requestId,
            result: 'no_match_for_gap',
            gapFrom: gap.from.toISOString(),
            gapUntil: gap.until.toISOString(),
          };
          if (dryRun) {
            detail.diagnosis = await diagnoseGapMatch(
              admin,
              db,
              {
                id: requestId,
                requestedBy: reqData.requestedBy,
                facilityCode,
                allowPartialOffers: reqData.allowPartialOffers !== false,
              },
              gap,
              availabilitiesForRequest,
            );
          }
          stats.details.push(detail);
          continue;
        }

        if (bestMatch.autoOffer === false) {
          stats.matchAutoOfferDisabled += 1;
          stats.details.push({
            requestId,
            result: 'match_auto_offer_disabled',
            spotId: bestMatch.spotId,
            availabilityId: bestMatch.availabilityId,
            gapFrom: gap.from.toISOString(),
            gapUntil: gap.until.toISOString(),
          });
          continue;
        }

        const offerWindow = calculateOfferTimeWindow(
          gap.from,
          gap.until,
          bestMatch.from,
          bestMatch.until,
        );

        requestHadMatch = true;

        if (dryRun) {
          stats.offersCreated += 1;
          stats.details.push({
            requestId,
            result: 'would_create_offer',
            spotId: bestMatch.spotId,
            availabilityId: bestMatch.availabilityId,
            offerFrom: offerWindow.from.toISOString(),
            offerUntil: offerWindow.until.toISOString(),
            gapFrom: gap.from.toISOString(),
            gapUntil: gap.until.toISOString(),
          });
          offers = offers.concat({
            from: admin.firestore.Timestamp.fromDate(offerWindow.from),
            until: admin.firestore.Timestamp.fromDate(offerWindow.until),
            status: 'active',
          });
          simulatedSpotBlocks.push({
            spotId: bestMatch.spotId,
            start: offerWindow.from.getTime(),
            end: offerWindow.until.getTime(),
          });
          continue;
        }

        const offersCol = db.collection('parking_requests').doc(requestId).collection('offers');
        const offerRef = await offersCol.add({
          offererId: bestMatch.userId,
          spotId: bestMatch.spotId,
          from: admin.firestore.Timestamp.fromDate(offerWindow.from),
          until: admin.firestore.Timestamp.fromDate(offerWindow.until),
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        stats.offersCreated += 1;
        stats.details.push({
          requestId,
          result: 'offer_created',
          offerId: offerRef.id,
          spotId: bestMatch.spotId,
          offerFrom: offerWindow.from.toISOString(),
          offerUntil: offerWindow.until.toISOString(),
          gapFrom: gap.from.toISOString(),
          gapUntil: gap.until.toISOString(),
        });

        offers = offers.concat({
          from: admin.firestore.Timestamp.fromDate(offerWindow.from),
          until: admin.firestore.Timestamp.fromDate(offerWindow.until),
          status: 'active',
        });

        if (sendPush && sendPushToUser) {
          const requestFromDate = reqFrom;
          const requestUntilDate = reqUntil;
          const isPartial =
            offerWindow.from.getTime() !== requestFromDate.getTime() ||
            offerWindow.until.getTime() !== requestUntilDate.getTime();

          try {
            await sendPushToUser(
              reqData.requestedBy,
              isPartial ? 'Teilweise automatisch gefunden' : 'Parkplatz automatisch gefunden!',
              isPartial
                ? `Ein passender Parkplatz ${bestMatch.spotId} wurde automatisch gefunden`
                : `Ein passender Parkplatz ${bestMatch.spotId} wurde automatisch für dich gefunden!`,
              {type: 'auto_match', requestId, spotId: bestMatch.spotId, offeredBy: bestMatch.userId},
            );
          } catch (_) {}

          try {
            let requesterUsername = 'einem Nutzer';
            const requesterPublicDoc = await db.collection('users_public').doc(reqData.requestedBy).get();
            if (requesterPublicDoc.exists) {
              requesterUsername = requesterPublicDoc.data()?.username || requesterUsername;
            }
            const fmt = (d) =>
              new Intl.DateTimeFormat('de-DE', {
                timeZone: 'Europe/Berlin',
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              }).format(d);
            const timeRangeStr = `${fmt(requestFromDate)} – ${fmt(requestUntilDate)}`;
            await sendPushToUser(
              bestMatch.userId,
              'Parkplatz automatisch vergeben',
              `Parkplatz ${bestMatch.spotId}, ${timeRangeStr}: an ${requesterUsername} vergeben`,
              {type: 'auto_match_offerer', requestId, spotId: bestMatch.spotId, requestedBy: reqData.requestedBy},
            );
          } catch (_) {}
        }
      }

      if (!requestHadMatch) {
        stats.noMatch += 1;
        stats.details.push({requestId, result: 'no_match', gapsChecked: gaps.length});
      }
    } catch (e) {
      stats.errors += 1;
      stats.details.push({requestId, result: 'error', message: e?.message ?? String(e)});
    }
  }

  return stats;
}

module.exports = {runRematchFacility, getSkipRematchReason, getUncoveredGaps, loadRequestOffers};
