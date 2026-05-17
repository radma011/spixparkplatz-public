/** 1-minute tolerance: booking ending at 18:00 allows next to start at 18:00. */
export const BLOCK_TOLERANCE_MS = 60 * 1000;

export function mergeIntervals(
  intervals: Array<{start: number; end: number}>,
): Array<{start: number; end: number}> {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const merged: Array<{start: number; end: number}> = [];
  for (const it of sorted) {
    const last = merged[merged.length - 1];
    if (!last || it.start > last.end) merged.push({...it});
    else last.end = Math.max(last.end, it.end);
  }
  return merged;
}

/** True if [blockStart, blockEnd] overlaps [windowStart, windowEnd] beyond tolerance. */
export function rangesOverlapWithTolerance(
  windowStart: number,
  windowEnd: number,
  blockStart: number,
  blockEnd: number,
  toleranceMs: number = BLOCK_TOLERANCE_MS,
): boolean {
  const overlapStart = Math.max(windowStart, blockStart);
  const overlapEnd = Math.min(windowEnd, blockEnd);
  const overlapMs = overlapEnd - overlapStart;
  const timeGapStart = windowStart - blockEnd;
  const timeGapEnd = blockStart - windowEnd;
  if (timeGapStart >= -toleranceMs && timeGapStart <= toleranceMs) return false;
  if (timeGapEnd >= -toleranceMs && timeGapEnd <= toleranceMs) return false;
  return overlapMs > toleranceMs;
}
