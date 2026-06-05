// firebase-functions v6: v1 + v2 are split. Firestore triggers use v2 (2nd Gen) for reliable deploys.
const {onRequest} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onDocumentCreated, onDocumentUpdated} = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const {requireAuth, sendPushToUserCore, sendPushToUserByUid, sendPushToAllCore} = require('./lib/push');
const {runScheduledParkingMaintenance} = require('./lib/maintenance');
const {findBestMatchingAvailability, calculateOfferTimeWindow} = require('./lib/matching');
const {runRematchFacility} = require('./lib/rematchFacility');
const {runDiagnoseParkingMatch} = require('./lib/diagnoseParkingMatch');

admin.initializeApp();

const REGION = 'europe-west3';
const firestoreOpt = (document) => ({ document, region: REGION });

function formatBerlinDateTime(d) {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d instanceof Date ? d : new Date(d));
}

function isPartialAutoOffer(offerWindow, requestFrom, requestUntil) {
  const rf = requestFrom.toDate ? requestFrom.toDate() : new Date(requestFrom);
  const ru = requestUntil.toDate ? requestUntil.toDate() : new Date(requestUntil);
  return (
    offerWindow.from.getTime() !== rf.getTime() || offerWindow.until.getTime() !== ru.getTime()
  );
}

/** Notify facility users about a new open request (excludes requester). */
async function notifyFacilityNewRequest(admin, opts) {
  const {requestedBy, facilityCode, requestFrom, requestUntil, requestId, username} = opts;
  const fromDate = requestFrom.toDate ? requestFrom.toDate() : new Date(requestFrom);
  const untilDate = requestUntil.toDate ? requestUntil.toDate() : new Date(requestUntil);
  const name = username || 'Ein Nutzer';
  try {
    await sendPushToAllCore(admin, {
      notification: {
        title: 'Neue Parkplatz-Anfrage',
        body: `${name} sucht einen Parkplatz von ${formatBerlinDateTime(fromDate)} bis ${formatBerlinDateTime(untilDate)}`,
      },
      data: {
        type: 'new_request',
        requestId: String(requestId),
        requestedBy: String(requestedBy),
      },
      excludeUserId: String(requestedBy),
      facilityCode: String(facilityCode),
    });
    console.log(`[onRequestCreated] Broadcast new_request to facility ${facilityCode}`);
  } catch (e) {
    console.log('Push send (new_request) failed:', e?.message ?? e);
  }
}

/**
 * HTTP variant used by the React Native client (explicit Bearer token).
 */
