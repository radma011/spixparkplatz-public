function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Returns the end Date of the last occurrence for a recurring availability, or null if infinite.
 * For one-time availabilities, use doc.until directly.
 * @param {object} av - availability doc with from, until (Timestamps), recurrence
 * @returns {Date|null} - end of last occurrence, or null if no end (infinite recurrence)
 */
function getLastOccurrenceEnd(av) {
  const rec = av.recurrence;
  if (!rec) return null;

  const from = av.from.toDate ? av.from.toDate() : new Date(av.from);
  const until = av.until.toDate ? av.until.toDate() : new Date(av.until);
  const endDate = rec.endDate ? (rec.endDate.toDate ? rec.endDate.toDate() : new Date(rec.endDate)) : null;
  const occurrences = rec.occurrences != null ? rec.occurrences : null;
  const pattern = rec.pattern || 'daily';
  const interval = rec.interval || 1;

  if (!endDate && occurrences == null) return null;

  const durationMs = until.getTime() - from.getTime();
  const startHours = from.getHours();
  const startMinutes = from.getMinutes();

  let lastStart = null;
  let count = 0;
  let current = new Date(from);
  current.setHours(startHours, startMinutes, 0, 0);

  const maxIter = 10000;
  let iter = 0;

  if (pattern === 'daily') {
    while (iter++ < maxIter) {
      if (endDate && current > endDate) break;
      if (occurrences != null && count >= occurrences) break;
      lastStart = new Date(current);
      count++;
      current.setDate(current.getDate() + interval);
      current.setHours(startHours, startMinutes, 0, 0);
    }
  } else if (pattern === 'weekly') {
    while (iter++ < maxIter) {
      if (endDate && current > endDate) break;
      if (occurrences != null && count >= occurrences) break;
      lastStart = new Date(current);
      count++;
      current.setDate(current.getDate() + 7 * interval);
      current.setHours(startHours, startMinutes, 0, 0);
    }
  } else if (pattern === 'monthly') {
    while (iter++ < maxIter) {
      if (endDate && current > endDate) break;
      if (occurrences != null && count >= occurrences) break;
      lastStart = new Date(current);
      count++;
      current.setMonth(current.getMonth() + interval);
      current.setHours(startHours, startMinutes, 0, 0);
    }
  } else {
    return null;
  }

  if (!lastStart) return null;
  const lastEnd = new Date(lastStart.getTime() + durationMs);
  return lastEnd;
}

/**
 * Format time as HH:mm in Europe/Berlin timezone.
 * @param {Date} date - Date object (typically in UTC from Firestore)
 * @returns {string} - Formatted time like "21:00"
 */
