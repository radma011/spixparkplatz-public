import type {TimeWindow} from './types';
import {overlaps, calculateOverlapPercentage} from './overlap';

type DateLike = Date | { toDate: () => Date };

function toMs(v: DateLike | { getTime?: () => number }): number {
  if (v instanceof Date) return v.getTime();
  if (typeof (v as { toDate: () => Date }).toDate === 'function')
    return (v as { toDate: () => Date }).toDate().getTime();
  if (typeof (v as { getTime: () => number }).getTime === 'function')
    return (v as { getTime: () => number }).getTime();
  return new Date(v as unknown as string | number).getTime();
}

/**
 * Match score for prioritization. Higher = better match.
 */
export function calculateMatchScore(
  requestFrom: DateLike,
  requestUntil: DateLike,
  window: TimeWindow,
): number {
  let score = 0;

  const reqFrom = toMs(requestFrom);
  const reqUntil = toMs(requestUntil);
  const winFrom = toMs(window.from);
  const winUntil = toMs(window.until);

  const startDiff = Math.abs(reqFrom - winFrom);
  if (startDiff === 0) score += 1000;
  else if (startDiff <= 15 * 60 * 1000)
    score += 500 - (startDiff / (15 * 60 * 1000)) * 500;

  const endDiff = Math.abs(reqUntil - winUntil);
  if (endDiff === 0) score += 800;
  else if (endDiff <= 15 * 60 * 1000) score += 400 - (endDiff / (15 * 60 * 1000)) * 400;

  score +=
    calculateOverlapPercentage(requestFrom, requestUntil, window.from, window.until) * 300;

  if (overlaps(requestFrom, requestUntil, window.from, window.until)) score += 100;

  return score;
}
