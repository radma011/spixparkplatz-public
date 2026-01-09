import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  query,
  where,
  getDocs,
  Timestamp,
  FieldValue,
} from '@react-native-firebase/firestore';
import type {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import {ParkingAvailability, RecurrenceRule} from '../models/ParkingAvailability';

const db = getFirestore();

class ParkingAvailabilityService {
  private availabilitiesCollection = collection(db, 'parking_availabilities');

  /**
   * Convert Firestore document snapshot to ParkingAvailability object
   */
  availabilityFromDocSnap(docSnap: FirebaseFirestoreTypes.DocumentSnapshot): ParkingAvailability {
    const data = docSnap.data();
    if (!data) {
      throw new Error('Document data is undefined');
    }

    let recurrence: RecurrenceRule | undefined;
    if (data.recurrence) {
      recurrence = {
        pattern: data.recurrence.pattern,
        interval: data.recurrence.interval,
        daysOfWeek: data.recurrence.daysOfWeek,
        endDate: data.recurrence.endDate?.toDate ? data.recurrence.endDate.toDate() : undefined,
        occurrences: data.recurrence.occurrences,
      };
    }

    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const updatedAt = data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date();

    return {
      id: docSnap.id,
      userId: data.userId as string,
      facilityCode: (data.facilityCode as string) || '',
      spotId: data.spotId as string,
      from: (data.from as Timestamp).toDate(),
      until: (data.until as Timestamp).toDate(),
      recurrence,
      isActive: (data.isActive as boolean) ?? true,
      isMatched: (data.isMatched as boolean) ?? false,
      matchedRequestId: data.matchedRequestId as string | undefined,
      autoOffer: (data.autoOffer as boolean) ?? true,
      createdAt,
      updatedAt,
      createdBy: data.createdBy as string,
      username: data.username as string | undefined,
      phone: data.phone as string | undefined,
    };
  }

  /**
   * Create a new parking availability
   */
  async createAvailability(
    userId: string,
    facilityCode: string,
    spotId: string,
    from: Date,
    until: Date,
    recurrence?: RecurrenceRule,
    username?: string,
    phone?: string,
    autoOffer?: boolean,
  ): Promise<string> {
    const availabilityRef = doc(this.availabilitiesCollection);
    
    const availabilityData: any = {
      userId,
      facilityCode: facilityCode.trim().toUpperCase(),
      spotId,
      from: Timestamp.fromDate(from),
      until: Timestamp.fromDate(until),
      isActive: true,
      isMatched: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: userId,
    };

    if (username) availabilityData.username = username;
    if (phone) availabilityData.phone = phone;
    if (autoOffer !== undefined) availabilityData.autoOffer = autoOffer;

    if (recurrence) {
      const recurrenceData: any = {
        pattern: recurrence.pattern,
      };
      if (recurrence.interval !== undefined) recurrenceData.interval = recurrence.interval;
      if (recurrence.daysOfWeek !== undefined) recurrenceData.daysOfWeek = recurrence.daysOfWeek;
      if (recurrence.endDate !== undefined) recurrenceData.endDate = Timestamp.fromDate(recurrence.endDate);
      if (recurrence.occurrences !== undefined) recurrenceData.occurrences = recurrence.occurrences;
      availabilityData.recurrence = recurrenceData;
    }

    await setDoc(availabilityRef, availabilityData);
    return availabilityRef.id;
  }

  /**
   * Update an existing availability
   */
  async updateAvailability(
    availabilityId: string,
    updates: {
      from?: Date;
      until?: Date;
      spotId?: string;
      recurrence?: RecurrenceRule | null;
      isActive?: boolean;
      autoOffer?: boolean;
    },
  ): Promise<void> {
    const availabilityRef = doc(this.availabilitiesCollection, availabilityId);
    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (updates.from !== undefined) updateData.from = Timestamp.fromDate(updates.from);
    if (updates.until !== undefined) updateData.until = Timestamp.fromDate(updates.until);
    if (updates.spotId !== undefined) updateData.spotId = updates.spotId;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.autoOffer !== undefined) updateData.autoOffer = updates.autoOffer;

    if (updates.recurrence !== undefined) {
      if (updates.recurrence === null) {
        updateData.recurrence = FieldValue.delete();
      } else {
        const recurrenceData: any = {
          pattern: updates.recurrence.pattern,
        };
        if (updates.recurrence.interval !== undefined) recurrenceData.interval = updates.recurrence.interval;
        if (updates.recurrence.daysOfWeek !== undefined) recurrenceData.daysOfWeek = updates.recurrence.daysOfWeek;
        if (updates.recurrence.endDate !== undefined) recurrenceData.endDate = Timestamp.fromDate(updates.recurrence.endDate);
        if (updates.recurrence.occurrences !== undefined) recurrenceData.occurrences = updates.recurrence.occurrences;
        updateData.recurrence = recurrenceData;
      }
    }

    await updateDoc(availabilityRef, updateData);
  }

  /**
   * Delete an availability
   */
  async deleteAvailability(availabilityId: string): Promise<void> {
    const availabilityRef = doc(this.availabilitiesCollection, availabilityId);
    await deleteDoc(availabilityRef);
  }

  /**
   * Get a single availability by ID
   */
  async getAvailabilityById(availabilityId: string): Promise<ParkingAvailability | null> {
    const availabilityRef = doc(this.availabilitiesCollection, availabilityId);
    const docSnap = await getDoc(availabilityRef);
    if (!docSnap.exists()) {
      return null;
    }
    return this.availabilityFromDocSnap(docSnap);
  }

  /**
   * Get all availabilities for a user (filtered by facilityCode client-side)
   */
  async getUserAvailabilities(userId: string, facilityCode: string): Promise<ParkingAvailability[]> {
    const q = query(this.availabilitiesCollection, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
      .map((doc) => this.availabilityFromDocSnap(doc))
      .filter((av) => av.facilityCode === facilityCode);
  }

  /**
   * Watch user availabilities in real-time (filtered by facilityCode client-side)
   */
  watchUserAvailabilities(userId: string, facilityCode: string) {
    const q = query(this.availabilitiesCollection, where('userId', '==', userId));
    return {
      onSnapshot: (
        onNext: (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => void,
        onError?: (error: Error) => void,
      ) => {
        return q.onSnapshot(onNext, onError);
      },
    };
  }

  /**
   * Watch all active availabilities in a facility (filtered by facilityCode and isActive client-side)
   * Note: This queries all availabilities and filters client-side to avoid composite index requirements
   * This is not ideal for performance but works without requiring a composite index
   */
  watchFacilityAvailabilities(facilityCode: string) {
    const normalizedCode = facilityCode.trim().toUpperCase();
    // Query all availabilities (no filter to avoid index requirement) and filter client-side
    // This avoids the need for a composite index on (facilityCode, isActive)
    // In production, consider creating a composite index for better performance
    const q = query(this.availabilitiesCollection);
    return {
      onSnapshot: (
        onNext: (snapshot: FirebaseFirestoreTypes.QuerySnapshot) => void,
        onError?: (error: Error) => void,
      ) => {
        return q.onSnapshot(
          (snapshot) => {
            // Filter client-side
            const filtered = snapshot.docs.filter((doc) => {
              const data = doc.data();
              return (
                data.facilityCode === normalizedCode &&
                (data.isActive === true || data.isActive === undefined)
              );
            });
            // Create a filtered snapshot-like object
            onNext({
              docs: filtered,
              empty: filtered.length === 0,
              size: filtered.length,
              metadata: snapshot.metadata,
              query: snapshot.query,
            } as any);
          },
          onError,
        );
      },
    };
  }
}

export default new ParkingAvailabilityService();