exports.sendPushToUserHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const data = req.body?.data ?? req.body ?? {};
  try {
    const result = await sendPushToUserCore(admin, data);
    res.status(200).json({result});
  } catch (e) {
    // Best-effort mapping for common errors
    res.status(400).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * HTTP variant used by the React Native client (explicit Bearer token).
 */
exports.sendPushToAllHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const data = req.body?.data ?? req.body ?? {};
  try {
    const result = await sendPushToAllCore(admin, data);
    res.status(200).json({result});
  } catch (e) {
    res.status(400).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * Debug/testing endpoint: run scheduled maintenance immediately and return stats.
 * Requires auth (Bearer token). Useful to verify whether the backend *would* send reminders,
 * without waiting for the scheduler and without needing to read logs.
 *
 * Body:
 *   { data?: { nowMs?: number, dryRun?: boolean } }
 */
exports.runMaintenanceNowHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const data = req.body?.data ?? req.body ?? {};
  const nowMs = typeof data?.nowMs === 'number' ? data.nowMs : Date.now();
  const dryRun = data?.dryRun === true;

  try {
    const db = admin.firestore();
    const result = await runScheduledParkingMaintenance({admin, db, nowMs, dryRun, sendPushToUser: (uid, t, b, d) =>
      sendPushToUserByUid(admin, uid, t, b, d),
    });
    res.status(200).json({result: {...result, nowMs, dryRun}});
  } catch (e) {
    res.status(400).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * Re-run auto-matching for all open requests in the caller's facility.
 * Skips only when an accepted offer fully covers the request; partial offers get gap rematch.
 * Body: { facilityCode?: string, dryRun?: boolean, skipIfHasActiveOffer?: boolean, sendPush?: boolean }
 * Requires auth. Use dryRun:true first to preview without creating offers.
 */
exports.runRematchFacilityHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const body = req.body?.data ?? req.body ?? {};
  let facilityCode =
    typeof body?.facilityCode === 'string' ? body.facilityCode.trim().toUpperCase() : '';

  const db = admin.firestore();
  const uid = decoded.uid;

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      res.status(403).json({error: {status: 'PERMISSION_DENIED', message: 'User document not found'}});
      return;
    }
    const userFacilityCode = (userSnap.data().facilityCode || '').trim().toUpperCase();
    if (!facilityCode) facilityCode = userFacilityCode;
    if (!facilityCode || userFacilityCode !== facilityCode) {
      res.status(403).json({
        error: {status: 'PERMISSION_DENIED', message: 'Can only rematch for own facility'},
      });
      return;
    }

    const dryRun = body?.dryRun === true;
    const skipIfHasActiveOffer = body?.skipIfHasActiveOffer !== false;
    const sendPush = body?.sendPush !== false;

    const result = await runRematchFacility({
      admin,
      db,
      facilityCode,
      dryRun,
      skipIfHasActiveOffer,
      sendPush: sendPush && !dryRun,
      sendPushToUser: (userUid, title, pushBody, data) =>
        sendPushToUserByUid(admin, userUid, title, pushBody, data),
    });

    console.log('[runRematchFacility]', result);
    res.status(200).json({result});
  } catch (e) {
    res.status(500).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * Match diagnosis for one request (gaps, spot offers incl. withdrawn, blockers).
 * Body: { requestId: string, spotId?: string, facilityCode?: string }
 */
exports.diagnoseParkingMatchHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const body = req.body?.data ?? req.body ?? {};
  const requestId = typeof body?.requestId === 'string' ? body.requestId.trim() : '';
  if (!requestId) {
    res.status(400).json({error: {status: 'INVALID_ARGUMENT', message: 'requestId required'}});
    return;
  }

  const db = admin.firestore();
  const uid = decoded.uid;

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      res.status(403).json({error: {status: 'PERMISSION_DENIED', message: 'User document not found'}});
      return;
    }
    const userFacilityCode = (userSnap.data().facilityCode || '').trim().toUpperCase();
    let facilityCode =
      typeof body?.facilityCode === 'string' ? body.facilityCode.trim().toUpperCase() : userFacilityCode;
    if (!facilityCode || userFacilityCode !== facilityCode) {
      res.status(403).json({
        error: {status: 'PERMISSION_DENIED', message: 'Can only diagnose for own facility'},
      });
      return;
    }

    const spotId = typeof body?.spotId === 'string' ? body.spotId.trim() : undefined;
    const result = await runDiagnoseParkingMatch(admin, db, {requestId, spotId, facilityCode});
    res.status(200).json({result});
  } catch (e) {
    res.status(500).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * Returns the number of users registered for the given facility.
 * Caller must be authenticated; may only request the count for their own facility (same facilityCode as in their user doc).
 */
exports.getFacilityMemberCountHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const data = req.body?.data ?? req.body ?? {};
  const facilityCode = typeof data?.facilityCode === 'string' ? data.facilityCode.trim().toUpperCase() : '';
  if (!facilityCode) {
    res.status(400).json({error: {status: 'INVALID_ARGUMENT', message: 'facilityCode required'}});
    return;
  }

  const db = admin.firestore();
  const uid = decoded.uid;

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      res.status(403).json({error: {status: 'PERMISSION_DENIED', message: 'User document not found'}});
      return;
    }
    const userFacilityCode = (userSnap.data().facilityCode || '').trim().toUpperCase();
    if (userFacilityCode !== facilityCode) {
      res.status(403).json({error: {status: 'PERMISSION_DENIED', message: 'Can only request count for own facility'}});
      return;
    }

    const usersSnap = await db.collection('users').where('facilityCode', '==', facilityCode).get();
    const count = usersSnap.size;

    res.status(200).json({result: {count}});
  } catch (e) {
    res.status(500).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * Returns all parking spot IDs assigned by users in the given facility (union of users.parkingSpots).
 * Caller must be authenticated; may only request spots for their own facility.
 */
exports.getFacilityAssignedSpotsHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const data = req.body?.data ?? req.body ?? {};
  const facilityCode = typeof data?.facilityCode === 'string' ? data.facilityCode.trim().toUpperCase() : '';
  if (!facilityCode) {
    res.status(400).json({error: {status: 'INVALID_ARGUMENT', message: 'facilityCode required'}});
    return;
  }

  const db = admin.firestore();
  const uid = decoded.uid;

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      res.status(403).json({error: {status: 'PERMISSION_DENIED', message: 'User document not found'}});
      return;
    }
    const userFacilityCode = (userSnap.data().facilityCode || '').trim().toUpperCase();
    if (userFacilityCode !== facilityCode) {
      res.status(403).json({error: {status: 'PERMISSION_DENIED', message: 'Can only request spots for own facility'}});
      return;
    }

    const usersSnap = await db.collection('users').where('facilityCode', '==', facilityCode).get();
    const spotIds = new Set();
    usersSnap.forEach((doc) => {
      const spots = doc.data().parkingSpots;
      if (!Array.isArray(spots)) return;
      for (const s of spots) {
        const t = String(s ?? '').trim().toUpperCase();
        if (t) spotIds.add(t);
      }
    });

    res.status(200).json({result: {spotIds: [...spotIds]}});
  } catch (e) {
    res.status(500).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * Returns fulfilled request stats for the given facility.
 * Bereits erfüllt: total fulfilled ever in facility
 * Zukünftig: fulfilled with until >= now (current + future)
 * Von mir: fulfilled by/for current user ever in facility
 * Pass data.debug: true to get debug list in response (and server console.table)
 */
exports.getFacilityFulfilledStatsHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const body = req.body?.data ?? req.body ?? {};
  const facilityCode = typeof body?.facilityCode === 'string' ? body.facilityCode.trim().toUpperCase() : '';
  if (!facilityCode) {
    res.status(400).json({error: {status: 'INVALID_ARGUMENT', message: 'facilityCode required'}});
    return;
  }

  const db = admin.firestore();
  const uid = decoded.uid;

  try {
    const userSnap = await db.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      res.status(403).json({error: {status: 'PERMISSION_DENIED', message: 'User document not found'}});
      return;
    }
    const userFacilityCode = (userSnap.data().facilityCode || '').trim().toUpperCase();
    if (userFacilityCode !== facilityCode) {
      res.status(403).json({error: {status: 'PERMISSION_DENIED', message: 'Can only request stats for own facility'}});
      return;
    }

    const fulfilledSnap = await db.collection('parking_requests')
      .where('facilityCode', '==', facilityCode)
      .where('isFulfilled', '==', true)
      .get();

    const now = Date.now();
    let total = 0;
    let future = 0;
    let byUser = 0;
    const wantDebug = body?.debug === true;
    const debugList = wantDebug ? [] : null;

    fulfilledSnap.docs.forEach((d) => {
      const data = d.data();
      // Archivierte zählen mit (waren erfüllt) – nur für total und byUser; Zukünftig schließt sie per until < now aus
      total++;
      const fromDate = data.from?.toDate ? data.from.toDate() : null;
      const untilDate = data.until?.toDate ? data.until.toDate() : null;
      const until = untilDate ? untilDate.getTime() : 0;
      if (until >= now) future++;
      const requestedBy = data.requestedBy || '';
      const fulfilledByUserIds = Array.isArray(data.fulfilledByUserIds) ? data.fulfilledByUserIds : [];
      const offeredBy = data.offeredBy || '';
      const isByUser = requestedBy === uid || offeredBy === uid || fulfilledByUserIds.includes(uid);
      if (isByUser) byUser++;

      if (debugList) {
        debugList.push({
          id: d.id,
          from: fromDate ? fromDate.toISOString() : null,
          until: untilDate ? untilDate.toISOString() : null,
          requestedBy: data.requestedByUsername || requestedBy?.slice(0, 8) + '…',
          offeredBy: data.offeredByUsername || (offeredBy ? offeredBy.slice(0, 8) + '…' : null),
          fulfilledByUserIds: fulfilledByUserIds.length,
          isArchived: data.isArchived === true,
          isFuture: until >= now,
          isByUser,
        });
      }
    });

    if (debugList) {
      console.log('[getFacilityFulfilledStats] facilityCode=', facilityCode, 'uid=', uid);
      console.table(debugList);
    }

    const result = {total, future, byUser};
    if (debugList) result.debug = debugList;
    res.status(200).json({result});
  } catch (e) {
    res.status(500).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * When an offer is created under parking_requests/{requestId}/offers/{offerId},
 * detect if it covers the full request window. If yes:
 * - write offeredBy/offeredSpotId/offeredAt to the request document (so it stops being "open")
 * - withdraw other active offers (partial) automatically
 */
exports.onOfferCreatedV2 = onDocumentCreated(
  firestoreOpt('parking_requests/{requestId}/offers/{offerId}'),
  async (event) => {
    const requestId = event.params.requestId;
    const offerId = event.params.offerId;
    const offer = (event.data && event.data.data()) || {};

    const offererId = offer.offererId;
    const spotId = offer.spotId;
    const from = offer.from?.toDate ? offer.from.toDate() : null;
    const until = offer.until?.toDate ? offer.until.toDate() : null;
    if (!requestId || !offererId || !spotId || !from || !until) return;

    const reqRef = admin.firestore().collection('parking_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) return;
    const reqData = reqSnap.data() || {};
    if (reqData.isArchived === true) return;

    // Track participants (requester + offerers) for chat visibility (even if already fulfilled).
    try {
      await reqRef.set(
        {participantIds: admin.firestore.FieldValue.arrayUnion(String(offererId))},
        {merge: true},
      );
    } catch (e) {
      console.log('participantIds update failed:', e?.message ?? e);
    }

    if (reqData.isFulfilled === true) return;

    const reqFrom = reqData.from?.toDate ? reqData.from.toDate() : null;
    const reqUntil = reqData.until?.toDate ? reqData.until.toDate() : null;
    if (!reqFrom || !reqUntil) return;

    const isFull = from.getTime() <= reqFrom.getTime() && until.getTime() >= reqUntil.getTime();
    if (!isFull) return;

    // If a full offer already exists, don't override it.
    if (typeof reqData.offeredSpotId === 'string' && reqData.offeredSpotId.length > 0) return;

    await reqRef.set(
      {
        offeredBy: offererId,
        offeredSpotId: spotId,
        offeredAt: admin.firestore.FieldValue.serverTimestamp(),
        fullOfferId: offerId,
      },
      {merge: true},
    );

    // Set other active offers to standby (they will be withdrawn if this full offer is accepted)
    const offersCol = reqRef.collection('offers');
    const offersSnap = await offersCol.get();
    const batch = admin.firestore().batch();
    offersSnap.docs.forEach((d) => {
      if (d.id === offerId) return;
      const st = d.get('status') || 'active';
      if (st !== 'active') return;
      batch.update(d.ref, {
        status: 'standby',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  },
);

/**
 * Scheduled maintenance:
 * 1) Send reminder push ~30 minutes before the request ends (for fulfilled requests)
 * 2) Auto-archive requests 3 hours after their end time
 *
 * Runs server-side to be reliable even when phones are offline.
 */
exports.scheduledParkingMaintenance = onSchedule(
  {schedule: 'every 5 minutes', timeZone: 'Europe/Berlin', region: REGION},
  async () => {
    const db = admin.firestore();
    const nowMs = Date.now();
    const res = await runScheduledParkingMaintenance({
      admin,
      db,
      nowMs,
      sendPushToUser: (uid, t, b, d) => sendPushToUserByUid(admin, uid, t, b, d),
    });
    console.log('scheduledParkingMaintenance summary:', JSON.stringify(res));
  },
);

// Exported for local testing only (no stability guarantees).
exports._runScheduledParkingMaintenance = (args) =>
  runScheduledParkingMaintenance({admin, ...args, db: args.db, sendPushToUser: args.sendPushToUser});

exports.onCommentCreatedV2 = onDocumentCreated(
  firestoreOpt('parking_requests/{requestId}/comments/{commentId}'),
  async (event) => {
    const requestId = event.params.requestId;
    const data = (event.data && event.data.data()) || {};
    const authorId = data.authorId;
    const text = String(data.text || '').trim();
    if (!requestId || !authorId || !text) return;

    const reqRef = admin.firestore().collection('parking_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) return;
    const reqData = reqSnap.data() || {};
    if (reqData.isArchived === true) return;

    // Keep last-comment preview on the request doc for easy UI display.
    try {
      await reqRef.set(
        {
          lastCommentText: text,
          lastCommentAt: admin.firestore.FieldValue.serverTimestamp(),
          commentCount: admin.firestore.FieldValue.increment(1),
          participantIds: admin.firestore.FieldValue.arrayUnion(String(authorId)),
        },
        {merge: true},
      );
    } catch (e) {
      console.log('request lastComment update failed:', e?.message ?? e);
    }

    const participants = Array.isArray(reqData.participantIds) ? reqData.participantIds : [];
    const recipients = participants.filter((uid) => uid && uid !== authorId);
    if (!recipients.length) return;

    let authorName = null;
    try {
      const pub = await admin.firestore().collection('users_public').doc(String(authorId)).get();
      if (pub.exists) authorName = pub.get('username') || null;
    } catch {}

    const title = '💬 Neue Nachricht';
    const body =
      (authorName ? `${authorName}: ` : '') + (text.length > 120 ? `${text.slice(0, 120)}…` : text);

    await Promise.all(
      recipients.map(async (uid) => {
        try {
          await sendPushToUserByUid(admin, String(uid), title, body, {
            type: 'comment',
            requestId: String(requestId),
            commentId: String(event.params.commentId),
          });
        } catch (e) {
          console.log('Push send (comment) failed:', e?.message ?? e);
        }
      }),
    );
  },
);

/**
 * When a request is updated, check if a full offer was cancelled.
 * If offeredSpotId/offeredBy are removed, reactivate standby offers.
 * Also handle notifications when fulfilled requests are cancelled.
 */
exports.onRequestUpdatedV2 = onDocumentUpdated(
  firestoreOpt('parking_requests/{requestId}'),
  async (event) => {
    const requestId = event.params.requestId;
    const before = (event.data && event.data.before && event.data.before.data()) || {};
    const after = (event.data && event.data.after && event.data.after.data()) || {};
    
    // Check if fulfilled request was cancelled (isFulfilled changed from true to false)
    const wasFulfilled = before.isFulfilled === true;
    const isFulfilled = after.isFulfilled === true;
    
    if (wasFulfilled && !isFulfilled && !after.isArchived) {
      // Fulfilled request was cancelled - notify requester
      const requesterUid = after.requestedBy;
      if (typeof requesterUid === 'string' && requesterUid) {
        const title = '⚠️ Angebot zurückgezogen';
        const body = 'Das Angebot für deine Parkplatzanfrage wurde zurückgezogen.';
        try {
          await sendPushToUserByUid(admin, requesterUid, title, body, {
            type: 'offer_cancelled',
            requestId: String(requestId),
          });
        } catch (e) {
          console.log('Push send (offer_cancelled) failed:', e?.message ?? e);
        }
      }
      
      // Notify offerers whose offers were accepted (now withdrawn)
      const fulfilledByUserIds = Array.isArray(before.fulfilledByUserIds) ? before.fulfilledByUserIds : [];
      if (before.offeredBy && typeof before.offeredBy === 'string') {
        fulfilledByUserIds.push(before.offeredBy);
      }
      
      const uniqueOffererIds = Array.from(new Set(fulfilledByUserIds));
      for (const offererId of uniqueOffererIds) {
        if (typeof offererId === 'string' && offererId && offererId !== requesterUid) {
          const title = '⚠️ Angebot zurückgezogen';
          const body = 'Die Parkplatzanfrage wurde zurückgezogen.';
          try {
            await sendPushToUserByUid(admin, offererId, title, body, {
              type: 'request_cancelled',
              requestId: String(requestId),
            });
          } catch (e) {
            console.log('Push send (request_cancelled) failed:', e?.message ?? e);
          }
        }
      }
    }
    
    // Check if full offer was cancelled (offeredSpotId or offeredBy removed)
    const hadFullOffer = typeof before.offeredSpotId === 'string' && before.offeredSpotId.length > 0;
    const hasFullOffer = typeof after.offeredSpotId === 'string' && after.offeredSpotId.length > 0;
    
    if (hadFullOffer && !hasFullOffer && !after.isFulfilled && !after.isArchived) {
      // Full offer was cancelled, reactivate standby offers
      const reqRef = admin.firestore().collection('parking_requests').doc(requestId);
      const offersCol = reqRef.collection('offers');
      const offersSnap = await offersCol.get();
      const batch = admin.firestore().batch();
      
      offersSnap.docs.forEach((d) => {
        const st = d.get('status') || 'active';
        if (st === 'standby') {
          batch.update(d.ref, {
            status: 'active',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      await batch.commit();
    }
  },
);

exports.onRequestCreatedV2 = onDocumentCreated(
  firestoreOpt('parking_requests/{requestId}'),
  async (event) => {
    const requestId = event.params.requestId;
    const data = (event.data && event.data.data()) || {};
    if (data.isArchived === true) return;

    const requestedBy = data.requestedBy;
    const initial = String(data.initialCommentText || '').trim();
    
    // Get request reference (needed for both comment creation and offer creation)
    const reqRef = admin.firestore().collection('parking_requests').doc(String(requestId));
    
    // Only create comment if initial comment text exists
    if (requestedBy && initial) {
      const commentsCol = reqRef.collection('comments');

      // Avoid duplicating if something already wrote comments.
      const existing = await commentsCol.limit(1).get();
      if (existing.empty) {
        await commentsCol.add({
          authorId: String(requestedBy),
          text: initial,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await reqRef.set(
          {
            lastCommentText: initial,
            lastCommentAt: admin.firestore.FieldValue.serverTimestamp(),
            commentCount: admin.firestore.FieldValue.increment(1),
            participantIds: admin.firestore.FieldValue.arrayUnion(String(requestedBy)),
          },
          {merge: true},
        );
      }
    }
    
    // Continue with matching even if no comment (matching should work regardless)
    if (!requestedBy) {
      console.log(`[onRequestCreated] Missing requestedBy, skipping matching`);
      return;
    }

    // Try to find matching availability and create auto-offer if enabled
    let fullAutoMatch = false;
    try {
      console.log(`[onRequestCreated] Starting matching for request ${requestId}`);
      const facilityCode = data.facilityCode;
      const requestFrom = data.from;
      const requestUntil = data.until;
      
      if (!facilityCode || !requestFrom || !requestUntil) {
        console.log(`[onRequestCreated] Missing required fields: facilityCode=${facilityCode}, from=${requestFrom}, until=${requestUntil}`);
        return;
      }
      
      // Normalize facilityCode like the client (trim + uppercase) so matching works regardless of storage format
      const normalizedFacilityCode = String(facilityCode || '').trim().toUpperCase();
      if (!normalizedFacilityCode) {
        console.log('[onRequestCreated] Empty facilityCode after normalize, skipping matching');
        return;
      }

      const requesterUsername =
        data.requestedByUsername ||
        (await admin
          .firestore()
          .collection('users_public')
          .doc(String(requestedBy))
          .get()
          .then((d) => d.data()?.username)
          .catch(() => null)) ||
        'Ein Nutzer';

      console.log(`[onRequestCreated] Request: facilityCode=${normalizedFacilityCode}, from=${requestFrom.toDate ? requestFrom.toDate().toISOString() : requestFrom}, until=${requestUntil.toDate ? requestUntil.toDate().toISOString() : requestUntil}`);

      // Get all active availabilities in the facility
      const availabilitiesSnap = await admin.firestore()
        .collection('parking_availabilities')
        .get();

      console.log(`[onRequestCreated] Found ${availabilitiesSnap.docs.length} total availabilities`);

      const availabilities = availabilitiesSnap.docs
        .map((doc) => {
          const d = doc.data();
          return { id: doc.id, ...d };
        })
        .filter((av) => {
          const avCode = String(av.facilityCode || '').trim().toUpperCase();
          return (
            avCode === normalizedFacilityCode &&
            av.isArchived !== true &&
            (av.isActive === true || av.isActive === undefined) &&
            av.userId !== requestedBy
          );
        });

      console.log(`[onRequestCreated] Filtered to ${availabilities.length} matching availabilities in facility ${normalizedFacilityCode}`);
      
      if (availabilities.length === 0) {
        console.log(`[onRequestCreated] No availabilities found for facility ${facilityCode}`);
      } else {
      
      const request = {
        id: requestId,
        requestedBy,
        facilityCode: normalizedFacilityCode,
        from: requestFrom,
        until: requestUntil,
        allowPartialOffers: data.allowPartialOffers !== false,
      };
      
      const bestMatch = await findBestMatchingAvailability(
        admin,
        admin.firestore(),
        request,
        availabilities,
      );
      
      console.log(`[onRequestCreated] Best match found:`, bestMatch ? {
        availabilityId: bestMatch.availabilityId,
        userId: bestMatch.userId,
        spotId: bestMatch.spotId,
        autoOffer: bestMatch.autoOffer,
      } : 'none');
      
      if (bestMatch) {
        const offerWindow = calculateOfferTimeWindow(
          requestFrom,
          requestUntil,
          bestMatch.from,
          bestMatch.until,
        );
        
        // Check if autoOffer is enabled
        if (bestMatch.autoOffer !== false) {
          console.log(`[onRequestCreated] autoOffer is enabled, creating offer automatically`);
          // Automatically create offer
          const offersCol = reqRef.collection('offers');
          const offerRef = await offersCol.add({
            offererId: bestMatch.userId,
            spotId: bestMatch.spotId,
            from: admin.firestore.Timestamp.fromDate(offerWindow.from),
            until: admin.firestore.Timestamp.fromDate(offerWindow.until),
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          
          console.log(`[onRequestCreated] Offer created: ${offerRef.id} for spot ${bestMatch.spotId}`);
          
          const isPartial = isPartialAutoOffer(offerWindow, requestFrom, requestUntil);
          if (!isPartial) {
            fullAutoMatch = true;
          }
          let requesterUsername = 'einem Nutzer';
          try {
            const requesterPublicDoc = await admin.firestore()
              .collection('users_public')
              .doc(requestedBy)
              .get();
            requesterUsername = requesterPublicDoc.data()?.username || requesterUsername;
          } catch (_) {}
          
          // Notify requester about automatic match
          try {
            await sendPushToUserByUid(
              admin,
              requestedBy,
              isPartial ? 'Teilweise automatisch gefunden' : 'Parkplatz automatisch gefunden!',
              isPartial
                ? `Ein passender Parkplatz ${bestMatch.spotId} wurde automatisch gefunden`
                : `Ein passender Parkplatz ${bestMatch.spotId} wurde automatisch für dich gefunden!`,
              {
                type: 'auto_match',
                requestId,
                spotId: bestMatch.spotId,
                offeredBy: bestMatch.userId,
              },
            );
          } catch (e) {
            console.log('Push send (auto_match) failed:', e);
          }

          // Notify offerer that their spot was automatically assigned
          try {
            const fromDate = requestFrom.toDate ? requestFrom.toDate() : new Date(requestFrom);
            const untilDate = requestUntil.toDate ? requestUntil.toDate() : new Date(requestUntil);
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
            const timeRangeStr = `${fmt(fromDate)} – ${fmt(untilDate)}`;
            await sendPushToUserByUid(
              admin,
              bestMatch.userId,
              'Parkplatz automatisch vergeben',
              `Parkplatz ${bestMatch.spotId}, ${timeRangeStr}: an ${requesterUsername} vergeben`,
              {
                type: 'auto_match_offerer',
                requestId,
                spotId: bestMatch.spotId,
                requestedBy,
              },
            );
          } catch (e) {
            console.log('Push send (auto_match_offerer) failed:', e);
          }
        } else {
          console.log(`[onRequestCreated] autoOffer is disabled, notifying availability owner`);
          // autoOffer is false - notify availability owner about potential match
          try {
            // Get requester username
            const requesterPublicDoc = await admin.firestore()
              .collection('users_public')
              .doc(requestedBy)
              .get();
            const requesterUsername = requesterPublicDoc.data()?.username || 'einem Nutzer';
            
            await sendPushToUserByUid(
              admin,
              bestMatch.userId,
              'Potenzielle Übereinstimmung',
              `${requesterUsername} sucht einen Parkplatz, der zu deiner Verfügbarkeit passt`,
              {
                type: 'potential_match',
                requestId,
                spotId: bestMatch.spotId,
                requestedBy,
              },
            );
          } catch (e) {
            console.log('Push send (potential_match) failed:', e);
          }
        }
      }
      }

      if (!fullAutoMatch) {
        await notifyFacilityNewRequest(admin, {
          requestedBy,
          facilityCode: normalizedFacilityCode,
          requestFrom,
          requestUntil,
          requestId,
          username: requesterUsername,
        });
      } else {
        console.log(`[onRequestCreated] Full auto-match for ${requestId}, skipping facility broadcast`);
      }
    } catch (e) {
      // Matching failure should not prevent request creation
      console.error('Availability matching failed:', e);
      const facilityCode = data.facilityCode;
      const requestFrom = data.from;
      const requestUntil = data.until;
      const normalizedFacilityCode = String(facilityCode || '').trim().toUpperCase();
      if (normalizedFacilityCode && requestFrom && requestUntil) {
        await notifyFacilityNewRequest(admin, {
          requestedBy,
          facilityCode: normalizedFacilityCode,
          requestFrom,
          requestUntil,
          requestId,
          username: data.requestedByUsername || 'Ein Nutzer',
        });
      }
    }
  },
);

/** Cutoff: requests ending more than this ago are ignored (align with client KEEP_VISIBLE_AFTER_END_MS). */
const REQUEST_CUTOFF_MS = 3 * 60 * 60 * 1000;

/**
 * When a new availability is created (or activated): match it against open requests and create
 * auto-offers where this availability is the best match (full or partial).
 */
exports.onAvailabilityCreatedV2 = onDocumentCreated(
  firestoreOpt('parking_availabilities/{availabilityId}'),
  async (event) => {
    const availabilityId = event.params.availabilityId;
    const data = (event.data && event.data.data()) || {};
    console.log('[onAvailabilityCreated] Triggered', { availabilityId, facilityCode: data.facilityCode, isActive: data.isActive });
    if (data.isArchived === true) return;
    if (data.isActive === false) return;

    const facilityCode = String(data.facilityCode || '').trim().toUpperCase();
    if (!facilityCode) return;

    const availability = { id: availabilityId, ...data };
    const db = admin.firestore();

    try {
      const allAvailabilitiesSnap = await db.collection('parking_availabilities').get();
      const allAvailabilities = allAvailabilitiesSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((av) => {
          const avCode = String(av.facilityCode || '').trim().toUpperCase();
          return (
            avCode === facilityCode &&
            av.isArchived !== true &&
            (av.isActive === true || av.isActive === undefined)
          );
        });
      console.log('[onAvailabilityCreated] Availabilities in facility', allAvailabilities.length);

      // Query by until only (no composite index); filter isFulfilled/offeredSpotId in code
      const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - REQUEST_CUTOFF_MS);
      const requestsSnap = await db
        .collection('parking_requests')
        .where('until', '>', cutoff)
        .orderBy('until', 'asc')
        .limit(150)
        .get();

      const openRequests = requestsSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((r) => {
          if (r.isFulfilled === true || r.isArchived === true || r.offeredSpotId) return false;
          const rCode = String(r.facilityCode || '').trim().toUpperCase();
          if (rCode !== facilityCode || !r.requestedBy || r.requestedBy === availability.userId) return false;
          return true;
        });
      console.log('[onAvailabilityCreated] Open requests in facility', openRequests.length, 'of', requestsSnap.docs.length);

      for (const reqData of openRequests) {
        const request = {
          id: reqData.id,
          requestedBy: reqData.requestedBy,
          facilityCode,
          from: reqData.from,
          until: reqData.until,
          allowPartialOffers: reqData.allowPartialOffers !== false,
        };
        const bestMatch = await findBestMatchingAvailability(admin, db, request, allAvailabilities);
        if (!bestMatch) {
          console.log('[onAvailabilityCreated] No match for request', reqData.id);
          continue;
        }
        if (bestMatch.availabilityId !== availabilityId) {
          console.log('[onAvailabilityCreated] Best match for request', reqData.id, 'is other availability', bestMatch.availabilityId);
          continue;
        }
        console.log('[onAvailabilityCreated] Creating offer for request', reqData.id, 'spot', bestMatch.spotId);

        const requestFrom = reqData.from;
        const requestUntil = reqData.until;
        const offerWindow = calculateOfferTimeWindow(
          requestFrom,
          requestUntil,
          bestMatch.from,
          bestMatch.until,
        );

        if (bestMatch.autoOffer === false) {
          try {
            await sendPushToUserByUid(
              admin,
              bestMatch.userId,
              'Potenzielle Übereinstimmung',
              `Eine Anfrage passt zu deiner neuen Verfügbarkeit (Parkplatz ${bestMatch.spotId})`,
              { type: 'potential_match', requestId: reqData.id, spotId: bestMatch.spotId, requestedBy: reqData.requestedBy },
            );
          } catch (e) {
            console.log('Push send (potential_match) failed:', e);
          }
          continue;
        }

        const offersCol = db.collection('parking_requests').doc(reqData.id).collection('offers');
        await offersCol.add({
          offererId: bestMatch.userId,
          spotId: bestMatch.spotId,
          from: admin.firestore.Timestamp.fromDate(offerWindow.from),
          until: admin.firestore.Timestamp.fromDate(offerWindow.until),
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const requestFromDate = requestFrom.toDate ? requestFrom.toDate() : new Date(requestFrom);
        const requestUntilDate = requestUntil.toDate ? requestUntil.toDate() : new Date(requestUntil);
        const isPartial =
          offerWindow.from.getTime() !== requestFromDate.getTime() ||
          offerWindow.until.getTime() !== requestUntilDate.getTime();

        try {
          await sendPushToUserByUid(
            admin,
            reqData.requestedBy,
            isPartial ? 'Teilweise automatisch gefunden' : 'Parkplatz automatisch gefunden!',
            isPartial
              ? `Ein passender Parkplatz ${bestMatch.spotId} wurde automatisch gefunden`
              : `Ein passender Parkplatz ${bestMatch.spotId} wurde automatisch für dich gefunden!`,
            { type: 'auto_match', requestId: reqData.id, spotId: bestMatch.spotId, offeredBy: bestMatch.userId },
          );
        } catch (e) {
          console.log('Push send (auto_match) failed:', e);
        }

        try {
          let requesterUsername = 'einem Nutzer';
          const requesterPublicDoc = await db.collection('users_public').doc(reqData.requestedBy).get();
          if (requesterPublicDoc.exists) requesterUsername = requesterPublicDoc.data()?.username || requesterUsername;
          const fmt = (d) =>
            new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
          const timeRangeStr = `${fmt(requestFromDate)} – ${fmt(requestUntilDate)}`;
          await sendPushToUserByUid(
            admin,
            bestMatch.userId,
            'Parkplatz automatisch vergeben',
            `Parkplatz ${bestMatch.spotId}, ${timeRangeStr}: an ${requesterUsername} vergeben`,
            { type: 'auto_match_offerer', requestId: reqData.id, spotId: bestMatch.spotId, requestedBy: reqData.requestedBy },
          );
        } catch (e) {
          console.log('Push send (auto_match_offerer) failed:', e);
        }
      }
    } catch (e) {
      console.error('[onAvailabilityCreated] Matching failed:', e);
    }
  },
);

/**
 * When an availability is updated and becomes active (isActive: false -> true), run the same
 * matching as on create so open requests get an auto-offer from this availability.
 */
exports.onAvailabilityUpdatedV2 = onDocumentUpdated(
  firestoreOpt('parking_availabilities/{availabilityId}'),
  async (event) => {
    const before = (event.data && event.data.before && event.data.before.data()) || {};
    const after = (event.data && event.data.after && event.data.after.data()) || {};
    if (before.isActive === after.isActive) return;
    if (after.isActive !== true) return;

    const availabilityId = event.params.availabilityId;
    const data = after;
    if (data.isArchived === true) return;

    const facilityCode = String(data.facilityCode || '').trim().toUpperCase();
    if (!facilityCode) return;

    const availability = { id: availabilityId, ...data };
    const db = admin.firestore();

    try {
      const allAvailabilitiesSnap = await db.collection('parking_availabilities').get();
      const allAvailabilities = allAvailabilitiesSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((av) => {
          const avCode = String(av.facilityCode || '').trim().toUpperCase();
          return (
            avCode === facilityCode &&
            av.isArchived !== true &&
            (av.isActive === true || av.isActive === undefined)
          );
        });

      const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - REQUEST_CUTOFF_MS);
      const requestsSnap = await db
        .collection('parking_requests')
        .where('until', '>', cutoff)
        .orderBy('until', 'asc')
        .limit(150)
        .get();

      const openRequests = requestsSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((r) => {
          if (r.isFulfilled === true || r.isArchived === true || r.offeredSpotId) return false;
          const rCode = String(r.facilityCode || '').trim().toUpperCase();
          return rCode === facilityCode && r.requestedBy && r.requestedBy !== availability.userId;
        });

      for (const reqData of openRequests) {
        const request = {
          id: reqData.id,
          requestedBy: reqData.requestedBy,
          facilityCode,
          from: reqData.from,
          until: reqData.until,
        };
        const bestMatch = await findBestMatchingAvailability(admin, db, request, allAvailabilities);
        if (!bestMatch || bestMatch.availabilityId !== availabilityId) continue;

        const requestFrom = reqData.from;
        const requestUntil = reqData.until;
        const offerWindow = calculateOfferTimeWindow(
          requestFrom,
          requestUntil,
          bestMatch.from,
          bestMatch.until,
        );

        if (bestMatch.autoOffer === false) {
          try {
            await sendPushToUserByUid(
              admin,
              bestMatch.userId,
              'Potenzielle Übereinstimmung',
              `Eine Anfrage passt zu deiner aktivierten Verfügbarkeit (Parkplatz ${bestMatch.spotId})`,
              { type: 'potential_match', requestId: reqData.id, spotId: bestMatch.spotId, requestedBy: reqData.requestedBy },
            );
          } catch (e) {
            console.log('Push send (potential_match) failed:', e);
          }
          continue;
        }

        const offersCol = db.collection('parking_requests').doc(reqData.id).collection('offers');
        await offersCol.add({
          offererId: bestMatch.userId,
          spotId: bestMatch.spotId,
          from: admin.firestore.Timestamp.fromDate(offerWindow.from),
          until: admin.firestore.Timestamp.fromDate(offerWindow.until),
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const requestFromDate = requestFrom.toDate ? requestFrom.toDate() : new Date(requestFrom);
        const requestUntilDate = requestUntil.toDate ? requestUntil.toDate() : new Date(requestUntil);
        const isPartial =
          offerWindow.from.getTime() !== requestFromDate.getTime() ||
          offerWindow.until.getTime() !== requestUntilDate.getTime();

        try {
          await sendPushToUserByUid(
            admin,
            reqData.requestedBy,
            isPartial ? 'Teilweise automatisch gefunden' : 'Parkplatz automatisch gefunden!',
            isPartial
              ? `Ein passender Parkplatz ${bestMatch.spotId} wurde automatisch gefunden`
              : `Ein passender Parkplatz ${bestMatch.spotId} wurde automatisch für dich gefunden!`,
            { type: 'auto_match', requestId: reqData.id, spotId: bestMatch.spotId, offeredBy: bestMatch.userId },
          );
        } catch (e) {
          console.log('Push send (auto_match) failed:', e);
        }

        try {
          let requesterUsername = 'einem Nutzer';
          const requesterPublicDoc = await db.collection('users_public').doc(reqData.requestedBy).get();
          if (requesterPublicDoc.exists) requesterUsername = requesterPublicDoc.data()?.username || requesterUsername;
          const fmt = (d) =>
            new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
          const timeRangeStr = `${fmt(requestFromDate)} – ${fmt(requestUntilDate)}`;
          await sendPushToUserByUid(
            admin,
            bestMatch.userId,
            'Parkplatz automatisch vergeben',
            `Parkplatz ${bestMatch.spotId}, ${timeRangeStr}: an ${requesterUsername} vergeben`,
            { type: 'auto_match_offerer', requestId: reqData.id, spotId: bestMatch.spotId, requestedBy: reqData.requestedBy },
          );
        } catch (e) {
          console.log('Push send (auto_match_offerer) failed:', e);
        }
      }
    } catch (e) {
      console.error('[onAvailabilityUpdated] Matching failed:', e);
    }
  },
);

/**
 * Recompute coverage whenever an offer gets accepted/withdrawn.
 * A request becomes fulfilled ONLY when accepted offers cover the full [from, until] window without gaps.
 */
exports.onOfferUpdatedV2 = onDocumentUpdated(
  firestoreOpt('parking_requests/{requestId}/offers/{offerId}'),
  async (event) => {
    const requestId = event.params.requestId;
    const offerId = event.params.offerId;
    const before = (event.data && event.data.before && event.data.before.data()) || {};
    const after = (event.data && event.data.after && event.data.after.data()) || {};
    const reqRef = admin.firestore().collection('parking_requests').doc(requestId);
    const reqSnap = await reqRef.get();
    if (!reqSnap.exists) return;
    const reqData = reqSnap.data() || {};
    if (reqData.isArchived === true) return;
    if (reqData.isFulfilled === true) return;

    const reqFrom = reqData.from?.toDate ? reqData.from.toDate() : null;
    const reqUntil = reqData.until?.toDate ? reqData.until.toDate() : null;
    if (!reqFrom || !reqUntil) return;

    // Notify requester if an offer was withdrawn by offerer (not auto-withdrawn by system).
    const beforeStatus = before.status || 'active';
    const afterStatus = after.status || 'active';
    const withdrawnReason = after.withdrawnReason || null;
    if (beforeStatus !== 'withdrawn' && afterStatus === 'withdrawn' && withdrawnReason === 'offerer') {
      const requesterUid = reqData.requestedBy;
      if (typeof requesterUid === 'string' && requesterUid) {
        const spotId = after.spotId ? String(after.spotId) : '';
        const title = '⚠️ Angebot zurückgezogen';
        const body = spotId
          ? `Das Angebot für Parkplatz ${spotId} wurde zurückgezogen!`
          : 'Das Angebot für den Parkplatz wurde zurückgezogen!';
        try {
          await sendPushToUserByUid(admin, requesterUid, title, body, {
            type: 'offer_withdrawn',
            requestId: String(requestId),
            offerId: String(offerId),
          });
        } catch (e) {
          console.log('Push send (offer_withdrawn) failed:', e?.message ?? e);
        }
      }
      
      // If this was a full offer that was withdrawn, reactivate standby offers
      const wasFullOffer = reqData.fullOfferId === offerId;
      if (wasFullOffer && typeof reqData.offeredSpotId === 'string' && reqData.offeredSpotId.length > 0) {
        // Clear the full offer fields on the request
        await reqRef.set(
          {
            offeredSpotId: admin.firestore.FieldValue.delete(),
            offeredBy: admin.firestore.FieldValue.delete(),
            offeredAt: admin.firestore.FieldValue.delete(),
            fullOfferId: admin.firestore.FieldValue.delete(),
          },
          {merge: true},
        );
        
        // Reactivate standby offers
        const offersSnap = await reqRef.collection('offers').get();
        const batch = admin.firestore().batch();
        offersSnap.docs.forEach((d) => {
          const st = d.get('status') || 'active';
          if (st === 'standby') {
            batch.update(d.ref, {
              status: 'active',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        });
        await batch.commit();
      }
    }

    // If offer was updated (from/until changed) and is still active, check if it became a full offer
    const afterFrom = after.from?.toDate ? after.from.toDate() : null;
    const afterUntil = after.until?.toDate ? after.until.toDate() : null;
    if (afterStatus === 'active' && afterFrom && afterUntil) {
      const isFull = afterFrom.getTime() <= reqFrom.getTime() && afterUntil.getTime() >= reqUntil.getTime();
      if (isFull && (!reqData.offeredSpotId || reqData.fullOfferId === offerId)) {
        await reqRef.set(
          {
            offeredBy: after.offererId,
            offeredSpotId: after.spotId,
            offeredAt: admin.firestore.FieldValue.serverTimestamp(),
            fullOfferId: offerId,
          },
          {merge: true},
        );
        const offersCol = reqRef.collection('offers');
        const offersSnapStandby = await offersCol.get();
        const batchStandby = admin.firestore().batch();
        offersSnapStandby.docs.forEach((d) => {
          if (d.id === offerId) return;
          const st = d.get('status') || 'active';
          if (st !== 'active') return;
          batchStandby.update(d.ref, {
            status: 'standby',
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
        await batchStandby.commit();
      }
    }

    const offersSnap = await reqRef.collection('offers').get();
    const accepted = offersSnap.docs
      .filter((d) => (d.get('status') || 'active') === 'accepted')
      .map((d) => ({
        id: d.id,
        offererId: d.get('offererId'),
        spotId: d.get('spotId'),
        from: d.get('from')?.toDate ? d.get('from').toDate() : null,
        until: d.get('until')?.toDate ? d.get('until').toDate() : null,
      }))
      .filter((o) => o.from && o.until);

    if (!accepted.length) return;

    // Clamp and merge intervals
    const minT = reqFrom.getTime();
    const maxT = reqUntil.getTime();
    const intervals = accepted
      .map((o) => ({
        id: o.id,
        offererId: o.offererId,
        spotId: o.spotId,
        start: Math.max(o.from.getTime(), minT),
        end: Math.min(o.until.getTime(), maxT),
      }))
      .filter((i) => i.end > i.start)
      .sort((a, b) => a.start - b.start);

    if (!intervals.length) return;

    // Merge and detect gaps
    let cursor = minT;
    let currentEnd = cursor;
    for (const it of intervals) {
      if (it.start > currentEnd) {
        // gap
        break;
      }
      currentEnd = Math.max(currentEnd, it.end);
      if (currentEnd >= maxT) break;
    }

    const isCovered = currentEnd >= maxT;
    if (!isCovered) return;

    const fulfilledOfferIds = Array.from(new Set(intervals.map((i) => i.id)));
    const fulfilledSpotIds = Array.from(new Set(intervals.map((i) => String(i.spotId)).filter(Boolean)));
    const fulfilledByUserIds = Array.from(new Set(intervals.map((i) => String(i.offererId)).filter(Boolean)));

    await reqRef.set(
      {
        isFulfilled: true,
        fulfilledAt: admin.firestore.FieldValue.serverTimestamp(),
        fulfilledOfferIds,
        fulfilledSpotIds,
        fulfilledByUserIds,
        // Deterministic reminder time: exactly 30 minutes before end of window.
        reminder30mAt: admin.firestore.Timestamp.fromMillis(maxT - 30 * 60 * 1000),
      },
      {merge: true},
    );

    // Withdraw remaining active and standby offers, and notify standby offerers
    const batch = admin.firestore().batch();
    const standbyOffers = [];
    offersSnap.docs.forEach((d) => {
      const st = d.get('status') || 'active';
      if (st === 'active' || st === 'standby') {
        const isStandby = st === 'standby';
        batch.update(d.ref, {
          status: 'withdrawn',
          withdrawnReason: 'auto',
          withdrawnBy: 'system',
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (isStandby) {
          standbyOffers.push({
            offererId: d.get('offererId'),
            spotId: d.get('spotId'),
            offerId: d.id,
          });
        }
      }
    });
    await batch.commit();

    // Notify standby offerers that their offer was cancelled
    for (const standbyOffer of standbyOffers) {
      if (standbyOffer.offererId) {
        const spotId = standbyOffer.spotId ? String(standbyOffer.spotId) : '';
        const title = '⚠️ Teilangebot storniert';
        const body = spotId
          ? `Dein Teilangebot für Parkplatz ${spotId} wurde storniert, da ein vollständiges Angebot angenommen wurde.`
          : 'Dein Teilangebot wurde storniert, da ein vollständiges Angebot angenommen wurde.';
        try {
          await sendPushToUserByUid(admin, String(standbyOffer.offererId), title, body, {
            type: 'offer_cancelled',
            requestId: String(requestId),
            offerId: String(standbyOffer.offerId),
          });
        } catch (e) {
          console.log('Push send (offer_cancelled) failed:', e?.message ?? e);
        }
      }
    }
  },
);

/**
 * DSGVO: Abrufen aller Benutzerdaten (Art. 15 - Auskunftsrecht)
 */
exports.getUserDataHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const uid = decoded.uid;
  try {
    // User-Daten aus Firestore abrufen
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    const userData = userDoc.exists ? userDoc.data() : null;

    // Öffentliche User-Daten
    const publicUserDoc = await admin.firestore().collection('users_public').doc(uid).get();
    const publicUserData = publicUserDoc.exists ? publicUserDoc.data() : null;

    // Parkplatz-Anfragen des Users
    const requestsSnapshot = await admin.firestore()
      .collection('parking_requests')
      .where('requestedBy', '==', uid)
      .get();
    const requests = requestsSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Angebote des Users - durch alle Requests iterieren statt collectionGroup (um Index-Probleme zu vermeiden)
    const allRequestsForOffers = await admin.firestore()
      .collection('parking_requests')
      .get();
    const offers = [];
    for (const requestDoc of allRequestsForOffers.docs) {
      const offersSnapshot = await requestDoc.ref.collection('offers')
        .where('offererId', '==', uid)
        .get();
      offersSnapshot.docs.forEach(offerDoc => {
        offers.push({
          id: offerDoc.id,
          requestId: requestDoc.id,
          ...offerDoc.data(),
        });
      });
    }

    // Kommentare des Users - durch alle Requests iterieren statt collectionGroup (um Index-Probleme zu vermeiden)
    const allRequestsForComments = await admin.firestore()
      .collection('parking_requests')
      .get();
    const comments = [];
    for (const requestDoc of allRequestsForComments.docs) {
      const commentsSnapshot = await requestDoc.ref.collection('comments')
        .where('userId', '==', uid)
        .get();
      commentsSnapshot.docs.forEach(commentDoc => {
        comments.push({
          id: commentDoc.id,
          requestId: requestDoc.id,
          ...commentDoc.data(),
        });
      });
    }

    res.status(200).json({
      user: userData,
      publicUser: publicUserData,
      requests: requests,
      offers: offers,
      comments: comments,
    });
  } catch (e) {
    res.status(500).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});

/**
 * DSGVO: Löschen aller Benutzerdaten (Art. 17 - Recht auf Löschung)
 */
exports.deleteUserDataHttp = onRequest({invoker: 'public', region: REGION, cors: true}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const decoded = await requireAuth(admin, req, res);
  if (!decoded) return;

  const uid = decoded.uid;
  try {
    const batch = admin.firestore().batch();

    // User-Daten löschen
    const userRef = admin.firestore().collection('users').doc(uid);
    if ((await userRef.get()).exists) {
      batch.delete(userRef);
    }

    // Öffentliche User-Daten löschen
    const publicUserRef = admin.firestore().collection('users_public').doc(uid);
    if ((await publicUserRef.get()).exists) {
      batch.delete(publicUserRef);
    }

    // FCM Tokens löschen
    const tokensSnapshot = await admin.firestore()
      .collection('fcm_tokens')
      .where('userId', '==', uid)
      .get();
    tokensSnapshot.docs.forEach(doc => batch.delete(doc.ref));

    // Parkplatz-Anfragen des Users löschen (nur wenn der User der Requester ist)
    const requestsSnapshot = await admin.firestore()
      .collection('parking_requests')
      .where('requestedBy', '==', uid)
      .get();
    requestsSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
      // Subcollections (offers, comments) werden automatisch gelöscht
    });

    // Angebote des Users aus allen Requests entfernen
    const allRequestsSnapshot = await admin.firestore()
      .collection('parking_requests')
      .get();
    for (const requestDoc of allRequestsSnapshot.docs) {
      const offersSnapshot = await requestDoc.ref.collection('offers')
        .where('offererId', '==', uid)
        .get();
      offersSnapshot.docs.forEach(offerDoc => batch.delete(offerDoc.ref));
    }

    // Kommentare des Users aus allen Requests entfernen
    for (const requestDoc of allRequestsSnapshot.docs) {
      const commentsSnapshot = await requestDoc.ref.collection('comments')
        .where('userId', '==', uid)
        .get();
      commentsSnapshot.docs.forEach(commentDoc => batch.delete(commentDoc.ref));
    }

    await batch.commit();

    // Firebase Auth User löschen
    await admin.auth().deleteUser(uid);

    res.status(200).json({success: true, message: 'Alle Daten wurden erfolgreich gelöscht'});
  } catch (e) {
    res.status(500).json({error: {status: 'UNKNOWN', message: e?.message ?? String(e)}});
  }
});


