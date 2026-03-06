import {ParkingAvailability} from '../models/ParkingAvailability';
import {ParkingRequest} from '../models/ParkingRequest';
import {
  expandRecurringAvailability as expandRecurringAvailabilityCore,
  overlaps,
  calculateMatchScore,
  calculateOfferTimeWindow as calculateOfferTimeWindowCore,
  toDate,
} from '../shared/matching';
import type {AvailabilityLike, TimeWindow} from '../shared/matching';

/**
 * Normalize facility code for consistent matching (trim + uppercase).
 */
export function normalizeFacilityCode(code: string | undefined | null): string {
  return String(code ?? '').trim().toUpperCase();
}

/**
 * Represents a single time window from an availability (one-time or one recurring occurrence).
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
  occurrenceDate?: Date;
}

function toAvailabilityLike(availability: ParkingAvailability): AvailabilityLike {
  return {
    id: availability.id,
    userId: availability.userId,
    facilityCode: availability.facilityCode,
    spotId: availability.spotId,
    from: availability.from as AvailabilityLike['from'],
    until: availability.until as AvailabilityLike['until'],
    recurrence: availability.recurrence,
    autoOffer: availability.autoOffer,
    username: availability.username,
    phone: availability.phone,
  };
}

/**
 * Expand a recurring availability into individual time windows (uses shared logic).
 */
export function expandRecurringAvailability(
  availability: ParkingAvailability,
  requestFrom: Date,
  requestUntil: Date,
): AvailabilityTimeWindow[] {
  const windows = expandRecurringAvailabilityCore(
    toAvailabilityLike(availability),
    requestFrom,
    requestUntil,
  );
  return windows as AvailabilityTimeWindow[];
}

/**
 * Check if a time window is blocked (e.g. by existing offers).
 * Uses the given callback; pass the REQUEST window (from/until) for partial-availability behavior.
 */
export async function isTimeWindowBlocked(
  spotId: string,
  facilityCode: string,
  from: Date,
  until: Date,
  checkSpotAvailability: (
    spotId: string,
    facilityCode: string,
    from: Date,
    until: Date,
  ) => Promise<{request: ParkingRequest; overlapMinutes: number} | null>,
): Promise<boolean> {
  try {
    const conflict = await checkSpotAvailability(spotId, facilityCode, from, until);
    return conflict !== null;
  } catch (e) {
    console.error('Failed to check spot availability:', e);
    return false;
  }
}

/**
 * Find the best matching availability for a request.
 * Uses shared expand/overlap/score; checks blocking for the REQUEST window when checkSpotAvailabilityFn is provided.
 */
export async function findBestMatchingAvailability(
  request: ParkingRequest,
  availabilities: ParkingAvailability[],
  checkSpotAvailabilityFn?: (
    spotId: string,
    facilityCode: string,
    from: Date,
    until: Date,
  ) => Promise<{request: ParkingRequest; overlapMinutes: number} | null>,
): Promise<AvailabilityTimeWindow | null> {
  const requestFrom = toDate(request.from) ?? (request.from instanceof Date ? request.from : new Date(request.from as string | number));
  const requestUntil = toDate(request.until) ?? (request.until instanceof Date ? request.until : new Date(request.until as string | number));
  const allowPartialOffers = request.allowPartialOffers !== false;
  const reqCode = normalizeFacilityCode(request.facilityCode);
  const allWindows: AvailabilityTimeWindow[] = [];

  for (const availability of availabilities) {
    if (!availability.isActive || availability.isMatched) continue;
    if (availability.userId === request.requestedBy) continue;
    if (normalizeFacilityCode(availability.facilityCode) !== reqCode) continue;

    const windows = expandRecurringAvailability(availability, requestFrom, requestUntil);

    for (const window of windows) {
      if (!overlaps(requestFrom, requestUntil, window.from, window.until)) continue;

      if (!allowPartialOffers) {
        if (window.from.getTime() > requestFrom.getTime()) continue;
        if (window.until.getTime() < requestUntil.getTime()) continue;
      }

      if (checkSpotAvailabilityFn) {
        const isBlocked = await isTimeWindowBlocked(
          window.spotId,
          request.facilityCode,
          requestFrom,
          requestUntil,
          checkSpotAvailabilityFn,
        );
        if (isBlocked) continue;
      }

      allWindows.push(window);
    }
  }

  if (allWindows.length === 0) return null;

  const scoredWindows = allWindows.map((window) => ({
    window,
    score: calculateMatchScore(requestFrom, requestUntil, window as TimeWindow),
  }));
  scoredWindows.sort((a, b) => b.score - a.score);

  return scoredWindows[0].window;
}

/**
 * Calculate the offer time window (intersection of request and availability window).
 */
export function calculateOfferTimeWindow(
  requestFrom: Date,
  requestUntil: Date,
  windowFrom: Date,
  windowUntil: Date,
): {from: Date; until: Date} {
  return calculateOfferTimeWindowCore(requestFrom, requestUntil, windowFrom, windowUntil);
}
