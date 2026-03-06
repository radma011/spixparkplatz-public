import type {AvailabilityLike, TimeWindow} from './types';
import {toDate} from './toDate';
import {calculateNextOccurrences} from './recurrence';

const MAX_OCCURRENCES = 100;

/**
 * Expand recurring availability into time windows.
 * When recurrence is present, uses request window so occurrences overlapping the request are included.
 */
export function expandRecurringAvailability(
  availability: AvailabilityLike,
  requestFrom: Date | { toDate?: () => Date } | number,
  requestUntil: Date | { toDate?: () => Date } | number,
): TimeWindow[] {
  const avFrom = toDate(availability.from);
  const avUntil = toDate(availability.until);
  if (!avFrom || !avUntil) return [];

  if (!availability.recurrence) {
    return [
      {
        availabilityId: availability.id,
        userId: availability.userId,
        spotId: availability.spotId,
        from: avFrom,
        until: avUntil,
        autoOffer: availability.autoOffer !== false,
        username: availability.username,
        phone: availability.phone,
      },
    ];
  }

  const startDate = new Date(avFrom);
  startDate.setHours(0, 0, 0, 0);
  const startTime = avFrom;
  const endTime = avUntil;

  const reqFromDate =
    toDate(requestFrom) ??
    (requestFrom && typeof (requestFrom as { toDate?: () => Date }).toDate === 'function'
      ? (requestFrom as { toDate: () => Date }).toDate()
      : new Date(requestFrom as number));
  const reqUntilDate =
    toDate(requestUntil) ??
    (requestUntil && typeof (requestUntil as { toDate?: () => Date }).toDate === 'function'
      ? (requestUntil as { toDate: () => Date }).toDate()
      : new Date(requestUntil as number));
  const reqFromTime = reqFromDate.getTime();
  const reqUntilTime = reqUntilDate.getTime();

  const occurrences = calculateNextOccurrences(
    startDate,
    startTime,
    endTime,
    availability.recurrence,
    MAX_OCCURRENCES,
    reqFromTime,
    reqUntilTime,
  );

  const windows: TimeWindow[] = [];

  for (const occurrenceStart of occurrences) {
    const occurrenceEnd = new Date(occurrenceStart);
    occurrenceEnd.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    if (occurrenceEnd <= occurrenceStart) occurrenceEnd.setDate(occurrenceEnd.getDate() + 1);

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
