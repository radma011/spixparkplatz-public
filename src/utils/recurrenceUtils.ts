import {RecurrenceRule} from '../models/ParkingAvailability';
import {calculateNextOccurrences as calculateNextOccurrencesCore} from '../shared/matching';

/** Fenster einer einzelnen Wiederholung (from/until). */
export interface OccurrenceWindow {
  from: Date;
  until: Date;
}

/**
 * Nächste N Zeitfenster einer wiederkehrenden Verfügbarkeit ab jetzt.
 * Für Filter „Bereits angeboten“ und Status-Streifen, damit die tatsächlich aktuellen Perioden genutzt werden.
 */
export function getNextOccurrenceWindows(
  from: Date,
  until: Date,
  recurrence: RecurrenceRule,
  count: number = 20,
): OccurrenceWindow[] {
  const startDate = new Date(from);
  startDate.setHours(0, 0, 0, 0);
  const occurrences = calculateNextOccurrencesCore(
    startDate,
    from,
    until,
    recurrence,
    count,
    null,
    null,
  );
  const windows: OccurrenceWindow[] = [];
  for (const occStart of occurrences) {
    const occEnd = new Date(occStart);
    occEnd.setHours(until.getHours(), until.getMinutes(), 0, 0);
    if (occEnd <= occStart) occEnd.setDate(occEnd.getDate() + 1);
    windows.push({ from: occStart, until: occEnd });
  }
  return windows;
}

/**
 * Calculate the next N occurrences of a recurring availability.
 * When requestFrom/requestUntil are provided, includes occurrences that overlap the request window
 * (e.g. same-day windows that already started are still included).
 */
export function calculateNextOccurrences(
  startDate: Date,
  startTime: Date,
  endTime: Date,
  recurrence: RecurrenceRule,
  count: number = 10,
  requestFrom?: Date | null,
  requestUntil?: Date | null,
): Date[] {
  const requestFromTime = requestFrom?.getTime() ?? null;
  const requestUntilTime = requestUntil?.getTime() ?? null;
  return calculateNextOccurrencesCore(
    startDate,
    startTime,
    endTime,
    recurrence,
    count,
    requestFromTime,
    requestUntilTime,
  );
}

/**
 * Format occurrence for display
 */
export function formatOccurrence(date: Date, endTime: Date): string {
  const startTimeStr = date.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
  const endDate = new Date(date);
  endDate.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
  const endTimeStr = endDate.toLocaleTimeString('de-DE', {hour: '2-digit', minute: '2-digit'});
  const dateStr = date.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return `${dateStr}, ${startTimeStr} - ${endTimeStr}`;
}
