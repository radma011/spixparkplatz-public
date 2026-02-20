/**
 * Availability matching logic for automatic offer creation
 * Ported from src/utils/availabilityMatching.ts
 */

/**
 * Calculate next occurrences for recurring availabilities.
 * When requestFromTime/requestUntilTime are provided, includes occurrences that OVERLAP
 * the request window (so same-day windows that already started are still included).
 */
function calculateNextOccurrences(startDate, startTime, endTime, recurrence, count = 10, requestFromTime = null, requestUntilTime = null) {
  const occurrences = [];
  const now = new Date();
  const useRequestOverlap = requestFromTime != null && requestUntilTime != null;

  function occurrenceEnd(occurrenceStart) {
    const end = new Date(occurrenceStart);
    end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    if (end <= occurrenceStart) end.setDate(end.getDate() + 1);
    return end.getTime();
  }

  function overlapsRequest(occStart, occEndMs) {
    return occEndMs > requestFromTime && occStart.getTime() < requestUntilTime;
  }

  const startHours = startTime.getHours();
  const startMinutes = startTime.getMinutes();
  const endHours = endTime.getHours();
  const endMinutes = endTime.getMinutes();

  let currentDate = new Date(startDate);
  currentDate.setHours(startHours, startMinutes, 0, 0);

  const interval = recurrence.interval || 1;
  let iterations = 0;
  const maxIterations = 1000;

  // Helper: Get Monday of the week (Monday-first)
  function getMondayOfWeek(date) {
    const monday = new Date(date);
    const day = date.getDay(); // 0=Sunday, 1=Monday, ..., 6=Saturday
    const daysFromMonday = day === 0 ? 6 : day - 1; // Sunday = 6 days from Monday
    monday.setDate(date.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  if (recurrence.pattern === 'weekly' && recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
    let checkDate = new Date(Math.max(now.getTime(), startDate.getTime()));
    checkDate.setHours(0, 0, 0, 0);
    if (useRequestOverlap && requestFromTime < checkDate.getTime()) {
      checkDate = new Date(requestFromTime);
      checkDate.setHours(0, 0, 0, 0);
      if (checkDate.getTime() < startDate.getTime()) checkDate = new Date(startDate);
    }
    
    // Calculate start week (Monday of the week containing startDate)
    const startWeekStart = getMondayOfWeek(startDate);
    
    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;
      
      for (const dayOfWeek of recurrence.daysOfWeek) {
        const testDate = new Date(checkDate);
        // Get the Monday of current week
        const weekStart = getMondayOfWeek(testDate);
        const targetDate = new Date(weekStart);
        // Convert JS dayOfWeek to days from Monday: 0=So -> +6, 1=Mo -> +0, 2=Di -> +1, etc.
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        targetDate.setDate(weekStart.getDate() + daysFromMonday);
        targetDate.setHours(startHours, startMinutes, 0, 0);
        
        if (targetDate < startDate) continue;
        
        const weeksDiff = Math.floor(
          (weekStart.getTime() - startWeekStart.getTime()) / (1000 * 60 * 60 * 24 * 7),
        );
        if (weeksDiff < 0 || weeksDiff % interval !== 0) continue;
        
        if (recurrence.endDate) {
          const endDate = new Date(recurrence.endDate);
          endDate.setHours(23, 59, 59, 999);
          if (targetDate > endDate) continue;
        }
        
        if (recurrence.occurrences && occurrences.length >= recurrence.occurrences) {
          break;
        }

        const includeByTime = useRequestOverlap
          ? overlapsRequest(targetDate, occurrenceEnd(targetDate))
          : targetDate >= now;
        if (includeByTime && !occurrences.some((occ) => occ.getTime() === targetDate.getTime())) {
          occurrences.push(new Date(targetDate));
          if (occurrences.length >= count) break;
        }
      }

      checkDate.setDate(checkDate.getDate() + 7);
    }
  } else {
    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;
      let matches = false;
      
      switch (recurrence.pattern) {
        case 'daily':
          const daysDiff = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          matches = daysDiff >= 0 && daysDiff % interval === 0;
          break;
        case 'weekly':
          const weeksDiff = Math.floor(
            (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7),
          );
          matches = weeksDiff >= 0 && weeksDiff % interval === 0;
          break;
        case 'monthly':
          if (currentDate.getDate() === startDate.getDate()) {
            const monthsDiff =
              (currentDate.getFullYear() - startDate.getFullYear()) * 12 +
              (currentDate.getMonth() - startDate.getMonth());
            matches = monthsDiff >= 0 && monthsDiff % interval === 0;
          }
          break;
      }
      
      if (matches && recurrence.endDate) {
        const endDate = new Date(recurrence.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (currentDate > endDate) break;
      }
      
      if (matches && recurrence.occurrences) {
        if (occurrences.length >= recurrence.occurrences) break;
      }

      const occEndMs = occurrenceEnd(currentDate);
      const includeByTime = useRequestOverlap
        ? overlapsRequest(currentDate, occEndMs)
        : currentDate >= now;
      if (matches && includeByTime) {
        occurrences.push(new Date(currentDate));
      }

      currentDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHours, startMinutes, 0, 0);
    }
  }
  
  return occurrences.slice(0, count);
}