function formatTimeHHmm(date) {
  // Use Intl.DateTimeFormat to format in Europe/Berlin timezone
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Main maintenance runner.
 *
 * Keep it deterministic and testable:
 * - inject db + "sendPushToUser"
 * - "dryRun" performs no writes and sends no pushes
 */
async function runScheduledParkingMaintenance({admin, db, nowMs, sendPushToUser, dryRun = false}) {
  // ---- (1) 30-min reminders for fulfilled requests ----
  // Primary: deterministic reminder time (`reminder30mAt`) which is computed server-side at fulfillment.
  // Window is sized to scheduler interval (5 min) + a small skew buffer.
  const reminderAtFromMs = nowMs - 60 * 1000; // allow 1 min skew
  const reminderAtToMs = nowMs + 6 * 60 * 1000; // cover next tick even if delayed
  const reminderAtFromTs = admin.firestore.Timestamp.fromMillis(reminderAtFromMs);
  const reminderAtToTs = admin.firestore.Timestamp.fromMillis(reminderAtToMs);

  // Fallback for already-fulfilled historical docs that don't have reminder30mAt yet:
  // look for `until` in 30-35 minutes.
  const fallbackFromMs = nowMs + 30 * 60 * 1000;
  const fallbackToMs = nowMs + 35 * 60 * 1000;
  const fallbackFromTs = admin.firestore.Timestamp.fromMillis(fallbackFromMs);
  const fallbackToTs = admin.firestore.Timestamp.fromMillis(fallbackToMs);

  // De-dup via a short-lived claim to avoid multiple sends across concurrent scheduler runs.
  const claimTtlMs = 10 * 60 * 1000;

  const reminderStats = {candidates: 0, claimed: 0, sent: 0, skipped: 0};

  try {
    // IMPORTANT: Keep queries index-free (single-field index on each field is built-in).
    const byReminderAtSnap = await db
      .collection('parking_requests')
      .where('reminder30mAt', '>=', reminderAtFromTs)
      .where('reminder30mAt', '<=', reminderAtToTs)
      .orderBy('reminder30mAt', 'asc')
      .limit(200)
      .get();

    const byUntilFallbackSnap = await db
      .collection('parking_requests')
      .where('until', '>=', fallbackFromTs)
      .where('until', '<=', fallbackToTs)
      .orderBy('until', 'asc')
      .limit(200)
      .get();

    // Merge + de-duplicate by doc id
    const seenIds = new Set();
    const candidates = [];
    for (const d of byReminderAtSnap.docs) {
      if (seenIds.has(d.id)) continue;
      seenIds.add(d.id);
      candidates.push(d);
    }
    for (const d of byUntilFallbackSnap.docs) {
      if (seenIds.has(d.id)) continue;
      seenIds.add(d.id);
      candidates.push(d);
    }

    for (const doc of candidates) {
      reminderStats.candidates++;
      const data = doc.data() || {};

      // Filter in code (avoids composite index).
      if (data.isArchived === true) {
        reminderStats.skipped++;
        continue;
      }
      if (data.isFulfilled !== true) {
        reminderStats.skipped++;
        continue;
      }

      const until = data.until?.toDate ? data.until.toDate() : null;
      if (!until) {
        reminderStats.skipped++;
        continue;
      }
      const untilMs = until.getTime();
      if (untilMs <= nowMs) {
        reminderStats.skipped++;
        continue;
      }

      // Quick skip if already sent for this exact until timestamp.
      if (Number(data.reminder30mSentForUntilMs || 0) === untilMs) {
        reminderStats.skipped++;
        continue;
      }

      // In dryRun, do NOT claim or write anything (preview only).
      const ref = doc.ref;
      if (!dryRun) {
        const claimed = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          if (!snap.exists) return false;
          const cur = snap.data() || {};

          if (cur.isArchived === true) return false;
          if (cur.isFulfilled !== true) return false;

          const curUntil = cur.until?.toDate ? cur.until.toDate() : null;
          const curUntilMs = curUntil ? curUntil.getTime() : null;
          if (!curUntilMs) return false;

          const sentFor = Number(cur.reminder30mSentForUntilMs || 0);
          if (sentFor === curUntilMs) return false;

          // If reminder30mAt is present, only send within our scheduler window.
          const curReminderAt = cur.reminder30mAt?.toDate ? cur.reminder30mAt.toDate() : null;
          if (curReminderAt) {
            const curReminderAtMs = curReminderAt.getTime();
            if (curReminderAtMs < reminderAtFromMs || curReminderAtMs > reminderAtToMs) return false;
          }

          const claimedFor = Number(cur.reminder30mClaimedForUntilMs || 0);
          const claimedAtMs = cur.reminder30mClaimedAt?.toMillis ? cur.reminder30mClaimedAt.toMillis() : 0;
          if (claimedFor === curUntilMs && claimedAtMs && nowMs - claimedAtMs < claimTtlMs) {
            return false;
          }

          tx.set(
            ref,
            {
              reminder30mClaimedForUntilMs: curUntilMs,
              reminder30mClaimedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            {merge: true},
          );
          return true;
        });

        if (!claimed) {
          reminderStats.skipped++;
          continue;
        }
        reminderStats.claimed++;
      }

      const requesterUid = typeof data.requestedBy === 'string' ? data.requestedBy : '';
      const offeredBy = typeof data.offeredBy === 'string' ? data.offeredBy : '';
      const fulfilledBy = Array.isArray(data.fulfilledByUserIds) ? data.fulfilledByUserIds : [];
      const recipients = new Set(
        [requesterUid, offeredBy, ...fulfilledBy].map((x) => String(x || '').trim()).filter((x) => x.length > 0),
      );

      if (recipients.size === 0) {
        reminderStats.skipped++;
        continue;
      }

      const spotIds = Array.isArray(data.fulfilledSpotIds)
        ? data.fulfilledSpotIds.map((s) => String(s)).filter(Boolean)
        : data.offeredSpotId
          ? [String(data.offeredSpotId)]
          : [];
      const spotLabel = spotIds.length ? ` (P ${spotIds.join(', ')})` : '';

      const title = '⏰ Erinnerung';
      const body = `Parkzeit endet um ${formatTimeHHmm(until)} (in ca. 30 Min)${spotLabel}`;

      if (dryRun) {
        reminderStats.sent++;
      } else {
        await Promise.all(
          Array.from(recipients).map(async (uid) => {
            try {
              await sendPushToUser(uid, title, body, {
                type: 'parking_end_reminder_30m',
                requestId: String(doc.id),
                untilMs: String(untilMs),
              });
            } catch (e) {
              console.log('Push send (reminder30m) failed:', uid, e?.message ?? e);
            }
          }),
        );

        reminderStats.sent++;

        await ref.set(
          {
            reminder30mSentForUntilMs: untilMs,
            reminder30mSentAt: admin.firestore.FieldValue.serverTimestamp(),
            reminder30mClaimedForUntilMs: admin.firestore.FieldValue.delete(),
            reminder30mClaimedAt: admin.firestore.FieldValue.delete(),
          },
          {merge: true},
        );
      }
    }
  } catch (e) {
    console.log('scheduledParkingMaintenance reminder pass failed:', e?.message ?? e);
  }

  // ---- (2) Auto-archive requests 3 hours after end ----
  const archiveThresholdMs = nowMs - 3 * 60 * 60 * 1000;
  const archiveThresholdTs = admin.firestore.Timestamp.fromMillis(archiveThresholdMs);
  let archivedCount = 0;

  try {
    const expiredSnap = await db
      .collection('parking_requests')
      .where('until', '<=', archiveThresholdTs)
      .orderBy('until', 'asc')
      .limit(200)
      .get();

    if (!expiredSnap.empty) {
      const batch = db.batch();
      expiredSnap.docs.forEach((d) => {
        const data = d.data() || {};
        if (data.isArchived === true) return;
        archivedCount++;
        if (!dryRun) {
          batch.set(
            d.ref,
            {
              isArchived: true,
              archivedBy: 'system',
              archivedAt: admin.firestore.FieldValue.serverTimestamp(),
              archivedReason: 'auto_expired',
            },
            {merge: true},
          );
        }
      });
      if (!dryRun) {
        await batch.commit();
      }
    }
  } catch (e) {
    console.log('scheduledParkingMaintenance archive pass failed:', e?.message ?? e);
  }

  // ---- (3) Auto-archive availabilities 24h after end ----
  // One-time: 24h after until. Recurring: 24h after end of last occurrence (only if endDate or occurrences set).
  const availabilityArchiveThresholdMs = nowMs - 24 * 60 * 60 * 1000;
  const availabilityArchiveThresholdTs = admin.firestore.Timestamp.fromMillis(availabilityArchiveThresholdMs);
  let archivedAvailabilitiesCount = 0;

  try {
    const availabilitiesSnap = await db
      .collection('parking_availabilities')
      .limit(300)
      .get();

    const toArchive = [];
    for (const d of availabilitiesSnap.docs) {
      const data = d.data() || {};
      if (data.isArchived === true) continue;

      const hasRecurrence = data.recurrence && typeof data.recurrence === 'object';
      let shouldArchive = false;

      if (!hasRecurrence) {
        const until = data.until?.toDate ? data.until.toDate() : null;
        if (until && until.getTime() <= availabilityArchiveThresholdMs) {
          shouldArchive = true;
        }
      } else {
        const lastEnd = getLastOccurrenceEnd({...data, from: data.from, until: data.until});
        if (lastEnd != null && lastEnd.getTime() <= availabilityArchiveThresholdMs) {
          shouldArchive = true;
        }
      }

      if (shouldArchive) {
        toArchive.push(d.ref);
      }
    }

    if (toArchive.length > 0 && !dryRun) {
      const batch = db.batch();
      toArchive.forEach((ref) => {
        batch.set(
          ref,
          {
            isArchived: true,
            archivedBy: 'system',
            archivedAt: admin.firestore.FieldValue.serverTimestamp(),
            archivedReason: 'auto_expired_24h',
          },
          {merge: true},
        );
      });
      await batch.commit();
      archivedAvailabilitiesCount = toArchive.length;
    } else if (toArchive.length > 0 && dryRun) {
      archivedAvailabilitiesCount = toArchive.length;
    }
  } catch (e) {
    console.log('scheduledParkingMaintenance availability archive pass failed:', e?.message ?? e);
  }

  return {reminder: reminderStats, archivedCount, archivedAvailabilitiesCount};
}

module.exports = {
  runScheduledParkingMaintenance,
};


