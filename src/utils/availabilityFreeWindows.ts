import type {OfferFromAvailability} from '../services/FirestoreService';
import {mergeIntervals} from '../shared/matching';
import {isOfferBlockingOccupancy} from './offerOccupancy';

export type OccupancyKind = 'accepted' | 'active';

/** Belegte Intervalle (accepted + optional active) innerhalb eines Fensters. */
export function getOccupiedIntervalsFromOffers(
  windowFrom: Date,
  windowUntil: Date,
  offers: OfferFromAvailability[],
  options?: {includeAccepted?: boolean; includeActive?: boolean},
): Array<{start: number; end: number; kind: OccupancyKind}> {
  const includeAccepted = options?.includeAccepted !== false;
  const includeActive = options?.includeActive === true;
  const avFrom = windowFrom.getTime();
  const avUntil = windowUntil.getTime();
  if (avUntil <= avFrom) return [];

  const raw: Array<{start: number; end: number; kind: OccupancyKind}> = [];
  for (const o of offers) {
    const st = o.offer.status;
    if (!isOfferBlockingOccupancy(st)) continue;
    const kind: OccupancyKind | null =
      st === 'accepted' && includeAccepted
        ? 'accepted'
        : st === 'active' && includeActive
          ? 'active'
          : null;
    if (!kind) continue;
    const start = Math.max(o.offer.from.getTime(), avFrom);
    const end = Math.min(o.offer.until.getTime(), avUntil);
    if (end > start) raw.push({start, end, kind});
  }

  const merged = mergeIntervals(raw.map((r) => ({start: r.start, end: r.end})));
  return merged.map((m) => {
    const mid = (m.start + m.end) / 2;
    const hit = raw.find((r) => r.start <= mid && r.end >= mid);
    return {start: m.start, end: m.end, kind: hit?.kind ?? 'accepted'};
  });
}

/** Nur angenommene Angebote (Matcher / „vergeben“). */
export function getAcceptedBlockedIntervals(
  windowFrom: Date,
  windowUntil: Date,
  offers: OfferFromAvailability[],
): Array<{start: number; end: number}> {
  return getOccupiedIntervalsFromOffers(windowFrom, windowUntil, offers, {
    includeAccepted: true,
    includeActive: false,
  }).map(({start, end}) => ({start, end}));
}

/**
 * Freie Restfenster nach Abzug von Belegungen.
 * Kalender: accepted + active; strikt „vergeben“: nur accepted.
 */
export function getFreeTimeWindows(
  windowFrom: Date,
  windowUntil: Date,
  offers: OfferFromAvailability[],
  options?: {includeActiveOffers?: boolean},
): Array<{from: Date; until: Date}> {
  const avFrom = windowFrom.getTime();
  const avUntil = windowUntil.getTime();
  if (avUntil <= avFrom) return [];

  const blocked = getOccupiedIntervalsFromOffers(windowFrom, windowUntil, offers, {
    includeAccepted: true,
    includeActive: options?.includeActiveOffers === true,
  }).map(({start, end}) => ({start, end}));

  if (blocked.length === 0) {
    return [{from: new Date(windowFrom), until: new Date(windowUntil)}];
  }

  const free: Array<{from: Date; until: Date}> = [];
  let cursor = avFrom;
  for (const b of blocked) {
    if (b.start > cursor) {
      free.push({from: new Date(cursor), until: new Date(b.start)});
    }
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < avUntil) {
    free.push({from: new Date(cursor), until: new Date(avUntil)});
  }
  return free.filter((w) => w.until.getTime() > w.from.getTime());
}
