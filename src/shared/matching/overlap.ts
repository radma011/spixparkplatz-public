/** Date-like: Date or Firestore Timestamp with toDate(). */
type DateLike = Date | { toDate: () => Date };

function toMs(v: DateLike): number {
  return v instanceof Date ? v.getTime() : (v as { toDate: () => Date }).toDate().getTime();
}

/**
 * Check if two time ranges overlap.
 */
export function overlaps(
  requestFrom: DateLike,
  requestUntil: DateLike,
  windowFrom: DateLike,
  windowUntil: DateLike,
): boolean {
  const reqFrom = toMs(requestFrom);
  const reqUntil = toMs(requestUntil);
  const winFrom = toMs(windowFrom);
  const winUntil = toMs(windowUntil);
  return reqFrom < winUntil && reqUntil > winFrom;
}

/**
 * Overlap percentage: how much of the request duration is covered by the window (0..1).
 */
export function calculateOverlapPercentage(
  requestFrom: DateLike,
  requestUntil: DateLike,
  windowFrom: DateLike,
  windowUntil: DateLike,
): number {
  const reqFrom = toMs(requestFrom);
  const reqUntil = toMs(requestUntil);
  const winFrom = toMs(windowFrom);
  const winUntil = toMs(windowUntil);

  const requestDuration = reqUntil - reqFrom;
  if (requestDuration <= 0) return 0;

  const overlapStart = Math.max(reqFrom, winFrom);
  const overlapEnd = Math.min(reqUntil, winUntil);
  const overlapDuration = Math.max(0, overlapEnd - overlapStart);

  return overlapDuration / requestDuration;
}
