import {ParkingAvailability, isRecurring} from '../models/ParkingAvailability';
import {ParkingRequest} from '../models/ParkingRequest';
import {calculateNextOccurrences} from './recurrenceUtils';

/**
 * Represents a single time window from an availability (either one-time or a recurring occurrence)
 */
export interface AvailabilityTimeWindow {
  availabilityId: string;
  userId: string;
  spotId: string;
  from: Date;
  until: Date;
  autoOffer: boolean;
  username?: string;
  phone?: string;
  // For recurring availabilities, this is the occurrence date
  occurrenceDate?: Date;
}

/**
 * Expand a recurring availability into individual time windows
 */
export function expandRecurringAvailability(
  availability: ParkingAvailability,
  requestFrom: Date,
  requestUntil: Date,
): AvailabilityTimeWindow[] {
  if (!isRecurring(availability) || !availability.recurrence) {
    // One-time availability
    return [
      {
        availabilityId: availability.id,
        userId: availability.userId,
        spotId: availability.spotId,
        from: availability.from,
        until: availability.until,
        autoOffer: availability.autoOffer ?? true,
        username: availability.username,
        phone: availability.phone,
      },
    ];
  }

  // For recurring availabilities, calculate occurrences that overlap with the request
  const startDate = new Date(availability.from);
  startDate.setHours(0, 0, 0, 0);
  
  const startTime = new Date(availability.from);
  const endTime = new Date(availability.until);
  
  // Calculate occurrences up to requestUntil + 1 day to ensure we cover the request
  const maxOccurrences = 100; // Safety limit
  const occurrences = calculateNextOccurrences(
    startDate,
    startTime,
    endTime,
    availability.recurrence,
    maxOccurrences,
  );

  const windows: AvailabilityTimeWindow[] = [];
  
  for (const occurrenceStart of occurrences) {
    // Skip if occurrence is completely before request
    const occurrenceEnd = new Date(occurrenceStart);
    occurrenceEnd.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    
    // If end time is before start time, assume it's next day
    if (occurrenceEnd <= occurrenceStart) {
      occurrenceEnd.setDate(occurrenceEnd.getDate() + 1);
    }
    
    // Only include if it overlaps with the request
    if (occurrenceEnd.getTime() > requestFrom.getTime() && occurrenceStart.getTime() < requestUntil.getTime()) {
      windows.push({
        availabilityId: availability.id,
        userId: availability.userId,
        spotId: availability.spotId,
        from: occurrenceStart,
        until: occurrenceEnd,
        autoOffer: availability.autoOffer ?? true,
        username: availability.username,
        phone: availability.phone,
        occurrenceDate: occurrenceStart,
      });
    }
    
    // Stop if we've gone past the request
    if (occurrenceStart > requestUntil) {
      break;
    }
  }
  
  return windows;
}

/**
 * Check if a request overlaps with an availability time window
 */
function overlaps(requestFrom: Date, requestUntil: Date, windowFrom: Date, windowUntil: Date): boolean {
  return requestFrom.getTime() < windowUntil.getTime() && requestUntil.getTime() > windowFrom.getTime();
}

/**
 * Calculate overlap percentage: how much of the request is covered by the window
 */
function calculateOverlapPercentage(
  requestFrom: Date,
  requestUntil: Date,
  windowFrom: Date,
  windowUntil: Date,
): number {
  const requestDuration = requestUntil.getTime() - requestFrom.getTime();
  if (requestDuration <= 0) return 0;
  
  const overlapStart = Math.max(requestFrom.getTime(), windowFrom.getTime());
  const overlapEnd = Math.min(requestUntil.getTime(), windowUntil.getTime());
  const overlapDuration = Math.max(0, overlapEnd - overlapStart);
  
  return overlapDuration / requestDuration;
}

/**
 * Calculate match score for prioritization
 * Higher score = better match
 */
function calculateMatchScore(
  requestFrom: Date,
  requestUntil: Date,
  window: AvailabilityTimeWindow,
): number {
  let score = 0;
  
  // Priority 1: Start time matches (exact match = 1000 points, within 15 min = 500 points)
  const startDiff = Math.abs(requestFrom.getTime() - window.from.getTime());
  if (startDiff === 0) {
    score += 1000;
  } else if (startDiff <= 15 * 60 * 1000) {
    // Within 15 minutes
    score += 500 - (startDiff / (15 * 60 * 1000)) * 500;
  }
  
  // Priority 2: End time matches (exact match = 800 points, within 15 min = 400 points)
  const endDiff = Math.abs(requestUntil.getTime() - window.until.getTime());
  if (endDiff === 0) {
    score += 800;
  } else if (endDiff <= 15 * 60 * 1000) {
    score += 400 - (endDiff / (15 * 60 * 1000)) * 400;
  }
  
  // Priority 3: Request fills as much of the availability as possible
  const overlapPercentage = calculateOverlapPercentage(requestFrom, requestUntil, window.from, window.until);
  score += overlapPercentage * 300; // Max 300 points
  
  // Priority 4: Any overlap (base score)
  if (overlaps(requestFrom, requestUntil, window.from, window.until)) {
    score += 100;
  }
  
  return score;
}

