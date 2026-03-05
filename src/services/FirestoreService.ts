import {getApp} from '@react-native-firebase/app';
import {getAuth, getIdToken} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Timestamp,
  FieldValue,
  FieldPath,
} from '@react-native-firebase/firestore';
import type {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import {ParkingRequest} from '../models/ParkingRequest';
import {RequestOffer} from '../models/RequestOffer';
import {RequestComment} from '../models/RequestComment';

const db = getFirestore();

/** Offer made from a specific availability (offererId + spotId), with request context for display. */
export interface OfferFromAvailability {
  offer: RequestOffer;
  requestId: string;
  requestedBy?: string;
  requestFrom?: Date;
  requestUntil?: Date;
  isFulfilled?: boolean;
}

class FirestoreService {
  private requestsCollection = collection(db, 'parking_requests');
  private usersCollection = collection(db, 'users');
  private usersPublicCollection = collection(db, 'users_public');
  private facilitiesCollection = collection(db, 'facilities');

  private static readonly KEEP_VISIBLE_AFTER_END_MS = 3 * 60 * 60 * 1000; // 3 hours
  private static readonly RELEVANT_HISTORY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days (incl. archived)

  private cutoffTimestamp(msAgo: number): Timestamp {
    return Timestamp.fromDate(new Date(Date.now() - msAgo));
  }

  private offersCollection(requestId: string) {
    return collection(doc(this.requestsCollection, requestId), 'offers');
  }

  private commentsCollection(requestId: string) {
    return collection(doc(this.requestsCollection, requestId), 'comments');
  }

  private tokenDocId(token: string): string {
    // Firestore doc IDs cannot contain '/', so normalize it.
    return token.replace(/\//g, '_');
  }

  async upsertPublicUserData(uid: string, data: {username?: string; phone?: string}) {
    await setDoc(
      doc(this.usersPublicCollection, uid),
      {
        ...(data.username !== undefined ? {username: data.username} : {}),
        ...(data.phone !== undefined ? {phone: data.phone} : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }

  watchPublicUser(
    uid: string,
    callback: (data: {username?: string; phone?: string} | null) => void,
  ) {
    return doc(this.usersPublicCollection, uid).onSnapshot((snap: any) => {
      if (!snap?.exists) {
        callback(null);
        return;
      }
      const data = snap.data?.() ?? snap.data;
      callback({
        username: data?.username,
        phone: data?.phone,
      });
    }, (error: any) => {
      const code = String(error?.code ?? error?.message ?? '');
      if (code.includes('permission-denied')) {
        // Expected after logout: auth is null but listeners are still active briefly.
        callback(null);
        return;
      }
      console.error('users_public watch error:', uid, code || error);
    });
  }

  async getPublicUser(uid: string): Promise<{username?: string; phone?: string} | null> {
    try {
      const snap = await getDoc(doc(this.usersPublicCollection, uid));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        username: data?.username,
        phone: data?.phone,
      };
    } catch (e) {
      console.error('Failed to get public user:', uid, e);
      return null;
    }
  }

  // Stream aller offenen Anfragen
  watchOpenRequests(facilityCode: string) {
    // IMPORTANT: Keep query index-free by filtering only by isFulfilled + until, then filter facilityCode client-side
    // This avoids needing a composite index for facilityCode + isFulfilled + until
    return query(
      this.requestsCollection,
      where('isFulfilled', '==', false),
      // Keep open requests visible until 3 hours after end; after that, backend auto-archives them.
      where('until', '>', this.cutoffTimestamp(FirestoreService.KEEP_VISIBLE_AFTER_END_MS)),
      orderBy('until'),
    );
  }

  // Stream aller relevanten Anfragen (offene + erfüllte, wenn User beteiligt ist)
  watchRelevantRequests(currentUserId: string, facilityCode: string) {
    // Firestore unterstützt keine OR-Queries, daher holen wir alle Anfragen
    // die noch nicht abgelaufen sind oder erfüllt sind
    // und filtern dann clientseitig
    // IMPORTANT: Keep query index-free by filtering only by until, then filter facilityCode client-side
    // This avoids needing a composite index for facilityCode + until
    return query(
      this.requestsCollection,
      // Include a bit of history so archived items remain visible for involved users.
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
  }

  // Alle offenen Anfragen abrufen
  async getOpenRequests(facilityCode: string): Promise<ParkingRequest[]> {
    // IMPORTANT: Keep query index-free by filtering only by isFulfilled + until, then filter facilityCode client-side
    const q = query(
      this.requestsCollection,
      where('isFulfilled', '==', false),
      where('until', '>', this.cutoffTimestamp(FirestoreService.KEEP_VISIBLE_AFTER_END_MS)),
      orderBy('until'),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs
      .map((doc) => this.parkingRequestFromDocSnap(doc))
      .filter((r) => {
        // Filter by facilityCode client-side (index-free)
        if (r.facilityCode !== facilityCode) {
          return false;
        }
        return !r.isFulfilled && !r.offeredSpotId && !r.isArchived;
      });
  }

  // Alle relevanten Anfragen abrufen (offene + erfüllte, wenn User beteiligt ist)
  async getRelevantRequests(currentUserId: string, facilityCode: string): Promise<ParkingRequest[]> {
    // IMPORTANT: Keep query index-free by filtering only by until, then filter facilityCode client-side
    const q = query(
      this.requestsCollection,
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs
      .map((doc) => this.parkingRequestFromDocSnap(doc))
      .filter((r) => {
        // Filter by facilityCode client-side (index-free)
        if (r.facilityCode !== facilityCode) {
          return false;
        }
        
        if (r.isArchived) {
          return (
            r.requestedBy === currentUserId ||
            r.offeredBy === currentUserId ||
            (Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId))
          );
        }
        // Zeige offene Anfragen
        if (!r.isFulfilled && !r.offeredSpotId) {
          return true;
        }
        // Zeige erfüllte Anfragen, wenn der User beteiligt ist
        if (r.isFulfilled) {
          return (
            r.requestedBy === currentUserId ||
            r.offeredBy === currentUserId ||
            (Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId))
          );
        }
        // Zeige Anfragen mit Angebot, wenn der User beteiligt ist
        if (r.offeredSpotId) {
          return r.requestedBy === currentUserId || r.offeredBy === currentUserId;
        }
        return false;
      });
  }

  async archiveRequest(requestId: string, byUserId: string): Promise<void> {
    await updateDoc(doc(this.requestsCollection, requestId), {
      isArchived: true,
      archivedBy: byUserId,
      archivedAt: FieldValue.serverTimestamp(),
    });
  }

  // Neue Anfrage erstellen
  async createRequest(
    userId: string,
    username: string,
    phone: string,
    facilityCode: string,
    from: Date,
    until: Date,
    allowPartialOffers: boolean,
    initialComment?: string,
  ): Promise<ParkingRequest> {
    // Use Firestore's auto-generated ID to allow multiple identical requests
    // (e.g., when searching for multiple parking spots)
    // Check for very recent identical requests (within last 2 seconds) to prevent accidental double-taps
    const now = Date.now();
    const fromTs = Timestamp.fromDate(from);
    const untilTs = Timestamp.fromDate(until);
    
    // Query for recent requests from the same user (index-free: only filter by requestedBy)
    // Then filter by from/until client-side
    try {
      const recentQuery = query(
        this.requestsCollection,
        where('requestedBy', '==', userId),
      );
      const recentSnap = await getDocs(recentQuery);
      
      // Filter client-side for identical from/until and check timestamp
      for (const docSnap of recentSnap.docs) {
        const data = docSnap.data();
        const docFrom = data?.from;
        const docUntil = data?.until;
        if (docFrom && docUntil) {
          const docFromTime = docFrom.toMillis ? docFrom.toMillis() : docFrom.getTime();
          const docUntilTime = docUntil.toMillis ? docUntil.toMillis() : docUntil.getTime();
          // Check if from and until match
          if (docFromTime === from.getTime() && docUntilTime === until.getTime()) {
            const recentCreatedAt = data?.createdAt;
            if (recentCreatedAt) {
              const recentTime = recentCreatedAt.toMillis ? recentCreatedAt.toMillis() : recentCreatedAt.getTime();
              const timeDiff = now - recentTime;
              // If identical request was created within last 2 seconds, it's likely a double-tap
              if (timeDiff < 2000 && timeDiff >= 0) {
                // Return the existing request instead of creating a duplicate
                return this.parkingRequestFromDocSnap(docSnap);
              }
            }
          }
        }
      }
    } catch (error) {
      // If query fails, continue with creation
      console.log('Could not check for recent identical requests:', error);
    }
    
    // Normalize facilityCode (trim + uppercase) so server-side matching and filters work reliably
    const normalizedFacilityCode = String(facilityCode ?? '').trim().toUpperCase();

    // Create new request with auto-generated ID
    const requestRef = doc(this.requestsCollection);
    const request: ParkingRequest = {
      id: requestRef.id,
      requestedBy: userId,
      facilityCode: normalizedFacilityCode,
      // username/phone are resolved from users_public for display/contact
      from,
      until,
      isFulfilled: false,
      allowPartialOffers,
    };

    const trimmed = String(initialComment ?? '').trim();
    await setDoc(requestRef, {
      requestedBy: userId,
      facilityCode: normalizedFacilityCode,
      from: fromTs,
      until: untilTs,
      isFulfilled: false,
      isArchived: false,
      createdAt: FieldValue.serverTimestamp(),
      participantIds: [userId],
      commentCount: 0,
      allowPartialOffers,
      ...(trimmed.length > 0 ? {initialCommentText: trimmed, lastCommentText: trimmed} : {}),
    });

    return request;
  }

  async createComment(requestId: string, authorId: string, text: string): Promise<string> {
    const ref = doc(this.commentsCollection(requestId));
    await setDoc(ref, {
      authorId,
      text,
      createdAt: FieldValue.serverTimestamp(),
    });
    return ref.id;
  }

  async updateComment(requestId: string, commentId: string, newText: string): Promise<void> {
    const t = String(newText ?? '').trim();
    if (!t) return;
    await updateDoc(doc(this.commentsCollection(requestId), commentId), {
      text: t,
      editedAt: FieldValue.serverTimestamp(),
    });
  }

  watchComments(requestId: string) {
    return query(this.commentsCollection(requestId), orderBy('createdAt', 'asc'));
  }

  /**
   * Create an offer (partial or full) in a subcollection:
   * parking_requests/{requestId}/offers/{offerId}
   *
   * Full offers are detected server-side and will write offered* fields on the request document.
   */
  async createOffer(
    requestId: string,
    offeringUserId: string,
    spotId: string,
    from: Date,
    until: Date,
  ): Promise<string> {
    const offerRef = doc(this.offersCollection(requestId));
    await setDoc(offerRef, {
      offererId: offeringUserId,
      spotId,
      from: Timestamp.fromDate(from),
      until: Timestamp.fromDate(until),
      status: 'active',
      createdAt: FieldValue.serverTimestamp(),
    });
    return offerRef.id;
  }

  watchOffersForRequest(requestId: string) {
    // Keep this index-free: no filters, order by createdAt only.
    // We filter status client-side.
    return query(this.offersCollection(requestId), orderBy('createdAt', 'desc'));
  }

  /**
   * Watch all offers made by a given offerer for a given spot (e.g. from one availability).
   * Used on the "Frei" tab to show "Bereits angeboten" in each availability card.
   * Requires a composite index: collection group "offers", fields offererId (Asc), spotId (Asc).
   */
  watchOffersByOffererAndSpot(
    offererId: string,
    spotId: string,
    callback: (items: OfferFromAvailability[]) => void,
  ): () => void {
    const q = query(
      collectionGroup(db, 'offers'),
      where('offererId', '==', offererId),
      where('spotId', '==', spotId),
    );
    const unsubscribe = onSnapshot(
      q,
      async (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        const items: Array<{offer: RequestOffer; requestId: string}> = [];
        const requestIds = new Set<string>();
        for (const d of snap.docs) {
          const data = d.data();
          const requestDocRef = (d.ref as any).parent?.parent;
          const requestId = requestDocRef?.id ?? null;
          if (!requestId) continue;
          requestIds.add(requestId);
          const status = (data?.status ?? 'active') as RequestOffer['status'];
          items.push({
            requestId,
            offer: {
              id: d.id,
              requestId,
              offererId: data?.offererId ?? '',
              spotId: data?.spotId ?? '',
              from: (data?.from as any)?.toDate?.() ?? new Date(0),
              until: (data?.until as any)?.toDate?.() ?? new Date(0),
              status,
              createdAt: (data?.createdAt as any)?.toDate?.() ?? undefined,
            },
          });
        }
        if (requestIds.size === 0) {
          callback([]);
          return;
        }
        const ids = Array.from(requestIds);
        const requestSnaps = await Promise.all(
          ids.map((id) => getDoc(doc(this.requestsCollection, id))),
        );
        const requestById: Record<string, {requestedBy?: string; requestFrom?: Date; requestUntil?: Date; isFulfilled?: boolean}> = {};
        requestSnaps.forEach((s, i) => {
          const id = ids[i];
          if (!id || !s.exists()) return;
          const d = s.data();
          requestById[id] = {
            requestedBy: d?.requestedBy,
            requestFrom: (d?.from as any)?.toDate?.() ?? undefined,
            requestUntil: (d?.until as any)?.toDate?.() ?? undefined,
            isFulfilled: d?.isFulfilled === true,
          };
        });
        const result: OfferFromAvailability[] = items.map(({offer, requestId}) => ({
          offer,
          requestId,
          ...requestById[requestId],
        }));
        callback(result);
      },
      (err: any) => {
        if (String(err?.code ?? '').includes('permission-denied')) return;
        console.error('[FirestoreService] watchOffersByOffererAndSpot error:', err);
        callback([]);
      },
    );
    return unsubscribe;
  }

  async withdrawMyOffersForRequest(requestId: string, offeringUserId: string): Promise<void> {
    const q = query(this.offersCollection(requestId), where('offererId', '==', offeringUserId));
    const snap = await getDocs(q);
    // Setze sowohl 'active', 'accepted' als auch 'standby' Angebote auf 'withdrawn'
    const toWithdraw = snap.docs.filter((d) => {
      const status = d.data()?.status ?? 'active';
      return status === 'active' || status === 'accepted' || status === 'standby';
    });
    await Promise.all(
      toWithdraw.map((d) =>
        updateDoc(d.ref, {
          status: 'withdrawn',
          withdrawnBy: offeringUserId,
          withdrawnReason: 'offerer',
          updatedAt: FieldValue.serverTimestamp(),
        }),
      ),
    );
  }

  async withdrawOffer(requestId: string, offerId: string, offeringUserId: string): Promise<void> {
    await updateDoc(doc(this.offersCollection(requestId), offerId), {
      status: 'withdrawn',
      withdrawnBy: offeringUserId,
      withdrawnReason: 'offerer',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /** Angebot-Zeitfenster aktualisieren (z. B. nach Verfügbarkeits-Erweiterung), ohne Storno. */
  async updateOffer(
    requestId: string,
    offerId: string,
    from: Date,
    until: Date,
  ): Promise<void> {
    await updateDoc(doc(this.offersCollection(requestId), offerId), {
      from: Timestamp.fromDate(from),
      until: Timestamp.fromDate(until),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  /**
   * Check if a parking spot is already booked/offered for a given time range.
   * Returns the overlapping request if found, or null if no conflict.
   * Allows 1 minute overlap (e.g., one ends at 16:00, next can start at 16:00).
   */
  async checkSpotAvailability(
    spotId: string,
    facilityCode: string,
    from: Date,
    until: Date,
    excludeRequestId?: string,
  ): Promise<{request: ParkingRequest; overlapMinutes: number} | null> {
    const fromTs = Timestamp.fromDate(from);
    const untilTs = Timestamp.fromDate(until);
    const oneMinuteMs = 60 * 1000;

    // Query 1: Check fulfilled requests with this spot
    const fulfilledQuery = query(
      this.requestsCollection,
      where('facilityCode', '==', facilityCode),
      where('isFulfilled', '==', true),
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
    const fulfilledSnap = await getDocs(fulfilledQuery);

    for (const docSnap of fulfilledSnap.docs) {
      if (excludeRequestId && docSnap.id === excludeRequestId) continue;
      const data = docSnap.data();
      // Skip archived requests
      if (data.isArchived === true) continue;
      const fulfilledSpots = (data.fulfilledSpotIds as string[] | undefined) ?? [];
      if (!fulfilledSpots.includes(spotId)) continue;

      const reqFrom = data.from?.toDate ? data.from.toDate() : null;
      const reqUntil = data.until?.toDate ? data.until.toDate() : null;
      if (!reqFrom || !reqUntil) continue;

      // Check overlap (allowing 1 minute)
      const overlapStart = Math.max(from.getTime(), reqFrom.getTime());
      const overlapEnd = Math.min(until.getTime(), reqUntil.getTime());
      const overlapMs = overlapEnd - overlapStart;
      if (overlapMs > oneMinuteMs) {
        const overlapMinutes = Math.round(overlapMs / 60000);
        return {request: this.parkingRequestFromDocSnap(docSnap), overlapMinutes};
      }
    }

    // Query 2: Check requests with offeredSpotId (not yet fulfilled, but spot is offered)
    // Use index-free query: filter by until only, then filter by offeredSpotId client-side
    const offeredQuery = query(
      this.requestsCollection,
      where('facilityCode', '==', facilityCode),
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
    const offeredSnap = await getDocs(offeredQuery);

    for (const docSnap of offeredSnap.docs) {
      if (excludeRequestId && docSnap.id === excludeRequestId) continue;
      const data = docSnap.data();
      // Skip archived requests
      if (data.isArchived === true) continue;
      // Skip if already fulfilled (handled above)
      if (data.isFulfilled === true) continue;
      // Filter by offeredSpotId client-side (index-free)
      if (data.offeredSpotId !== spotId) continue;

      const reqFrom = data.from?.toDate ? data.from.toDate() : null;
      const reqUntil = data.until?.toDate ? data.until.toDate() : null;
      if (!reqFrom || !reqUntil) continue;

      // Check overlap (allowing 1 minute)
      const overlapStart = Math.max(from.getTime(), reqFrom.getTime());
      const overlapEnd = Math.min(until.getTime(), reqUntil.getTime());
      const overlapMs = overlapEnd - overlapStart;
      if (overlapMs > oneMinuteMs) {
        const overlapMinutes = Math.round(overlapMs / 60000);
        return {request: this.parkingRequestFromDocSnap(docSnap), overlapMinutes};
      }
    }

    return null;
  }

  async acceptOffer(requestId: string, offer: RequestOffer): Promise<void> {
    // Prüfe, ob das Angebot noch existiert und ob der Request noch existiert
    const requestRef = doc(this.requestsCollection, requestId);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) {
      throw new Error('Anfrage existiert nicht mehr');
    }
    
    const requestData = requestSnap.data();
    
    // Prüfe, ob der Request bereits erfüllt oder archiviert ist
    if (requestData.isFulfilled === true) {
      throw new Error('Die Anfrage wurde bereits erfüllt');
    }
    
    if (requestData.isArchived === true) {
      throw new Error('Die Anfrage wurde bereits archiviert');
    }
    
    // Prüfe, ob das spezifische Angebot noch aktiv ist
    // Diese Prüfung funktioniert sowohl für vollständige als auch für Teilangebote
    const offerRef = doc(this.offersCollection(requestId), offer.id);
    const offerSnap = await getDoc(offerRef);
    
    if (!offerSnap.exists()) {
      throw new Error('Das Angebot existiert nicht mehr');
    }
    
    const offerData = offerSnap.data();
    if (offerData?.status !== 'active') {
      throw new Error('Das Angebot ist nicht mehr aktiv');
    }
    
    // Accepting an offer does NOT immediately fulfill the request anymore.
    // The server will recompute coverage across all accepted offers and mark the request fulfilled
    // once the full window is covered without gaps.
    await updateDoc(offerRef, {
      status: 'accepted',
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  // Angebot stornieren (offered* Felder entfernen und Request wieder auf "offen" setzen)
  // WICHTIG: Diese Funktion wird vom Anbieter aufgerufen, der sein Angebot storniert
  // Gibt requestedBy zurück, damit der Aufrufer den Suchenden benachrichtigen kann.
  async cancelOffer(requestId: string, offeringUserId: string): Promise<{requestedBy: string} | null> {
    // Sicherheitsprüfung: Stelle sicher, dass der Benutzer tatsächlich ein aktives Angebot hat
    const q = query(this.offersCollection(requestId), where('offererId', '==', offeringUserId));
    const snap = await getDocs(q);
    const hasActiveOffer = snap.docs.some((d) => {
      const status = d.data()?.status ?? 'active';
      return status === 'active' || status === 'accepted' || status === 'standby';
    });

    const requestRef = doc(this.requestsCollection, requestId);
    const requestSnap = await getDoc(requestRef);
    const requestData = requestSnap.data();
    const hasFullOffer = requestData?.offeredBy === offeringUserId;
    const requestedBy = (requestData?.requestedBy as string) || null;

    if (!hasActiveOffer && !hasFullOffer) {
      throw new Error('Kein aktives Angebot zum Stornieren gefunden');
    }

    // Zuerst: Alle aktiven Angebote des Anbieters in der Subcollection auf 'withdrawn' setzen
    await this.withdrawMyOffersForRequest(requestId, offeringUserId);

    // Dann: Request-Dokument aktualisieren (offered* Felder entfernen)
    await updateDoc(doc(this.requestsCollection, requestId), {
      offeredSpotId: FieldValue.delete(),
      offeredBy: FieldValue.delete(),
      offeredAt: FieldValue.delete(),
      fullOfferId: FieldValue.delete(),
      isFulfilled: false,
      isArchived: false,
      fulfilledAt: FieldValue.delete(),
      fulfilledSpotIds: FieldValue.delete(),
      fulfilledByUserIds: FieldValue.delete(),
      fulfilledOfferIds: FieldValue.delete(),
      archivedBy: FieldValue.delete(),
      archivedAt: FieldValue.delete(),
    });

    return requestedBy ? {requestedBy} : null;
  }

  /** Anfragen, bei denen der User ein Angebot für den angegebenen Spot hat (für Re-Check nach Verfügbarkeitsänderung). */
  async getRequestsWithMyOfferForSpot(
    userId: string,
    facilityCode: string,
    spotId: string,
  ): Promise<ParkingRequest[]> {
    const q = query(this.requestsCollection, where('offeredBy', '==', userId));
    const snap = await getDocs(q);
    const list: ParkingRequest[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      if ((data.facilityCode as string) !== facilityCode || (data.offeredSpotId as string) !== spotId) {
        continue;
      }
      list.push(this.parkingRequestFromDocSnap(d));
    }
    return list;
  }

  /** Mein aktives (oder standby/accepted) Angebot für eine Anfrage. */
  async getMyActiveOfferForRequest(requestId: string, offererId: string): Promise<RequestOffer | null> {
    const q = query(this.offersCollection(requestId), where('offererId', '==', offererId));
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      const status = (data.status as string) ?? 'active';
      if (status !== 'active' && status !== 'accepted' && status !== 'standby') continue;
      const from = data.from?.toDate ? data.from.toDate() : null;
      const until = data.until?.toDate ? data.until.toDate() : null;
      if (!from || !until) continue;
      return {
        id: d.id,
        requestId,
        offererId: data.offererId as string,
        spotId: data.spotId as string,
        from,
        until,
        status: status as RequestOffer['status'],
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : undefined,
      } as RequestOffer;
    }
    return null;
  }

  // Anfrage als erfüllt markieren
  async fulfillRequest(requestId: string): Promise<void> {
    await updateDoc(doc(this.requestsCollection, requestId), {
      isFulfilled: true,
      fulfilledAt: FieldValue.serverTimestamp(),
    });
  }

  // Eigene Anfrage löschen
  // Wenn die Anfrage bereits ein Angebot hat, wird sie archiviert statt gelöscht,
  // damit der Anbieter informiert werden kann
  async deleteRequest(requestId: string): Promise<{hadOffer: boolean; offeredBy?: string}> {
    const requestRef = doc(this.requestsCollection, requestId);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) {
      return {hadOffer: false};
    }
    
    const data = requestSnap.data();
    const hasOffer = !!(data?.offeredSpotId || data?.offeredBy);
    const offeredBy = data?.offeredBy as string | undefined;
    
    // Wenn bereits ein Angebot vorhanden ist, archivieren statt löschen
    // damit der Anbieter informiert werden kann
    if (hasOffer) {
      await updateDoc(requestRef, {
        isArchived: true,
        archivedBy: data?.requestedBy,
        archivedAt: FieldValue.serverTimestamp(),
        // Entferne offered-Felder, damit der Request nicht mehr als "mit Angebot" erscheint
        offeredSpotId: FieldValue.delete(),
        offeredBy: FieldValue.delete(),
        offeredAt: FieldValue.delete(),
      });
      return {hadOffer: true, offeredBy};
    }
    
    // Wenn kein Angebot vorhanden ist, kann die Anfrage gelöscht werden
    await deleteDoc(requestRef);
    return {hadOffer: false};
  }

  // FCM Token speichern (pro Gerät/Installation; ein User kann mehrere Tokens haben)
  async saveFCMToken(
    userId: string,
    token: string,
    meta?: {platform?: string},
  ): Promise<void> {
    const tokenId = this.tokenDocId(token);
    const tokensCol = collection(doc(this.usersCollection, userId), 'fcm_tokens');
    await setDoc(
      doc(tokensCol, tokenId),
      {
        token,
        platform: meta?.platform ?? null,
        lastSeenAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }

  async deleteFCMToken(userId: string, token: string): Promise<void> {
    const tokenId = this.tokenDocId(token);
    const tokensCol = collection(doc(this.usersCollection, userId), 'fcm_tokens');
    await deleteDoc(doc(tokensCol, tokenId));
  }

  // User-Parkplatz setzen
  async setUserParkingSpot(userId: string, spotId: string): Promise<void> {
    await setDoc(
      doc(this.usersCollection, userId),
      {
        parkingSpotId: spotId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      {merge: true},
    );
  }

  // User-Parkplatz abrufen
  async getUserParkingSpot(userId: string): Promise<string | null> {
    const docRef = doc(this.usersCollection, userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data()?.parkingSpotId || null;
    }
    return null;
  }

  // Alle FCM Tokens abrufen (außer dem aktuellen User)
  async getAllFCMTokens(excludeUserId?: string): Promise<string[]> {
    let snapshot;
    if (excludeUserId) {
      // Firestore unterstützt '!=' nicht direkt für documentId, daher filtern wir manuell
      snapshot = await getDocs(this.usersCollection);
      return snapshot.docs
        .filter((d) => d.id !== excludeUserId)
        .map((d) => d.data())
        .filter((data) => data.fcmToken)
        .map((data) => data.fcmToken);
    } else {
      snapshot = await getDocs(this.usersCollection);
    }

    return snapshot.docs
      .map((doc) => doc.data())
      .filter((data) => data.fcmToken)
      .map((data) => data.fcmToken);
  }

  // Meine Anfragen abrufen
  watchMyRequests(userId: string, facilityCode: string) {
    // IMPORTANT: Keep query index-free by filtering only by requestedBy, then filter facilityCode client-side
    // We'll sort client-side.
    return query(
      this.requestsCollection,
      where('requestedBy', '==', userId),
    );
  }

  // Meine Angebote abrufen
  watchMyOffers(userId: string, facilityCode: string) {
    // IMPORTANT: Keep query index-free by filtering only by offeredBy, then filter facilityCode client-side
    return query(
      this.requestsCollection,
      where('offeredBy', '==', userId),
    );
  }

  // User-Daten speichern
  async saveUserData(userData: {
    uid: string;
    username: string;
    email: string;
    phone: string;
    parkingSpots: string[];
    facilityCode: string;
    createdAt: Date;
  }, isAdmin?: boolean): Promise<void> {
    await setDoc(
      doc(this.usersCollection, userData.uid),
      {
        username: userData.username,
        email: userData.email,
        phone: userData.phone,
        parkingSpots: userData.parkingSpots,
        facilityCode: userData.facilityCode,
        createdAt: Timestamp.fromDate(userData.createdAt),
        updatedAt: FieldValue.serverTimestamp(),
        ...(isAdmin === true ? {admin: true} : {}),
      },
      {merge: true},
    );

    await this.upsertPublicUserData(userData.uid, {
      username: userData.username,
      phone: userData.phone,
    });
  }

  // User-Daten abrufen
  async getUserData(uid: string): Promise<{
    uid: string;
    username: string;
    email: string;
    phone: string;
    parkingSpots: string[];
    facilityCode: string;
    createdAt: Date;
  } | null> {
    const docRef = doc(this.usersCollection, uid);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null;
    }

    const data = docSnap.data();
    return {
      uid: docSnap.id,
      username: data.username as string,
      email: data.email as string,
      phone: data.phone as string,
      parkingSpots: (data.parkingSpots as string[]) || [],
      facilityCode: (data.facilityCode as string) || '',
      createdAt: (data.createdAt as Timestamp)?.toDate() || new Date(),
    };
  }

  // User-Daten aktualisieren
  async updateUserData(uid: string, updates: {
    username?: string;
    phone?: string;
    parkingSpots?: string[];
    facilityCode?: string;
  }): Promise<void> {
    const updateData: any = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (updates.username !== undefined) {
      updateData.username = updates.username;
    }
    if (updates.phone !== undefined) {
      updateData.phone = updates.phone;
    }
    if (updates.parkingSpots !== undefined) {
      updateData.parkingSpots = updates.parkingSpots;
    }
    if (updates.facilityCode !== undefined) {
      updateData.facilityCode = updates.facilityCode;
    }

    await updateDoc(doc(this.usersCollection, uid), updateData);

    // Keep public profile in sync for other users (username/phone used for display/contact)
    await this.upsertPublicUserData(uid, {
      ...(updates.username !== undefined ? {username: updates.username} : {}),
      ...(updates.phone !== undefined ? {phone: updates.phone} : {}),
    });
  }

  async updateUserEmail(uid: string, email: string): Promise<void> {
    await updateDoc(doc(this.usersCollection, uid), {
      email,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  parkingRequestFromDocSnap(
    docSnap:
      | FirebaseFirestoreTypes.DocumentSnapshot
      | FirebaseFirestoreTypes.QueryDocumentSnapshot,
  ): ParkingRequest {
    const data = docSnap.data();
    if (!data) {
      throw new Error('Document data is missing');
    }
    return {
      id: docSnap.id,
      requestedBy: data.requestedBy as string,
      requestedByUsername: data.requestedByUsername as string | undefined,
      requestedByPhone: data.requestedByPhone as string | undefined,
      facilityCode: (data.facilityCode as string) || '',
      from: (data.from as Timestamp).toDate(),
      until: (data.until as Timestamp).toDate(),
      offeredSpotId: data.offeredSpotId as string | undefined,
      offeredBy: data.offeredBy as string | undefined,
      offeredByUsername: data.offeredByUsername as string | undefined,
      offeredByPhone: data.offeredByPhone as string | undefined,
      fullOfferId: data.fullOfferId as string | undefined,
      fulfilledOfferIds: (data.fulfilledOfferIds as string[] | undefined) ?? undefined,
      fulfilledSpotIds: (data.fulfilledSpotIds as string[] | undefined) ?? undefined,
      fulfilledByUserIds: (data.fulfilledByUserIds as string[] | undefined) ?? undefined,
      participantIds: (data.participantIds as string[] | undefined) ?? undefined,
      initialCommentText: data.initialCommentText as string | undefined,
      lastCommentText: data.lastCommentText as string | undefined,
      lastCommentAt: data.lastCommentAt ? (data.lastCommentAt as Timestamp).toDate() : undefined,
      commentCount: (data.commentCount as number | undefined) ?? undefined,
      isArchived: (data.isArchived as boolean | undefined) ?? false,
      archivedBy: data.archivedBy as string | undefined,
      archivedAt: data.archivedAt ? (data.archivedAt as Timestamp).toDate() : undefined,
      isFulfilled: (data.isFulfilled as boolean) || false,
      allowPartialOffers: data.allowPartialOffers !== false,
    };
  }

  async getParkingRequestById(requestId: string): Promise<ParkingRequest | null> {
    const snap = await getDoc(doc(this.requestsCollection, requestId));
    if (!snap.exists()) return null;
    return this.parkingRequestFromDocSnap(snap);
  }

  // Prüft, ob ein Facility-Code existiert
  async validateFacilityCode(facilityCode: string): Promise<boolean> {
    if (!facilityCode || !facilityCode.trim()) {
      return false;
    }
    const normalizedCode = facilityCode.trim().toUpperCase();
    const facilityRef = doc(this.facilitiesCollection, normalizedCode);
    const facilitySnap = await getDoc(facilityRef);
    return facilitySnap.exists();
  }

  // Ruft Facility-Informationen ab (optional, für zukünftige Erweiterungen)
  async getFacilityInfo(facilityCode: string): Promise<{code: string; name?: string; active?: boolean} | null> {
    if (!facilityCode || !facilityCode.trim()) {
      return null;
    }
    const normalizedCode = facilityCode.trim().toUpperCase();
    const facilityRef = doc(this.facilitiesCollection, normalizedCode);
    const facilitySnap = await getDoc(facilityRef);
    if (!facilitySnap.exists()) {
      return null;
    }
    const data = facilitySnap.data();
    // Code kommt von der Document-ID, nicht aus dem Dokument
    return {
      code: normalizedCode, // Document-ID
      name: data?.name as string | undefined,
      active: data?.active !== false, // Default: true, wenn nicht explizit false
    };
  }

  /**
   * Ruft die Anzahl der für diese Parkanlage registrierten Nutzer ab (per HTTP Function).
   * Gibt bei Fehler oder ohne Auth null zurück.
   */
  async getFacilityMemberCount(facilityCode: string): Promise<number | null> {
    if (!facilityCode || !facilityCode.trim()) return null;
    const normalizedCode = facilityCode.trim().toUpperCase();
    const auth = getAuth(getApp());
    const user = auth.currentUser;
    if (!user) return null;
    try {
      const token = await getIdToken(user, false);
      const projectId = getApp().options.projectId;
      if (!projectId) return null;
      const region = 'europe-west3';
      const url = `https://${region}-${projectId}.cloudfunctions.net/getFacilityMemberCountHttp`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({data: {facilityCode: normalizedCode}}),
      });
      const text = await res.text().catch(() => '');
      const json: {result?: {count?: number}; error?: {message?: string}} = (() => {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })();
      if (!res.ok) return null;
      const count = json?.result?.count;
      return typeof count === 'number' && count >= 0 ? count : null;
    } catch {
      return null;
    }
  }

  // Erstellt ein neues Facility (wird beim Registrieren verwendet)
  async createFacility(code: string, name?: string): Promise<void> {
    if (!code || !code.trim()) {
      throw new Error('Facility-Code darf nicht leer sein');
    }
    const normalizedCode = code.trim().toUpperCase();
    const facilityRef = doc(this.facilitiesCollection, normalizedCode);
    
    // Prüfen, ob Facility bereits existiert
    const existing = await getDoc(facilityRef);
    if (existing.exists()) {
      throw new Error('Facility-Code existiert bereits');
    }
    
    // Facility erstellen
    await setDoc(facilityRef, {
      name: name || normalizedCode,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
}

export default new FirestoreService();