/**
 * Expand recurring availability into time windows
 */
function expandRecurringAvailability(availability, requestFrom, requestUntil) {
  if (!availability.recurrence) {
    return [{
      availabilityId: availability.id,
      userId: availability.userId,
      spotId: availability.spotId,
      from: availability.from.toDate(),
      until: availability.until.toDate(),
      autoOffer: availability.autoOffer !== false, // default true
      username: availability.username,
      phone: availability.phone,
    }];
  }
  
  const startDate = new Date(availability.from.toDate());
  startDate.setHours(0, 0, 0, 0);
  
  const startTime = availability.from.toDate();
  const endTime = availability.until.toDate();
  
  const reqFromTime = requestFrom.toDate ? requestFrom.toDate().getTime() : requestFrom.getTime();
  const reqUntilTime = requestUntil.toDate ? requestUntil.toDate().getTime() : requestUntil.getTime();

  const occurrences = calculateNextOccurrences(
    startDate,
    startTime,
    endTime,
    availability.recurrence,
    100,
    reqFromTime,
    reqUntilTime,
  );

  const windows = [];
  
  for (const occurrenceStart of occurrences) {
    const occurrenceEnd = new Date(occurrenceStart);
    occurrenceEnd.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    
    if (occurrenceEnd <= occurrenceStart) {
      occurrenceEnd.setDate(occurrenceEnd.getDate() + 1);
    }
    
    const occStartTime = occurrenceStart.getTime();
    const occEndTime = occurrenceEnd.getTime();
    
    if (occEndTime > reqFromTime && occStartTime < reqUntilTime) {
      windows.push({
        availabilityId: availability.id,
        userId: availability.userId,
        spotId: availability.spotId,
        from: occurrenceStart,
        until: occurrenceEnd,
        autoOffer: availability.autoOffer !== false,
        username: availability.username,
        phone: availability.phone,
        occurrenceDate: occurrenceStart,
      });
    }
    
    if (occurrenceStart.getTime() > reqUntilTime) break;
  }
  
  return windows;
}

/**
 * Check if two time ranges overlap
 */
function overlaps(requestFrom, requestUntil, windowFrom, windowUntil) {
  const reqFrom = requestFrom.toDate ? requestFrom.toDate().getTime() : requestFrom.getTime();
  const reqUntil = requestUntil.toDate ? requestUntil.toDate().getTime() : requestUntil.getTime();
  const winFrom = windowFrom.toDate ? windowFrom.toDate().getTime() : windowFrom.getTime();
  const winUntil = windowUntil.toDate ? windowUntil.toDate().getTime() : windowUntil.getTime();
  
  return reqFrom < winUntil && reqUntil > winFrom;
}

/**
 * Calculate overlap percentage
 */
function calculateOverlapPercentage(requestFrom, requestUntil, windowFrom, windowUntil) {
  const reqFrom = requestFrom.toDate ? requestFrom.toDate().getTime() : requestFrom.getTime();
  const reqUntil = requestUntil.toDate ? requestUntil.toDate().getTime() : requestUntil.getTime();
  const winFrom = windowFrom.toDate ? windowFrom.toDate().getTime() : windowFrom.getTime();
  const winUntil = windowUntil.toDate ? windowUntil.toDate().getTime() : windowUntil.getTime();
  
  const requestDuration = reqUntil - reqFrom;
  if (requestDuration <= 0) return 0;
  
  const overlapStart = Math.max(reqFrom, winFrom);
  const overlapEnd = Math.min(reqUntil, winUntil);
  const overlapDuration = Math.max(0, overlapEnd - overlapStart);
  
  return overlapDuration / requestDuration;
}

