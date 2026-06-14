/** Set to true to trace calendar availability shortening in Metro / DevTools. */
export const CALENDAR_OFFER_DEBUG = false;

const PREFIX = '[CalendarOffers]';

export function logCalendarOffer(label: string, data?: Record<string, unknown>): void {
  if (!CALENDAR_OFFER_DEBUG) return;
  if (data === undefined) {
    console.log(`${PREFIX} ${label}`);
    return;
  }
  console.log(`${PREFIX} ${label}`, JSON.stringify(data, null, 2));
}

export function formatOfferDebugTime(d: Date | null | undefined): string {
  if (!d || Number.isNaN(d.getTime())) return '(invalid)';
  return d.toISOString();
}
