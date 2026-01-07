const functions = require('firebase-functions/v1');

function getBearerToken(req) {
  const h =
    (req.get && (req.get('authorization') || req.get('Authorization'))) ||
    req.headers?.authorization ||
    req.headers?.Authorization ||
    '';
  const m = String(h).match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAuth(admin, req, res) {
  const token = getBearerToken(req);
  if (!token) {
    res.status(401).json({error: {status: 'UNAUTHENTICATED', message: 'Login required'}});
    return null;
  }
  try {
    return await admin.auth().verifyIdToken(token);
  } catch (e) {
    res.status(401).json({error: {status: 'UNAUTHENTICATED', message: 'Login required'}});
    return null;
  }
}

async function sendPushToUserCore(admin, data) {
  const uid = data?.uid;
  if (typeof uid !== 'string' || !uid) {
    throw new functions.https.HttpsError('invalid-argument', 'uid required');
  }

  const title = data?.notification?.title ?? 'Parkplatz';
  const body = data?.notification?.body ?? '';
  const payloadData = data?.data && typeof data.data === 'object' ? data.data : {};

  const tokensSnap = await admin
    .firestore()
    .collection('users')
    .doc(uid)
    .collection('fcm_tokens')
    .get();

  const tokens = tokensSnap.docs
    .map((d) => d.get('token'))
    .filter((t) => typeof t === 'string' && t.length > 0);

  if (tokens.length === 0) {
    return {sent: 0, removed: 0};
  }

  const message = {
    tokens,
    notification: {title, body},
    data: Object.fromEntries(Object.entries(payloadData).map(([k, v]) => [String(k), String(v)])),
  };

  const sendRes = await admin.messaging().sendEachForMulticast(message);

  // Cleanup invalid tokens
  const invalid = [];
  sendRes.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        invalid.push(tokens[idx]);
      }
    }
  });

  let removed = 0;
  if (invalid.length) {
    const batch = admin.firestore().batch();
    invalid.forEach((token) => {
      const tokenId = String(token).replace(/\//g, '_');
      batch.delete(admin.firestore().collection('users').doc(uid).collection('fcm_tokens').doc(tokenId));
    });
    await batch.commit();
    removed = invalid.length;
  }

  return {sent: sendRes.successCount, removed};
}

async function sendPushToUserByUid(admin, uid, title, body, payloadData) {
  return await sendPushToUserCore(admin, {
    uid,
    notification: {title, body},
    data: payloadData || {},
  });
}

async function sendPushToAllCore(admin, data) {
  const title = data?.notification?.title ?? 'Parkplatz';
  const body = data?.notification?.body ?? '';
  const payloadData = data?.data && typeof data.data === 'object' ? data.data : {};
  const facilityCode = data?.facilityCode;
  const excludeUserId = data?.excludeUserId;

  // If facilityCode is provided, send only to users with that facilityCode
  if (facilityCode) {
    const usersSnap = await admin
      .firestore()
      .collection('users')
      .where('facilityCode', '==', facilityCode)
      .get();

    const tokens = [];
    for (const userDoc of usersSnap.docs) {
      if (excludeUserId && userDoc.id === excludeUserId) continue;
      const tokensSnap = await admin
        .firestore()
        .collection('users')
        .doc(userDoc.id)
        .collection('fcm_tokens')
        .get();
      tokensSnap.docs.forEach((tokenDoc) => {
        const token = tokenDoc.get('token');
        if (typeof token === 'string' && token.length > 0) {
          tokens.push(token);
        }
      });
    }

    if (tokens.length === 0) {
      return {sent: 0};
    }

    const message = {
      tokens,
      notification: {title, body},
      data: Object.fromEntries(Object.entries(payloadData).map(([k, v]) => [String(k), String(v)])),
    };

    const sendRes = await admin.messaging().sendEachForMulticast(message);
    return {sent: sendRes.successCount};
  }

  // Fallback: send to topic 'all' (for backward compatibility)
  const message = {
    topic: 'all',
    notification: {title, body},
    data: Object.fromEntries(Object.entries(payloadData).map(([k, v]) => [String(k), String(v)])),
  };

  const messageId = await admin.messaging().send(message);
  return {messageId};
}

module.exports = {
  requireAuth,
  sendPushToUserCore,
  sendPushToUserByUid,
  sendPushToAllCore,
};


