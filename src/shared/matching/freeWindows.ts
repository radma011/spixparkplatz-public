import {BLOCK_TOLERANCE_MS, mergeIntervals} from './blocking';

/** Freie Teilfenster in [rangeFrom, rangeUntil] nach Abzug blockierter Intervalle. */
export function getFreeTimeWindowsFromBlocked(
  rangeFrom: Date,
  rangeUntil: Date,
  blocked: Array<{start: number; end: number}>,
): Array<{from: Date; until: Date}> {
  const avFrom = rangeFrom.getTime();
  const avUntil = rangeUntil.getTime();
  if (avUntil <= avFrom) return [];

  const merged = mergeIntervals(
    blocked
      .map((b) => ({
        start: Math.max(b.start, avFrom),
        end: Math.min(b.end, avUntil),
      }))
      .filter((b) => b.end > b.start),
  );

  if (merged.length === 0) {
    return [{from: new Date(rangeFrom), until: new Date(rangeUntil)}];
  }

  const free: Array<{from: Date; until: Date}> = [];
  let cursor = avFrom;
  for (const b of merged) {
    if (b.start > cursor) {
      free.push({from: new Date(cursor), until: new Date(b.start)});
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < avUntil) {
    free.push({from: new Date(cursor), until: new Date(avUntil)});
  }

  return free.filter((w) => w.until.getTime() - w.from.getTime() > BLOCK_TOLERANCE_MS);
}
