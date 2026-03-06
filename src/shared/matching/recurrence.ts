import type {RecurrenceRule} from './types';

/**
 * Calculate next occurrences for recurring availabilities.
 * When requestFromTime/requestUntilTime are provided, includes occurrences that OVERLAP
 * the request window (so same-day windows that already started are still included).
 */
export function calculateNextOccurrences(
  startDate: Date,
  startTime: Date,
  endTime: Date,
  recurrence: RecurrenceRule,
  count: number = 10,
  requestFromTime: number | null = null,
  requestUntilTime: number | null = null,
): Date[] {
  const occurrences: Date[] = [];
  const now = new Date();
  const useRequestOverlap = requestFromTime != null && requestUntilTime != null;

  function occurrenceEnd(occurrenceStart: Date): number {
    const end = new Date(occurrenceStart);
    end.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);
    if (end <= occurrenceStart) end.setDate(end.getDate() + 1);
    return end.getTime();
  }

  function overlapsRequest(occStart: Date, occEndMs: number): boolean {
    return occEndMs > requestFromTime! && occStart.getTime() < requestUntilTime!;
  }

  const startHours = startTime.getHours();
  const startMinutes = startTime.getMinutes();

  let currentDate = new Date(startDate);
  currentDate.setHours(startHours, startMinutes, 0, 0);

  const interval = recurrence.interval ?? 1;
  let iterations = 0;
  const maxIterations = 1000;

  function getMondayOfWeek(date: Date): Date {
    const monday = new Date(date);
    const day = date.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    monday.setDate(date.getDate() - daysFromMonday);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  if (recurrence.pattern === 'weekly' && recurrence.daysOfWeek?.length) {
    let checkDate = new Date(Math.max(now.getTime(), startDate.getTime()));
    checkDate.setHours(0, 0, 0, 0);
    if (useRequestOverlap && requestFromTime! < checkDate.getTime()) {
      checkDate = new Date(requestFromTime!);
      checkDate.setHours(0, 0, 0, 0);
      if (checkDate.getTime() < startDate.getTime()) checkDate = new Date(startDate);
    }

    const startWeekStart = getMondayOfWeek(startDate);

    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;

      for (const dayOfWeek of recurrence.daysOfWeek) {
        const weekStart = getMondayOfWeek(checkDate);
        const targetDate = new Date(weekStart);
        const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        targetDate.setDate(weekStart.getDate() + daysFromMonday);
        targetDate.setHours(startHours, startMinutes, 0, 0);

        if (targetDate < startDate) continue;

        const weeksDiff = Math.floor(
          (weekStart.getTime() - startWeekStart.getTime()) / (1000 * 60 * 60 * 24 * 7),
        );
        if (weeksDiff < 0 || weeksDiff % interval !== 0) continue;

        if (recurrence.endDate) {
          const endDate = new Date(recurrence.endDate);
          endDate.setHours(23, 59, 59, 999);
          if (targetDate > endDate) continue;
        }

        if (recurrence.occurrences != null && occurrences.length >= recurrence.occurrences) break;

        const includeByTime = useRequestOverlap
          ? overlapsRequest(targetDate, occurrenceEnd(targetDate))
          : targetDate >= now;
        if (includeByTime && !occurrences.some((occ) => occ.getTime() === targetDate.getTime())) {
          occurrences.push(new Date(targetDate));
          if (occurrences.length >= count) break;
        }
      }

      checkDate.setDate(checkDate.getDate() + 7);
    }
  } else {
    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;
      let matches = false;

      switch (recurrence.pattern) {
        case 'daily': {
          const daysDiff = Math.floor(
            (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
          );
          matches = daysDiff >= 0 && daysDiff % interval === 0;
          break;
        }
        case 'weekly': {
          const weeksDiff = Math.floor(
            (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7),
          );
          matches = weeksDiff >= 0 && weeksDiff % interval === 0;
          break;
        }
        case 'monthly':
          if (currentDate.getDate() === startDate.getDate()) {
            const monthsDiff =
              (currentDate.getFullYear() - startDate.getFullYear()) * 12 +
              (currentDate.getMonth() - startDate.getMonth());
            matches = monthsDiff >= 0 && monthsDiff % interval === 0;
          }
          break;
      }

      if (matches && recurrence.endDate) {
        const endDate = new Date(recurrence.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (currentDate > endDate) break;
      }

      if (matches && recurrence.occurrences != null && occurrences.length >= recurrence.occurrences)
        break;

      const occEndMs = occurrenceEnd(currentDate);
      const includeByTime = useRequestOverlap
        ? overlapsRequest(currentDate, occEndMs)
        : currentDate >= now;
      if (matches && includeByTime) occurrences.push(new Date(currentDate));

      currentDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHours, startMinutes, 0, 0);
    }
  }

  return occurrences.slice(0, count);
}
