/**
 * Formatiert ein Datum für die Anzeige in der App
 * @param date - Das zu formatierende Datum
 * @returns Formatierter String (z.B. "Heute 14:30" oder "27.12.2024 14:30")
 */
export const formatDateTime = (date: Date): string => {
  return `${formatDateLabel(date)} (${formatTime(date)})`;
};

export const formatTime = (date: Date): string => {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
};

export const formatDateLabel = (date: Date): string => {
  // Always render weekday + dd.mm. (no year, no "Heute/Morgen")
  const weekdays = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const wd = weekdays[date.getDay()];
  const dd = date.getDate().toString().padStart(2, '0');
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${wd}, ${dd}.${mm}.`;
};

export const isSameCalendarDay = (a: Date, b: Date): boolean => {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

export const getTodayTomorrowBadge = (date: Date): 'Heute' | 'Morgen' | null => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (d.getTime() === today.getTime()) return 'Heute';
  if (d.getTime() === tomorrow.getTime()) return 'Morgen';
  return null;
};

/**
 * Formats a time range compactly.
 * - Same day: "Mo, 29.12. (19:00 - 20:00)"
 * - Different day: "Mo, 29.12. (19:00) - Di, 30.12. (20:00)"
 */
export const formatDateRange = (from: Date, until: Date): string => {
  if (isSameCalendarDay(from, until)) {
    return `${formatDateLabel(from)} (${formatTime(from)} - ${formatTime(until)})`;
  }
  return `${formatDateLabel(from)} (${formatTime(from)}) - ${formatDateLabel(until)} (${formatTime(until)})`;
};

