/**
 * Shared availability matching logic (single source of truth).
 * Used by the app (src/utils/availabilityMatching, recurrenceUtils) and Cloud Functions (functions/lib/matching.js).
 * No Firestore or app-specific imports.
 */

export type {AvailabilityLike, RecurrenceRule, TimeWindow} from './types';
export {toDate} from './toDate';
export {calculateNextOccurrences} from './recurrence';
export {expandRecurringAvailability} from './expand';
export {overlaps, calculateOverlapPercentage} from './overlap';
export {calculateMatchScore} from './scoring';
export {calculateOfferTimeWindow} from './offerWindow';
