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
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  username?: string;
  phone?: string;
}

export const isAvailabilityActive = (availability: ParkingAvailability): boolean => {
  return availability.isActive === true;
};

export const isRecurring = (availability: ParkingAvailability): boolean => {
  return availability.recurrence !== undefined && availability.recurrence !== null;
};

