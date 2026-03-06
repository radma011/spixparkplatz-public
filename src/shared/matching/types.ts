/**
 * Minimal types for availability matching.
 * Shared between app and Cloud Functions; no dependency on app models.
 */

export interface RecurrenceRule {
  pattern: 'daily' | 'weekly' | 'monthly';
  interval?: number;
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, ... (JS getDay())
  endDate?: Date;
  occurrences?: number;
}

/** Availability-like object (from Firestore or app); from/until may be Date or Timestamp-like. */
export interface AvailabilityLike {
  id: string;
  userId: string;
  facilityCode?: string;
  spotId: string;
  from: Date | { toDate?: () => Date; _seconds?: number; _nanoseconds?: number } | string | number;
  until: Date | { toDate?: () => Date; _seconds?: number; _nanoseconds?: number } | string | number;
  recurrence?: RecurrenceRule;
  autoOffer?: boolean;
  username?: string;
  phone?: string;
}

/** A single time window (one-time or one occurrence of recurring). */
export interface TimeWindow {
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