/**
 * Calculate match score
 */
function calculateMatchScore(requestFrom, requestUntil, window) {
  let score = 0;
  
  const reqFrom = requestFrom.toDate ? requestFrom.toDate().getTime() : requestFrom.getTime();
  const reqUntil = requestUntil.toDate ? requestUntil.toDate().getTime() : requestUntil.getTime();
  const winFrom = window.from.getTime ? window.from.getTime() : new Date(window.from).getTime();
  const winUntil = window.until.getTime ? window.until.getTime() : new Date(window.until).getTime();
  
  // Priority 1: Start time matches
  const startDiff = Math.abs(reqFrom - winFrom);
  if (startDiff === 0) {
    score += 1000;
  } else if (startDiff <= 15 * 60 * 1000) {
    score += 500 - (startDiff / (15 * 60 * 1000)) * 500;
  }
  
  // Priority 2: End time matches
  const endDiff = Math.abs(reqUntil - winUntil);
  if (endDiff === 0) {
    score += 800;
  } else if (endDiff <= 15 * 60 * 1000) {
    score += 400 - (endDiff / (15 * 60 * 1000)) * 400;
  }
  
  // Priority 3: Request fills as much of availability as possible
  const overlapPercentage = calculateOverlapPercentage(requestFrom, requestUntil, window.from, window.until);
  score += overlapPercentage * 300;
  
  // Priority 4: Any overlap
  if (overlaps(requestFrom, requestUntil, window.from, window.until)) {
    score += 100;
  }
  
  return score;
}

/**
 * Check if spot is blocked by checking fulfilled requests, active offers, and offers in subcollections
 * Allows 1-minute tolerance for overlaps (if booking ends at 18:00, next can start at 18:00)
 */
