/**
 * Centralized date/time validation utilities for date/time pickers
 */

/**
 * Ensures that an end date/time is not before a start date/time.
 * If the end is before or equal to the start, it will be adjusted automatically.
 * 
 * @param startDate - The start date/time
 * @param endDate - The end date/time to validate
 * @param minHoursDifference - Minimum hours difference between start and end (default: 1)
 * @returns Adjusted end date/time that is guaranteed to be after start
 */
export function ensureEndAfterStart(
  startDate: Date,
  endDate: Date,
  minHoursDifference: number = 1,
): Date {
  if (endDate > startDate) {
    return endDate;
  }

  // If end is before or equal to start, adjust it
  const adjustedEnd = new Date(startDate);
  adjustedEnd.setTime(startDate.getTime() + minHoursDifference * 60 * 60 * 1000);
  return adjustedEnd;
}

/**
 * Validates and adjusts a date when the start date changes.
 * Ensures the end date is not before the new start date.
 * 
 * @param newStartDate - The new start date
 * @param currentEndDate - The current end date
 * @param minHoursDifference - Minimum hours difference (default: 1)
 * @returns Object with adjusted start and end dates
 */
export function adjustDatesOnStartChange(
  newStartDate: Date,
  currentEndDate: Date,
  minHoursDifference: number = 1,
): {start: Date; end: Date} {
  const adjustedEnd = ensureEndAfterStart(newStartDate, currentEndDate, minHoursDifference);
  return {
    start: newStartDate,
    end: adjustedEnd,
  };
}

/**
 * Validates and adjusts a date when the end date changes.
 * Ensures the end date is not before the start date.
 * 
 * @param startDate - The start date
 * @param newEndDate - The new end date
 * @param minHoursDifference - Minimum hours difference (default: 1)
 * @returns Adjusted end date
 */
export function adjustDateOnEndChange(
  startDate: Date,
  newEndDate: Date,
  minHoursDifference: number = 1,
): Date {
  return ensureEndAfterStart(startDate, newEndDate, minHoursDifference);
}

/**
 * Validates and adjusts a time when the start time changes (same day).
 * Ensures the end time is not before the new start time.
 * 
 * @param startDate - The start date (for day reference)
 * @param newStartTime - The new start time
 * @param currentEndTime - The current end time
 * @param minHoursDifference - Minimum hours difference (default: 1)
 * @returns Object with adjusted start and end times
 */
export function adjustTimesOnStartChange(
  startDate: Date,
  newStartTime: Date,
  currentEndTime: Date,
  minHoursDifference: number = 1,
): {start: Date; end: Date} {
  // Create full datetime from startDate + newStartTime
  const newStartDateTime = new Date(startDate);
  newStartDateTime.setHours(newStartTime.getHours(), newStartTime.getMinutes(), 0, 0);

  // Create full datetime from startDate + currentEndTime
  const currentEndDateTime = new Date(startDate);
  currentEndDateTime.setHours(currentEndTime.getHours(), currentEndTime.getMinutes(), 0, 0);

  // Ensure end is after start
  const adjustedEndDateTime = ensureEndAfterStart(newStartDateTime, currentEndDateTime, minHoursDifference);

  // Extract time from adjusted end
  const adjustedEndTime = new Date(adjustedEndDateTime);
  adjustedEndTime.setFullYear(1970, 0, 1); // Use a fixed date for time-only comparison

  return {
    start: newStartTime,
    end: adjustedEndTime,
  };
}

/**
 * Validates and adjusts a time when the end time changes (same day).
 * Ensures the end time is not before the start time.
 * 
 * @param startDate - The start date (for day reference)
 * @param startTime - The start time
 * @param newEndTime - The new end time
 * @param minHoursDifference - Minimum hours difference (default: 1)
 * @returns Adjusted end time
 */
export function adjustTimeOnEndChange(
  startDate: Date,
  startTime: Date,
  newEndTime: Date,
  minHoursDifference: number = 1,
): Date {
  // Create full datetime from startDate + startTime
  const startDateTime = new Date(startDate);
  startDateTime.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);

  // Create full datetime from startDate + newEndTime
  const newEndDateTime = new Date(startDate);
  newEndDateTime.setHours(newEndTime.getHours(), newEndTime.getMinutes(), 0, 0);

  // Ensure end is after start
  const adjustedEndDateTime = ensureEndAfterStart(startDateTime, newEndDateTime, minHoursDifference);

  // Return the time component
  return adjustedEndDateTime;
}

/**
 * Validates and adjusts a date when changing the date part while keeping the time.
 * 
 * @param newDate - The new date (date part only)
 * @param currentDateTime - The current date/time (to preserve time)
 * @param otherDateTime - The other date/time to ensure it's not before the new date/time
 * @param minHoursDifference - Minimum hours difference (default: 1)
 * @returns Object with adjusted date/time and the other date/time
 */
export function adjustDateKeepingTime(
  newDate: Date,
  currentDateTime: Date,
  otherDateTime: Date,
  minHoursDifference: number = 1,
): {adjusted: Date; other: Date} {
  // Create new datetime with new date but keeping time from currentDateTime
  const newDateTime = new Date(newDate);
  newDateTime.setHours(currentDateTime.getHours(), currentDateTime.getMinutes(), 0, 0);

  // Ensure otherDateTime is not before newDateTime
  const adjustedOther = ensureEndAfterStart(newDateTime, otherDateTime, minHoursDifference);

  return {
    adjusted: newDateTime,
    other: adjustedOther,
  };
}

/**
 * Validates and adjusts a time when changing the time part while keeping the date.
 * 
 * @param currentDateTime - The current date/time (to preserve date)
 * @param newTime - The new time
 * @param otherDateTime - The other date/time to ensure it's not before the new date/time
 * @param minHoursDifference - Minimum hours difference (default: 1)
 * @returns Object with adjusted date/time and the other date/time
 */
export function adjustTimeKeepingDate(
  currentDateTime: Date,
  newTime: Date,
  otherDateTime: Date,
  minHoursDifference: number = 1,
): {adjusted: Date; other: Date} {
  // Create new datetime with current date but new time
  const newDateTime = new Date(currentDateTime);
  newDateTime.setHours(newTime.getHours(), newTime.getMinutes(), 0, 0);

  // Ensure otherDateTime is not before newDateTime
  const adjustedOther = ensureEndAfterStart(newDateTime, otherDateTime, minHoursDifference);

  return {
    adjusted: newDateTime,
    other: adjustedOther,
  };
}
