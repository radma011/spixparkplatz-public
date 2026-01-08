import {RecurrenceRule} from '../models/ParkingAvailability';

/**
 * Calculate the next N occurrences of a recurring availability
 */
export function calculateNextOccurrences(
  startDate: Date,
  startTime: Date,
  endTime: Date,
  recurrence: RecurrenceRule,
  count: number = 10,
): Date[] {
  const occurrences: Date[] = [];
  const now = new Date();

  // Extract time components from startTime and endTime
  const startHours = startTime.getHours();
  const startMinutes = startTime.getMinutes();
  const endHours = endTime.getHours();
  const endMinutes = endTime.getMinutes();

  let currentDate = new Date(startDate);
  currentDate.setHours(startHours, startMinutes, 0, 0);

  const interval = recurrence.interval || 1;
  let iterations = 0;
  const maxIterations = 1000; // Safety limit

  // For weekly with specific days, we need a different approach
  if (recurrence.pattern === 'weekly' && recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0) {
    // Start checking from today or startDate, whichever is later
    let checkDate = new Date(Math.max(now.getTime(), startDate.getTime()));
    checkDate.setHours(0, 0, 0, 0);

    // Calculate start week (Sunday of the week containing startDate)
    const startWeekStart = new Date(startDate);
    startWeekStart.setDate(startDate.getDate() - startDate.getDay());
    startWeekStart.setHours(0, 0, 0, 0);

    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;

      // Check each selected day in the current week
      for (const dayOfWeek of recurrence.daysOfWeek) {
        const testDate = new Date(checkDate);
        // Get the Sunday of current week
        const weekStart = new Date(testDate);
        weekStart.setDate(testDate.getDate() - testDate.getDay());
        // Add day offset to get the specific day
        const targetDate = new Date(weekStart);
        targetDate.setDate(weekStart.getDate() + dayOfWeek);
        targetDate.setHours(startHours, startMinutes, 0, 0);

        // Must be on or after startDate
        if (targetDate < startDate) continue;

        // Check interval (every N weeks from start week)
        const weeksDiff = Math.floor(
          (weekStart.getTime() - startWeekStart.getTime()) / (1000 * 60 * 60 * 24 * 7),
        );
        if (weeksDiff < 0 || weeksDiff % interval !== 0) continue;

        // Check endDate constraint
        if (recurrence.endDate) {
          const endDate = new Date(recurrence.endDate);
          endDate.setHours(23, 59, 59, 999);
          if (targetDate > endDate) continue;
        }

        // Check occurrences limit
        if (recurrence.occurrences && occurrences.length >= recurrence.occurrences) {
          break;
        }

        // Only add if it's in the future or today, and not already added
        if (targetDate >= now && !occurrences.some((occ) => occ.getTime() === targetDate.getTime())) {
          occurrences.push(new Date(targetDate));
          if (occurrences.length >= count) break;
        }
      }

      // Move to next week
      checkDate.setDate(checkDate.getDate() + 7);
    }
  } else {
    // For daily and monthly, or weekly without specific days
    while (occurrences.length < count && iterations < maxIterations) {
      iterations++;

      // Check if current date matches the recurrence pattern
      let matches = false;

      switch (recurrence.pattern) {
        case 'daily':
          // Every N days from start date
          const daysDiff = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          matches = daysDiff >= 0 && daysDiff % interval === 0;
          break;

        case 'weekly':
          // No specific days selected, use interval
          const weeksDiff = Math.floor(
            (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 7),
          );
          matches = weeksDiff >= 0 && weeksDiff % interval === 0;
          break;

        case 'monthly':
          // Same day of month, every N months
          if (currentDate.getDate() === startDate.getDate()) {
            const monthsDiff =
              (currentDate.getFullYear() - startDate.getFullYear()) * 12 +
              (currentDate.getMonth() - startDate.getMonth());
            matches = monthsDiff >= 0 && monthsDiff % interval === 0;
          }
          break;
      }

      // Check endDate constraint
      if (matches && recurrence.endDate) {
        const endDate = new Date(recurrence.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (currentDate > endDate) {
          break; // Past end date
        }
      }

      // Check occurrences limit
      if (matches && recurrence.occurrences) {
        if (occurrences.length >= recurrence.occurrences) {
          break; // Reached occurrence limit
        }
      }

      // Only add if it's in the future or today
      if (matches && currentDate >= now) {
        occurrences.push(new Date(currentDate));
      }

      // Move to next day
      currentDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(startHours, startMinutes, 0, 0);
    }
  }

  return occurrences.slice(0, count);
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