async function isTimeWindowBlocked(admin, db, spotId, facilityCode, from, until, excludeRequestId) {
  const fromTs = admin.firestore.Timestamp.fromDate(from);
  const untilTs = admin.firestore.Timestamp.fromDate(until);
  const oneMinuteMs = 60 * 1000;
  const toleranceMs = oneMinuteMs; // 1 minute tolerance for overlaps
  
  // Check fulfilled requests
  const fulfilledQuery = db
    .collection('parking_requests')
    .where('facilityCode', '==', facilityCode)
    .where('isFulfilled', '==', true)
    .where('until', '>', admin.firestore.Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000))
    .limit(100);
  
  const fulfilledSnap = await fulfilledQuery.get();
  
  for (const doc of fulfilledSnap.docs) {
    if (excludeRequestId && doc.id === excludeRequestId) continue;
    const data = doc.data();
    if (data.isArchived === true) continue;
    
    const fulfilledSpots = data.fulfilledSpotIds || [];
    if (!fulfilledSpots.includes(spotId)) continue;
    
    const reqFrom = data.from?.toDate ? data.from.toDate() : null;
    const reqUntil = data.until?.toDate ? data.until.toDate() : null;
    if (!reqFrom || !reqUntil) continue;
    
    // Check overlap with 1-minute tolerance
    // If existing booking ends at 18:00, new booking can start at 18:00
    const existingEndsAt = reqUntil.getTime();
    const existingStartsAt = reqFrom.getTime();
    const newStartsAt = from.getTime();
    const newEndsAt = until.getTime();
    
    // Calculate overlap
    const overlapStart = Math.max(newStartsAt, existingStartsAt);
    const overlapEnd = Math.min(newEndsAt, existingEndsAt);
    const overlapMs = overlapEnd - overlapStart;
    
    // If there's no overlap (or overlap is within tolerance), allow it
    // Case 1: New starts after existing ends (with tolerance)
    const timeGapStart = newStartsAt - existingEndsAt;
    if (timeGapStart >= -toleranceMs && timeGapStart <= toleranceMs) {
      // New starts within tolerance of existing end, no blocking
      continue;
    }
    
    // Case 2: New ends before existing starts (with tolerance)
    const timeGapEnd = existingStartsAt - newEndsAt;
    if (timeGapEnd >= -toleranceMs && timeGapEnd <= toleranceMs) {
      // New ends within tolerance of existing start, no blocking
      continue;
    }
    
    // Case 3: If there's actual overlap beyond tolerance, block it
    if (overlapMs > toleranceMs) {
      console.log(`[isTimeWindowBlocked] Blocked by fulfilled request ${doc.id}: overlap=${overlapMs}ms, gapStart=${timeGapStart}ms, gapEnd=${timeGapEnd}ms`);
      return true; // Blocked
    }
  }
  
  // Check active offers in offers subcollections
  // NOTE: We check offers subcollections (not requests with offeredSpotId) because:
  // - Requests with offeredSpotId use the REQUEST window (08:00-10:00), not the OFFER window
  // - The actual blocked time is the OFFER window, which is stored in the offers subcollection
  // - This allows partial availability: if availability is 08:00-12:00 and one offer covers 08:00-10:00,
  //   the remaining 10:00-12:00 window should still be available for new requests
  // This is the key fix: we need to check all requests with active offers for this spot
  const requestsWithOffersQuery = db
    .collection('parking_requests')
    .where('facilityCode', '==', facilityCode)
    .where('until', '>', admin.firestore.Timestamp.fromMillis(Date.now() - 14 * 24 * 60 * 60 * 1000))
    .limit(100);
  
  const requestsWithOffersSnap = await requestsWithOffersQuery.get();
  
  console.log(`[isTimeWindowBlocked] Checking ${requestsWithOffersSnap.docs.length} requests for active offers on spot ${spotId}`);
  
  for (const requestDoc of requestsWithOffersSnap.docs) {
    if (excludeRequestId && requestDoc.id === excludeRequestId) continue;
    const requestData = requestDoc.data();
    if (requestData.isArchived === true) continue;
    if (requestData.isFulfilled === true) continue;
    
    // Check offers subcollection for this request
    // Include both 'active' and 'accepted' offers (accepted offers also block the spot)
    const offersCol = requestDoc.ref.collection('offers');
    const offersQuery = offersCol
      .where('spotId', '==', spotId)
      .limit(10);
    
    const offersSnap = await offersQuery.get();
    
    if (offersSnap.docs.length > 0) {
      console.log(`[isTimeWindowBlocked] Found ${offersSnap.docs.length} active offers for spot ${spotId} in request ${requestDoc.id}`);
    }
    
    for (const offerDoc of offersSnap.docs) {
      const offerData = offerDoc.data();
      const offerStatus = offerData.status || 'active';
      // Only check active and accepted offers (withdrawn/standby don't block)
      if (offerStatus !== 'active' && offerStatus !== 'accepted') continue;
      
      const offerFrom = offerData.from?.toDate ? offerData.from.toDate() : null;
      const offerUntil = offerData.until?.toDate ? offerData.until.toDate() : null;
      if (!offerFrom || !offerUntil) continue;
      
      // Check overlap with 1-minute tolerance
      const existingEndsAt = offerUntil.getTime();
      const existingStartsAt = offerFrom.getTime();
      const newStartsAt = from.getTime();
      const newEndsAt = until.getTime();
      
      // Calculate overlap
      const overlapStart = Math.max(newStartsAt, existingStartsAt);
      const overlapEnd = Math.min(newEndsAt, existingEndsAt);
      const overlapMs = overlapEnd - overlapStart;
      
      // If there's no overlap (or overlap is within tolerance), allow it
      // Case 1: New starts after existing ends (with tolerance)
      const timeGapStart = newStartsAt - existingEndsAt;
      if (timeGapStart >= -toleranceMs && timeGapStart <= toleranceMs) {
        // New starts within tolerance of existing end, no blocking
        continue;
      }
      
      // Case 2: New ends before existing starts (with tolerance)
      const timeGapEnd = existingStartsAt - newEndsAt;
      if (timeGapEnd >= -toleranceMs && timeGapEnd <= toleranceMs) {
        // New ends within tolerance of existing start, no blocking
        continue;
      }
      
      // Case 3: If there's actual overlap beyond tolerance, block it
      if (overlapMs > toleranceMs) {
        console.log(`[isTimeWindowBlocked] Blocked by active offer ${offerDoc.id} in request ${requestDoc.id}: overlap=${overlapMs}ms, gapStart=${timeGapStart}ms, gapEnd=${timeGapEnd}ms`);
        return true; // Blocked
      }
    }
  }
  
  return false; // Not blocked
}

