/**
 * Convert Firestore timestamp (Timestamp, { _seconds, _nanoseconds }, or Date) to Date.
 * Handles Admin SDK and serialized formats. Safe for use in both app and Cloud Functions.
 */
export function toDate(
  value:
    | Date
    | { toDate?: () => Date; _seconds?: number; _nanoseconds?: number }
    | string
    | number
    | null
    | undefined,
): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const v = value as { _seconds?: number; _nanoseconds?: number };
  if (typeof v._seconds === 'number') {
    return new Date(v._seconds * 1000 + ((v._nanoseconds ?? 0) / 1e6));
  }
  if (typeof value === 'string' || typeof value === 'number') return new Date(value);
  return null;
}