/**
 * Check if a time window is blocked by checking spot availability
 * This is a simplified check - for full blocking logic, we'd need to check accepted offers
 */
export async function isTimeWindowBlocked(
  spotId: string,
  facilityCode: string,
  from: Date,
  until: Date,
  checkSpotAvailability: (spotId: string, facilityCode: string, from: Date, until: Date) => Promise<{request: ParkingRequest; overlapMinutes: number} | null>,
): Promise<boolean> {
  try {
    const conflict = await checkSpotAvailability(spotId, facilityCode, from, until);
    return conflict !== null;
  } catch (e) {
    // If check fails, assume not blocked (fail open)
    console.error('Failed to check spot availability:', e);
    return false;
  }
}

/**
 * Find the best matching availability for a request
 * @param checkSpotAvailabilityFn Optional function to check if a spot is already blocked
 */
export async function findBestMatchingAvailability(
  request: ParkingRequest,
  availabilities: ParkingAvailability[],
  checkSpotAvailabilityFn?: (spotId: string, facilityCode: string, from: Date, until: Date) => Promise<{request: ParkingRequest; overlapMinutes: number} | null>,
): Promise<AvailabilityTimeWindow | null> {
  const requestFrom = request.from;
  const requestUntil = request.until;
  const allowPartialOffers = request.allowPartialOffers !== false;
  
  // Expand all availabilities into time windows
  const allWindows: AvailabilityTimeWindow[] = [];
  
  for (const availability of availabilities) {
    // Skip if availability is not active or already matched
    if (!availability.isActive || availability.isMatched) {
      continue;
    }
    
    // Skip if it's the same user (can't match with own availability)
    if (availability.userId === request.requestedBy) {
      continue;
    }
    
    // Skip if facility codes don't match
    if (availability.facilityCode !== request.facilityCode) {
      continue;
    }
    
    const windows = expandRecurringAvailability(availability, requestFrom, requestUntil);
    
    // Filter windows that actually overlap with the request and are not blocked
    for (const window of windows) {
      if (!overlaps(requestFrom, requestUntil, window.from, window.until)) {
        continue;
      }
      // Wenn Teilangebote nicht erlaubt sind, nur Fenster zulassen,
      // die den kompletten Request-Zeitraum abdecken.
      if (!allowPartialOffers) {
        if (window.from.getTime() > requestFrom.getTime()) continue;
        if (window.until.getTime() < requestUntil.getTime()) continue;
      }
      
      // Check if this time window is already blocked
      if (checkSpotAvailabilityFn) {
        const isBlocked = await isTimeWindowBlocked(
          window.spotId,
          request.facilityCode,
          window.from,
          window.until,
          checkSpotAvailabilityFn,
        );
        if (isBlocked) {
          continue; // Skip blocked windows
        }
      }
      
      allWindows.push(window);
    }
  }
  
  if (allWindows.length === 0) {
    return null;
  }
  
  // Calculate scores and find best match
  const scoredWindows = allWindows.map((window) => ({
    window,
    score: calculateMatchScore(requestFrom, requestUntil, window),
  }));
  
  // Sort by score (highest first)
  scoredWindows.sort((a, b) => b.score - a.score);
  
  return scoredWindows[0].window;
}

/**
 * Calculate the actual time window for an offer based on request and availability window
 * This handles partial matches and ensures the offer covers the request as much as possible
 */
export function calculateOfferTimeWindow(
  requestFrom: Date,
  requestUntil: Date,
  windowFrom: Date,
  windowUntil: Date,
): {from: Date; until: Date} {
  // The offer should cover the request, but be limited by the availability window
  const offerFrom = new Date(Math.max(requestFrom.getTime(), windowFrom.getTime()));
  const offerUntil = new Date(Math.min(requestUntil.getTime(), windowUntil.getTime()));
  
  return {from: offerFrom, until: offerUntil};
}