/**
 * Find best matching availability for a request
 */
async function findBestMatchingAvailability(admin, db, request, availabilities) {
  const requestFrom = request.from;
  const requestUntil = request.until;
  const allWindows = [];
  
  console.log(`[findBestMatchingAvailability] Checking ${availabilities.length} availabilities`);
  
  for (const availability of availabilities) {
    if (!availability.isActive || availability.isMatched) {
      console.log(`[findBestMatchingAvailability] Skipping availability ${availability.id}: isActive=${availability.isActive}, isMatched=${availability.isMatched}`);
      continue;
    }
    if (availability.userId === request.requestedBy) {
      console.log(`[findBestMatchingAvailability] Skipping availability ${availability.id}: same user`);
      continue;
    }
    const avCode = String(availability.facilityCode || '').trim().toUpperCase();
    const reqCode = String(request.facilityCode || '').trim().toUpperCase();
    if (avCode !== reqCode) {
      console.log(`[findBestMatchingAvailability] Skipping availability ${availability.id}: facilityCode mismatch (av=${avCode}, req=${reqCode})`);
      continue;
    }
    
    const windows = expandRecurringAvailability(availability, requestFrom, requestUntil);
    console.log(`[findBestMatchingAvailability] Availability ${availability.id} expanded to ${windows.length} windows`);
    
    for (const window of windows) {
      if (!overlaps(requestFrom, requestUntil, window.from, window.until)) {
        console.log(`[findBestMatchingAvailability] Window doesn't overlap`);
        continue;
      }
      
      // Check if the REQUEST window (not the availability window) is blocked
      // This allows partial availability: if availability is 08:00-12:00 and one offer covers 08:00-10:00,
      // the request for 10:00-12:00 should still be allowed
      const reqFromDate = requestFrom.toDate ? requestFrom.toDate() : new Date(requestFrom);
      const reqUntilDate = requestUntil.toDate ? requestUntil.toDate() : new Date(requestUntil);
      
      const isBlocked = await isTimeWindowBlocked(
        admin,
        db,
        window.spotId,
        request.facilityCode,
        reqFromDate,
        reqUntilDate,
        request.id,
      );
      
      if (isBlocked) {
        console.log(`[findBestMatchingAvailability] Request window ${reqFromDate.toISOString()} - ${reqUntilDate.toISOString()} is blocked for spot ${window.spotId}`);
        continue;
      }
      
      allWindows.push(window);
    }
  }
  
  console.log(`[findBestMatchingAvailability] Found ${allWindows.length} valid windows`);
  
  if (allWindows.length === 0) return null;
  
  // Calculate scores
  const scoredWindows = allWindows.map((window) => ({
    window,
    score: calculateMatchScore(requestFrom, requestUntil, window),
  }));
  
  // Sort by score (highest first)
  scoredWindows.sort((a, b) => b.score - a.score);
  
  console.log(`[findBestMatchingAvailability] Best match score: ${scoredWindows[0].score}`);
  
  return scoredWindows[0].window;
}

/**
 * Calculate offer time window
 */
function calculateOfferTimeWindow(requestFrom, requestUntil, windowFrom, windowUntil) {
  const reqFrom = requestFrom.toDate ? requestFrom.toDate().getTime() : requestFrom.getTime();
  const reqUntil = requestUntil.toDate ? requestUntil.toDate().getTime() : requestUntil.getTime();
  const winFrom = windowFrom.getTime ? windowFrom.getTime() : new Date(windowFrom).getTime();
  const winUntil = windowUntil.getTime ? windowUntil.getTime() : new Date(windowUntil).getTime();
  
  const offerFrom = new Date(Math.max(reqFrom, winFrom));
  const offerUntil = new Date(Math.min(reqUntil, winUntil));
  
  return {from: offerFrom, until: offerUntil};
}

module.exports = {
  findBestMatchingAvailability,
  calculateOfferTimeWindow,
};
