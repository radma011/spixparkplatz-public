export interface RecurrenceRule {
  pattern: 'daily' | 'weekly' | 'monthly';
  interval?: number; // e.g., every 2 days, every 3 weeks
  daysOfWeek?: number[]; // 0 = Sunday, 1 = Monday, etc. (for weekly)
  endDate?: Date;
  occurrences?: number; // Number of occurrences
}

export interface ParkingAvailability {
  id: string;
  userId: string;
  facilityCode: string;
  spotId: string;
  from: Date;
  until: Date;
  recurrence?: RecurrenceRule;
  isActive: boolean;
  isMatched?: boolean;
  matchedRequestId?: string;
  /** Gesetzt bei automatischer Archivierung 24h nach Ende der (letzten) Verfügbarkeit */
  isArchived?: boolean;
  archivedAt?: Date;
  archivedBy?: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  username?: string;
  phone?: string;
  autoOffer?: boolean;
}

export const isAvailabilityActive = (availability: ParkingAvailability): boolean => {
  return availability.isActive === true;
};

export const isRecurring = (availability: ParkingAvailability): boolean => {
  return availability.recurrence !== undefined && availability.recurrence !== null;
};

