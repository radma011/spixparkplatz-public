import {getApp} from '@react-native-firebase/app';
import {getAuth, getIdToken} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  deleteField,
  FieldPath,
} from '@react-native-firebase/firestore';
import type {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import {ParkingRequest, isOpen} from '../models/ParkingRequest';
import {RequestOffer} from '../models/RequestOffer';
import {RequestComment} from '../models/RequestComment';
import {BLOCK_TOLERANCE_MS, rangesOverlapWithTolerance, toDate, mergeIntervals} from '../shared/matching';
import {isOfferBlockingOccupancy} from '../utils/offerOccupancy';
import {
  CALENDAR_OFFER_DEBUG,
  formatOfferDebugTime,
  logCalendarOffer,
} from '../utils/calendarOfferDebug';

const db = getFirestore();

function requestIdFromOfferRef(ref: {path?: string}): string | null {
  const path = ref.path;
  if (!path) return null;
  const parts = path.split('/');
  const offersIdx = parts.lastIndexOf('offers');
  if (offersIdx <= 0) return null;
  return parts[offersIdx - 1] ?? null;
}

function normalizeSpotId(spotId: string): string {
  return String(spotId).trim();
}

function spotIdsMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  return normalizeSpotId(String(a ?? '')).toUpperCase() === normalizeSpotId(String(b ?? '')).toUpperCase();
}

function offererSpotKey(offererId: string, spotId: string): string {
  return `${offererId}:${normalizeSpotId(spotId)}`;
}

export type OffererSpotPair = {
  offererId: string;
  spotId: string;
  resultKey: string;
};

type DocData = FirebaseFirestoreTypes.DocumentData;
type QueryDocSnap = FirebaseFirestoreTypes.QueryDocumentSnapshot<DocData>;

function readDocData(snap: {data: () => unknown}): DocData | undefined {
  return snap.data() as DocData | undefined;
}

/** Offer made from a specific availability (offererId + spotId), with request context for display. */
export interface OfferFromAvailability {
  offer: RequestOffer;
  requestId: string;
  requestedBy?: string;
  /** Username from request doc (if set) or to be resolved via users_public. */
  requestedByUsername?: string;
  requestFrom?: Date;
  requestUntil?: Date;
  isFulfilled?: boolean;
}

/** Client-side filter for relevant requests (live snapshot + refresh). */
export function shouldIncludeRelevantRequest(
  r: ParkingRequest,
  currentUserId: string,
  facilityCode: string,
  options?: {isAdmin?: boolean},
): boolean {
  if (r.facilityCode !== facilityCode) {
    return false;
  }

  const isInvolved =
    r.requestedBy === currentUserId ||
    r.offeredBy === currentUserId ||
    (Array.isArray(r.fulfilledByUserIds) && r.fulfilledByUserIds.includes(currentUserId));

  if (r.isArchived) {
    return isInvolved;
  }
  if (isOpen(r)) {
    return true;
  }
  if (r.isFulfilled) {
    return options?.isAdmin === true || isInvolved;
  }
  if (r.offeredSpotId && !r.isFulfilled) {
    return true;
  }
  return false;
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
        updatedAt: serverTimestamp(),
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
      const data = readDocData(snap);
      return {
        username: data?.username as string | undefined,
        phone: data?.phone as string | undefined,
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
      .map((docSnap: QueryDocSnap) => this.parkingRequestFromDocSnap(docSnap))
      .filter((r: ParkingRequest) => {
        // Filter by facilityCode client-side (index-free)
        if (r.facilityCode !== facilityCode) {
          return false;
        }
        return !r.isFulfilled && !r.offeredSpotId && !r.isArchived;
      });
  }

  // Alle relevanten Anfragen abrufen (offene + erfüllte, wenn User beteiligt ist)
  async getRelevantRequests(
    currentUserId: string,
    facilityCode: string,
    options?: {isAdmin?: boolean},
  ): Promise<ParkingRequest[]> {
    // IMPORTANT: Keep query index-free by filtering only by until, then filter facilityCode client-side
    const q = query(
      this.requestsCollection,
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
    const snapshot = await getDocs(q);

    return snapshot.docs
      .map((docSnap: QueryDocSnap) => this.parkingRequestFromDocSnap(docSnap))
      .filter((r: ParkingRequest) => shouldIncludeRelevantRequest(r, currentUserId, facilityCode, options));
  }

  async archiveRequest(requestId: string, byUserId: string): Promise<void> {
    await updateDoc(doc(this.requestsCollection, requestId), {
      isArchived: true,
      archivedBy: byUserId,
      archivedAt: serverTimestamp(),
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
      ...(username != null && username !== '' ? {requestedByUsername: username} : {}),
      ...(phone != null && phone !== '' ? {requestedByPhone: phone} : {}),
      facilityCode: normalizedFacilityCode,
      from: fromTs,
      until: untilTs,
      isFulfilled: false,
      isArchived: false,
      createdAt: serverTimestamp(),
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
      createdAt: serverTimestamp(),
    });
    return ref.id;
  }

  async updateComment(requestId: string, commentId: string, newText: string): Promise<void> {
    const t = String(newText ?? '').trim();
    if (!t) return;
    await updateDoc(doc(this.commentsCollection(requestId), commentId), {
      text: t,
      editedAt: serverTimestamp(),
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
      createdAt: serverTimestamp(),
    });
    return offerRef.id;
  }

  watchOffersForRequest(requestId: string) {
    // Keep this index-free: no filters, order by createdAt only.
    // We filter status client-side.
    return query(this.offersCollection(requestId), orderBy('createdAt', 'desc'));
  }

  async getOffersForRequest(requestId: string): Promise<RequestOffer[]> {
    const q = query(this.offersCollection(requestId), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map((d: QueryDocSnap) => {
      const data = d.data();
      const status = (data?.status ?? 'active') as RequestOffer['status'];
      const createdAt = data?.createdAt ? (data.createdAt as any).toDate() : undefined;
      return {
        id: d.id,
        requestId,
        offererId: data?.offererId ?? '',
        spotId: data?.spotId ?? '',
        from: (data?.from as any)?.toDate?.() ?? new Date(0),
        until: (data?.until as any)?.toDate?.() ?? new Date(0),
        status,
        createdAt,
      } as RequestOffer;
    });
  }

  private async mapOfferGroupSnapshot(
    snap: FirebaseFirestoreTypes.QuerySnapshot,
    facilityCode?: string,
  ): Promise<OfferFromAvailability[]> {
    const items: Array<{offer: RequestOffer; requestId: string}> = [];
    const requestIds = new Set<string>();
    for (const d of snap.docs) {
      const data = d.data();
      const requestId =
        requestIdFromOfferRef(d.ref as {path?: string}) ??
        ((d.ref as {parent?: {parent?: {id?: string}}}).parent?.parent?.id ?? null);
      if (!requestId) continue;

      const from = toDate(data?.from as Parameters<typeof toDate>[0]);
      const until = toDate(data?.until as Parameters<typeof toDate>[0]);
      if (!from || !until) continue;

      requestIds.add(requestId);
      const status = (data?.status ?? 'active') as RequestOffer['status'];
      items.push({
        requestId,
        offer: {
          id: d.id,
          requestId,
          offererId: data?.offererId ?? '',
          spotId: data?.spotId ?? '',
          from,
          until,
          status,
          createdAt: toDate(data?.createdAt as Parameters<typeof toDate>[0]) ?? undefined,
        },
      });
    }
    if (requestIds.size === 0) return [];
    const ids = Array.from(requestIds);
    const requestSnaps = await Promise.allSettled(
      ids.map((id) => getDoc(doc(this.requestsCollection, id))),
    );
    const requestById: Record<
      string,
      {
        facilityCode?: string;
        requestedBy?: string;
        requestedByUsername?: string;
        requestFrom?: Date;
        requestUntil?: Date;
        isFulfilled?: boolean;
        isArchived?: boolean;
      }
    > = {};
    requestSnaps.forEach((result, i) => {
      const id = ids[i];
      if (!id || result.status !== 'fulfilled' || !result.value.exists()) return;
      const d = readDocData(result.value);
      if (!d) return;
      requestById[id] = {
        facilityCode: d.facilityCode as string | undefined,
        requestedBy: d.requestedBy as string | undefined,
        requestedByUsername: d.requestedByUsername as string | undefined,
        requestFrom: toDate(d.from as Parameters<typeof toDate>[0]) ?? undefined,
        requestUntil: toDate(d.until as Parameters<typeof toDate>[0]) ?? undefined,
        isFulfilled: d.isFulfilled === true,
        isArchived: d.isArchived === true,
      };
    });
    let result: OfferFromAvailability[] = items.map(({offer, requestId}) => ({
      offer,
      requestId,
      ...requestById[requestId],
    }));
    result = result.filter((item) => {
      if (!isOfferBlockingOccupancy(item.offer.status)) return false;
      if (requestById[item.requestId]?.isArchived) return false;
      return true;
    });
    if (facilityCode != null && facilityCode !== '') {
      const normalized = facilityCode.trim().toUpperCase();
      result = result.filter((item) => {
        const reqFacility = (requestById[item.requestId]?.facilityCode ?? '').trim().toUpperCase();
        return reqFacility === normalized;
      });
    }
    return result;
  }

  private tryMapOfferDoc(
    offerDoc: QueryDocSnap,
    requestId: string,
    req: Pick<
      ParkingRequest,
      'requestedBy' | 'requestedByUsername' | 'from' | 'until' | 'isFulfilled' | 'isArchived'
    >,
  ): OfferFromAvailability | null {
    const data = offerDoc.data();
    const rawOffererId = String(data.offererId ?? '');
    const rawSpotId = String(data.spotId ?? '');
    const status = (data?.status ?? 'active') as RequestOffer['status'];
    if (!isOfferBlockingOccupancy(status)) return null;
    const from = toDate(data.from as Parameters<typeof toDate>[0]);
    const until = toDate(data.until as Parameters<typeof toDate>[0]);
    if (!from || !until) return null;
    return {
      offer: {
        id: offerDoc.id,
        requestId,
        offererId: rawOffererId,
        spotId: rawSpotId,
        from,
        until,
        status,
        createdAt: toDate(data.createdAt as Parameters<typeof toDate>[0]) ?? undefined,
      },
      requestId,
      requestedBy: req.requestedBy,
      requestedByUsername: req.requestedByUsername,
      requestFrom: req.from,
      requestUntil: req.until,
      isFulfilled: req.isFulfilled === true,
    };
  }

  private mapRequestOffersForOffererSpot(
    offerDocs: QueryDocSnap[],
    offererId: string,
    spotId: string,
    requestId: string,
    req: Pick<
      ParkingRequest,
      'requestedBy' | 'requestedByUsername' | 'from' | 'until' | 'isFulfilled' | 'isArchived'
    >,
  ): OfferFromAvailability[] {
    const items: OfferFromAvailability[] = [];
    for (const offerDoc of offerDocs) {
      const data = offerDoc.data();
      const rawOffererId = String(data.offererId ?? '');
      const rawSpotId = String(data.spotId ?? '');
      const offererMatch = rawOffererId === offererId;
      const spotMatch = spotIdsMatch(data.spotId as string | undefined, spotId);
      if (!offererMatch) {
        if (CALENDAR_OFFER_DEBUG && spotMatch) {
          logCalendarOffer('offer skipped: offererId mismatch (spot matched)', {
            requestId,
            offerId: offerDoc.id,
            wantOffererId: offererId,
            gotOffererId: rawOffererId,
            spotId: rawSpotId,
            status: data.status ?? 'active',
          });
        }
        continue;
      }
      if (!spotMatch) {
        if (CALENDAR_OFFER_DEBUG) {
          logCalendarOffer('offer skipped: spotId mismatch (offerer matched)', {
            requestId,
            offerId: offerDoc.id,
            wantSpotId: spotId,
            gotSpotId: rawSpotId,
            status: data.status ?? 'active',
          });
        }
        continue;
      }
      const mapped = this.tryMapOfferDoc(offerDoc, requestId, req);
      if (!mapped) {
        if (CALENDAR_OFFER_DEBUG) {
          logCalendarOffer('offer skipped: invalid or non-blocking', {
            requestId,
            offerId: offerDoc.id,
            status: data.status ?? 'active',
          });
        }
        continue;
      }
      if (CALENDAR_OFFER_DEBUG) {
        logCalendarOffer('offer matched', {
          requestId,
          offerId: offerDoc.id,
          offererId: rawOffererId,
          spotId: rawSpotId,
          status: mapped.offer.status,
          from: formatOfferDebugTime(mapped.offer.from),
          until: formatOfferDebugTime(mapped.offer.until),
        });
      }
      items.push(mapped);
    }
    return items;
  }

  private async loadOffersBucketedFromRequestDocs(
    requestDocs: QueryDocSnap[],
    facilityCode: string,
    targetSpotKeys: Set<string>,
  ): Promise<Map<string, OfferFromAvailability[]>> {
    const buckets = new Map<string, OfferFromAvailability[]>();
    for (const key of targetSpotKeys) buckets.set(key, []);

    const normalizedFacility = facilityCode.trim().toUpperCase();
    const filtered = requestDocs.filter((reqDoc) => {
      const reqData = reqDoc.data();
      if (String(reqData.facilityCode || '').trim().toUpperCase() !== normalizedFacility) return false;
      return reqData.isArchived !== true;
    });

    await Promise.all(
      filtered.map(async (reqDoc) => {
        const reqData = reqDoc.data();
        const offersSnap = await getDocs(query(this.offersCollection(reqDoc.id)));
        const req = {
          requestedBy: reqData.requestedBy as string,
          requestedByUsername: reqData.requestedByUsername as string | undefined,
          from: toDate(reqData.from as Parameters<typeof toDate>[0]) ?? new Date(0),
          until: toDate(reqData.until as Parameters<typeof toDate>[0]) ?? new Date(0),
          isFulfilled: reqData.isFulfilled === true,
          isArchived: reqData.isArchived === true,
        };
        for (const offerDoc of offersSnap.docs as QueryDocSnap[]) {
          const mapped = this.tryMapOfferDoc(offerDoc, reqDoc.id, req);
          if (!mapped) continue;
          const key = offererSpotKey(mapped.offer.offererId, mapped.offer.spotId);
          if (!targetSpotKeys.has(key)) continue;
          buckets.get(key)!.push(mapped);
        }
      }),
    );
    return buckets;
  }

  private watchFacilityOfferBuckets(
    facilityCode: string,
    targetSpotKeys: Set<string>,
    callback: (buckets: Record<string, OfferFromAvailability[]>) => void,
    debugLabel: string,
  ): () => void {
    if (targetSpotKeys.size === 0) {
      callback({});
      return () => {};
    }

    const q = query(
      this.requestsCollection,
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
    let scanGeneration = 0;
    let cancelled = false;
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const generation = ++scanGeneration;
        try {
          const buckets = await this.loadOffersBucketedFromRequestDocs(
            snap.docs as QueryDocSnap[],
            facilityCode,
            targetSpotKeys,
          );
          if (cancelled || generation !== scanGeneration) return;
          const result: Record<string, OfferFromAvailability[]> = {};
          for (const key of targetSpotKeys) {
            result[key] = buckets.get(key) ?? [];
          }
          if (CALENDAR_OFFER_DEBUG) {
            logCalendarOffer(`${debugLabel} emit`, {
              facilityCode,
              requestDocCount: snap.docs.length,
              pairCount: targetSpotKeys.size,
              offersByKey: Object.fromEntries(
                Object.entries(result).map(([k, v]) => [k, v.length]),
              ),
            });
          }
          callback(result);
        } catch (e) {
          if (cancelled || generation !== scanGeneration) return;
          console.error(`[FirestoreService] ${debugLabel} map error:`, e);
          const empty: Record<string, OfferFromAvailability[]> = {};
          for (const key of targetSpotKeys) empty[key] = [];
          callback(empty);
        }
      },
      (err: unknown) => {
        if (cancelled) return;
        console.error(`[FirestoreService] ${debugLabel} error:`, err);
        const empty: Record<string, OfferFromAvailability[]> = {};
        for (const key of targetSpotKeys) empty[key] = [];
        callback(empty);
      },
    );
    return () => {
      cancelled = true;
      scanGeneration += 1;
      unsub();
    };
  }

  /**
   * One facility scan for many offerer+spot pairs (calendar, Frei tab).
   * Much faster than one scan per availability.
   */
  watchOffersByOffererSpotPairs(
    facilityCode: string,
    pairs: OffererSpotPair[],
    callback: (offersByKey: Record<string, OfferFromAvailability[]>) => void,
  ): () => void {
    const targetSpotKeys = new Set(pairs.map((p) => offererSpotKey(p.offererId, p.spotId)));

    return this.watchFacilityOfferBuckets(
      facilityCode,
      targetSpotKeys,
      (bucketsBySpotKey) => {
        const result: Record<string, OfferFromAvailability[]> = {};
        for (const p of pairs) {
          const spotKey = offererSpotKey(p.offererId, p.spotId);
          result[p.resultKey] = bucketsBySpotKey[spotKey] ?? [];
        }
        callback(result);
      },
      'watchOffersByOffererSpotPairs',
    );
  }

  /**
   * Live listeners on offers subcollections for requests already loaded in the UI.
   * Avoids collectionGroup (Android permission issues) and facility-wide scans.
   */
  private watchOffersByOffererAndSpotViaRequestOffers(
    requests: ParkingRequest[],
    offererId: string,
    spotId: string,
    callback: (items: OfferFromAvailability[]) => void,
  ): () => void {
    const byRequestId = new Map<string, OfferFromAvailability[]>();
    const emit = () => {
      const all = Array.from(byRequestId.values()).flat();
      if (CALENDAR_OFFER_DEBUG) {
        logCalendarOffer('request-offers emit', {
          offererId,
          spotId,
          requestCount: requests.length,
          matchedOfferCount: all.length,
          offers: all.map((o) => ({
            requestId: o.requestId,
            offerId: o.offer.id,
            status: o.offer.status,
            from: formatOfferDebugTime(o.offer.from),
            until: formatOfferDebugTime(o.offer.until),
          })),
        });
      }
      callback(all);
    };

    if (requests.length === 0) {
      if (CALENDAR_OFFER_DEBUG) {
        logCalendarOffer('request-offers: no known requests, returning empty', {offererId, spotId});
      }
      callback([]);
      return () => {};
    }

    if (CALENDAR_OFFER_DEBUG) {
      logCalendarOffer('request-offers subscribe', {
        offererId,
        spotId,
        requestCount: requests.length,
        requestIds: requests.map((r) => r.id),
      });
    }

    const unsubs = requests.map((req) => {
      if (req.isArchived) {
        byRequestId.set(req.id, []);
        return () => {};
      }
      return onSnapshot(
        query(this.offersCollection(req.id)),
        (snap) => {
          if (CALENDAR_OFFER_DEBUG) {
            logCalendarOffer('request-offers snapshot', {
              requestId: req.id,
              offererId,
              spotId,
              totalOfferDocs: snap.docs.length,
              offerDocIds: snap.docs.map((d: QueryDocSnap) => d.id),
            });
          }
          byRequestId.set(
            req.id,
            this.mapRequestOffersForOffererSpot(
              snap.docs as QueryDocSnap[],
              offererId,
              spotId,
              req.id,
              req,
            ),
          );
          emit();
        },
        (err: unknown) => {
          console.error(
            '[FirestoreService] watchOffersByOffererAndSpot request offers error:',
            req.id,
            err,
          );
          byRequestId.set(req.id, []);
          emit();
        },
      );
    });

    return () => unsubs.forEach((u) => u());
  }

  private watchOffersByOffererAndSpotViaFacilityRequests(
    offererId: string,
    spotId: string,
    callback: (items: OfferFromAvailability[]) => void,
    facilityCode: string,
  ): () => void {
    const key = offererSpotKey(offererId, spotId);
    return this.watchFacilityOfferBuckets(
      facilityCode,
      new Set([key]),
      (buckets) => callback(buckets[key] ?? []),
      'watchOffersByOffererAndSpot',
    );
  }

  /**
   * Watch all offers on a spot (any offerer). Used by calendar for real occupancy on the spot.
   * Uses facility request scan (no collection group) when facilityCode is set.
   */
  watchOffersBySpot(
    spotId: string,
    callback: (items: OfferFromAvailability[]) => void,
    facilityCode?: string,
  ): () => void {
    if (facilityCode?.trim()) {
      return this.watchOffersOnSpotViaFacilityRequests(spotId, callback, facilityCode);
    }

    const normalizedSpotId = normalizeSpotId(spotId);
    const q = query(collectionGroup(db, 'offers'), where('spotId', '==', normalizedSpotId));
    return onSnapshot(
      q,
      async (snap) => {
        try {
          const result = await this.mapOfferGroupSnapshot(snap, facilityCode);
          callback(result);
        } catch (e) {
          console.error('[FirestoreService] watchOffersBySpot map error:', e);
          callback([]);
        }
      },
      (err: unknown) => {
        console.error('[FirestoreService] watchOffersBySpot error:', err);
        callback([]);
      },
    );
  }

  private watchOffersOnSpotViaFacilityRequests(
    spotId: string,
    callback: (items: OfferFromAvailability[]) => void,
    facilityCode: string,
  ): () => void {
    const q = query(
      this.requestsCollection,
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
    return onSnapshot(
      q,
      async (snap) => {
        try {
          const normalizedFacility = facilityCode.trim().toUpperCase();
          const filteredDocs = (snap.docs as QueryDocSnap[]).filter((reqDoc) => {
            const reqData = reqDoc.data();
            if (String(reqData.facilityCode || '').trim().toUpperCase() !== normalizedFacility) {
              return false;
            }
            return reqData.isArchived !== true;
          });
          const items: OfferFromAvailability[] = [];
          await Promise.all(
            filteredDocs.map(async (reqDoc) => {
              const reqData = reqDoc.data();
              const offersSnap = await getDocs(query(this.offersCollection(reqDoc.id)));
              for (const offerDoc of offersSnap.docs) {
                const data = offerDoc.data();
                if (!spotIdsMatch(data.spotId as string | undefined, spotId)) continue;
                const status = (data?.status ?? 'active') as RequestOffer['status'];
                if (!isOfferBlockingOccupancy(status)) continue;
                const from = toDate(data.from as Parameters<typeof toDate>[0]);
                const until = toDate(data.until as Parameters<typeof toDate>[0]);
                if (!from || !until) continue;
                items.push({
                  offer: {
                    id: offerDoc.id,
                    requestId: reqDoc.id,
                    offererId: data.offererId ?? '',
                    spotId: String(data.spotId ?? spotId),
                    from,
                    until,
                    status,
                    createdAt: toDate(data.createdAt as Parameters<typeof toDate>[0]) ?? undefined,
                  },
                  requestId: reqDoc.id,
                  requestedBy: reqData.requestedBy as string | undefined,
                  requestedByUsername: reqData.requestedByUsername as string | undefined,
                  requestFrom: toDate(reqData.from as Parameters<typeof toDate>[0]) ?? undefined,
                  requestUntil: toDate(reqData.until as Parameters<typeof toDate>[0]) ?? undefined,
                  isFulfilled: reqData.isFulfilled === true,
                });
              }
            }),
          );
          callback(items);
        } catch (e) {
          console.error('[FirestoreService] watchOffersBySpot facility scan map error:', e);
          callback([]);
        }
      },
      (err: unknown) => {
        console.error('[FirestoreService] watchOffersBySpot facility scan error:', err);
        callback([]);
      },
    );
  }

  /**
   * Watch all offers made by a given offerer for a given spot (e.g. from one availability).
   * Used on the "Frei" tab and calendar. Scans recent facility requests (no collection group).
   */
  watchOffersByOffererAndSpot(
    offererId: string,
    spotId: string,
    callback: (items: OfferFromAvailability[]) => void,
    facilityCode?: string,
    _knownRequests?: ParkingRequest[],
  ): () => void {
    if (CALENDAR_OFFER_DEBUG) {
      logCalendarOffer('watchOffersByOffererAndSpot start', {
        path: facilityCode?.trim() ? 'facility-scan' : 'collection-group',
        offererId,
        spotId,
        facilityCode: facilityCode ?? null,
      });
    }

    if (facilityCode?.trim()) {
      return this.watchOffersByOffererAndSpotViaFacilityRequests(
        offererId,
        spotId,
        callback,
        facilityCode,
      );
    }

    const normalizedSpotId = normalizeSpotId(spotId);
    const q = query(
      collectionGroup(db, 'offers'),
      where('offererId', '==', offererId),
      where('spotId', '==', normalizedSpotId),
    );
    return onSnapshot(
      q,
      async (snap: FirebaseFirestoreTypes.QuerySnapshot) => {
        try {
          callback(await this.mapOfferGroupSnapshot(snap, facilityCode));
        } catch (e) {
          console.error('[FirestoreService] watchOffersByOffererAndSpot map error:', e);
          callback([]);
        }
      },
      (err: unknown) => {
        console.error('[FirestoreService] watchOffersByOffererAndSpot error:', err);
        callback([]);
      },
    );
  }

  async withdrawMyOffersForRequest(requestId: string, offeringUserId: string): Promise<void> {
    const q = query(this.offersCollection(requestId), where('offererId', '==', offeringUserId));
    const snap = await getDocs(q);
    // Setze sowohl 'active', 'accepted' als auch 'standby' Angebote auf 'withdrawn'
    const toWithdraw = snap.docs.filter((d: QueryDocSnap) => {
      const status = d.data()?.status ?? 'active';
      return status === 'active' || status === 'accepted' || status === 'standby';
    });
    await Promise.all(
      toWithdraw.map((d: QueryDocSnap) =>
        updateDoc(d.ref, {
          status: 'withdrawn',
          withdrawnBy: offeringUserId,
          withdrawnReason: 'offerer',
          updatedAt: serverTimestamp(),
        }),
      ),
    );
  }

  async withdrawOffer(requestId: string, offerId: string, offeringUserId: string): Promise<void> {
    await updateDoc(doc(this.offersCollection(requestId), offerId), {
      status: 'withdrawn',
      withdrawnBy: offeringUserId,
      withdrawnReason: 'offerer',
      updatedAt: serverTimestamp(),
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
      updatedAt: serverTimestamp(),
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
    const windowStart = from.getTime();
    const windowEnd = until.getTime();

    const overlapsWindow = (blockFrom: Date, blockUntil: Date) =>
      rangesOverlapWithTolerance(windowStart, windowEnd, blockFrom.getTime(), blockUntil.getTime());

    // Query 1: Fulfilled requests — block by accepted offer times on this spot (not full request window)
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
      if (data.isArchived === true) continue;
      const fulfilledSpots = (data.fulfilledSpotIds as string[] | undefined) ?? [];
      if (!fulfilledSpots.includes(spotId)) continue;

      const offersSnap = await getDocs(
        query(this.offersCollection(docSnap.id), where('spotId', '==', spotId)),
      );
      let matchedOffer = false;
      for (const offerDoc of offersSnap.docs) {
        const offerStatus = offerDoc.data()?.status ?? 'active';
        if (offerStatus !== 'accepted') continue;
        const offerFrom = offerDoc.data()?.from?.toDate?.() ?? null;
        const offerUntil = offerDoc.data()?.until?.toDate?.() ?? null;
        if (!offerFrom || !offerUntil) continue;
        matchedOffer = true;
        if (overlapsWindow(offerFrom, offerUntil)) {
          const overlapMs =
            Math.min(windowEnd, offerUntil.getTime()) - Math.max(windowStart, offerFrom.getTime());
          return {
            request: this.parkingRequestFromDocSnap(docSnap),
            overlapMinutes: Math.round(Math.max(0, overlapMs) / 60000),
          };
        }
      }

      const reqFrom = data.from?.toDate ? data.from.toDate() : null;
      const reqUntil = data.until?.toDate ? data.until.toDate() : null;
      if (!matchedOffer && reqFrom && reqUntil && overlapsWindow(reqFrom, reqUntil)) {
        const overlapMs =
          Math.min(windowEnd, reqUntil.getTime()) - Math.max(windowStart, reqFrom.getTime());
        return {
          request: this.parkingRequestFromDocSnap(docSnap),
          overlapMinutes: Math.round(Math.max(0, overlapMs) / 60000),
        };
      }
    }

    // Query 2: Open requests — active/accepted offers on this spot (offer times only)
    const openQuery = query(
      this.requestsCollection,
      where('facilityCode', '==', facilityCode),
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
    const openSnap = await getDocs(openQuery);

    for (const docSnap of openSnap.docs) {
      if (excludeRequestId && docSnap.id === excludeRequestId) continue;
      const data = docSnap.data();
      if (data.isArchived === true || data.isFulfilled === true) continue;

      const offersSnap = await getDocs(
        query(this.offersCollection(docSnap.id), where('spotId', '==', spotId)),
      );
      for (const offerDoc of offersSnap.docs) {
        const status = offerDoc.data()?.status ?? 'active';
        if (!isOfferBlockingOccupancy(status)) continue;
        const offerFrom = offerDoc.data()?.from?.toDate?.() ?? null;
        const offerUntil = offerDoc.data()?.until?.toDate?.() ?? null;
        if (!offerFrom || !offerUntil) continue;
        if (overlapsWindow(offerFrom, offerUntil)) {
          const overlapMs =
            Math.min(windowEnd, offerUntil.getTime()) - Math.max(windowStart, offerFrom.getTime());
          return {
            request: this.parkingRequestFromDocSnap(docSnap),
            overlapMinutes: Math.round(Math.max(0, overlapMs) / 60000),
          };
        }
      }
    }

    return null;
  }

  /**
   * Merged blocking intervals on a spot within [rangeFrom, rangeUntil].
   * Mirrors Cloud Functions collectBlockingIntervals (calendar + auto-matching).
   */
  async collectBlockingIntervals(
    spotId: string,
    facilityCode: string,
    rangeFrom: Date,
    rangeUntil: Date,
    excludeRequestId?: string,
  ): Promise<Array<{start: number; end: number}>> {
    const avFrom = rangeFrom.getTime();
    const avUntil = rangeUntil.getTime();
    const normalizedFacility = facilityCode.trim().toUpperCase();
    const raw: Array<{start: number; end: number}> = [];

    const addBlock = (startMs: number, endMs: number) => {
      const start = Math.max(startMs, avFrom);
      const end = Math.min(endMs, avUntil);
      if (end > start) raw.push({start, end});
    };

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
      if (data.isArchived === true) continue;
      const fulfilledSpots = (data.fulfilledSpotIds as string[] | undefined) ?? [];
      if (!fulfilledSpots.some((s) => spotIdsMatch(s, spotId))) continue;

      const offersSnap = await getDocs(query(this.offersCollection(docSnap.id)));
      let matchedOffer = false;
      for (const offerDoc of offersSnap.docs) {
        if (!spotIdsMatch(offerDoc.data()?.spotId as string | undefined, spotId)) continue;
        const offerStatus = offerDoc.data()?.status ?? 'active';
        if (offerStatus !== 'accepted') continue;
        const offerFrom = toDate(offerDoc.data()?.from as Parameters<typeof toDate>[0]);
        const offerUntil = toDate(offerDoc.data()?.until as Parameters<typeof toDate>[0]);
        if (!offerFrom || !offerUntil) continue;
        matchedOffer = true;
        addBlock(offerFrom.getTime(), offerUntil.getTime());
      }

      const reqFrom = toDate(data.from as Parameters<typeof toDate>[0]);
      const reqUntil = toDate(data.until as Parameters<typeof toDate>[0]);
      if (!matchedOffer && reqFrom && reqUntil) {
        addBlock(reqFrom.getTime(), reqUntil.getTime());
      }
    }

    const openQuery = query(
      this.requestsCollection,
      where('until', '>', this.cutoffTimestamp(FirestoreService.RELEVANT_HISTORY_MS)),
      orderBy('until'),
    );
    const openSnap = await getDocs(openQuery);

    for (const docSnap of openSnap.docs) {
      if (excludeRequestId && docSnap.id === excludeRequestId) continue;
      const data = docSnap.data();
      if (String(data.facilityCode || '').trim().toUpperCase() !== normalizedFacility) continue;
      if (data.isArchived === true || data.isFulfilled === true) continue;

      const offersSnap = await getDocs(query(this.offersCollection(docSnap.id)));
      for (const offerDoc of offersSnap.docs) {
        if (!spotIdsMatch(offerDoc.data()?.spotId as string | undefined, spotId)) continue;
        const status = offerDoc.data()?.status ?? 'active';
        if (!isOfferBlockingOccupancy(status)) continue;
        const offerFrom = toDate(offerDoc.data()?.from as Parameters<typeof toDate>[0]);
        const offerUntil = toDate(offerDoc.data()?.until as Parameters<typeof toDate>[0]);
        if (!offerFrom || !offerUntil) continue;
        addBlock(offerFrom.getTime(), offerUntil.getTime());
      }
    }

    return mergeIntervals(raw);
  }

  async acceptOffer(requestId: string, offer: RequestOffer): Promise<void> {
    // Prüfe, ob das Angebot noch existiert und ob der Request noch existiert
    const requestRef = doc(this.requestsCollection, requestId);
    const requestSnap = await getDoc(requestRef);
    
    if (!requestSnap.exists()) {
      throw new Error('Anfrage existiert nicht mehr');
    }
    
    const requestData = readDocData(requestSnap);
    if (!requestData) {
      throw new Error('Anfrage existiert nicht mehr');
    }
    
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
    
    const offerData = readDocData(offerSnap);
    if (offerData?.status !== 'active') {
      throw new Error('Das Angebot ist nicht mehr aktiv');
    }
    
    // Accepting an offer does NOT immediately fulfill the request anymore.
    // The server will recompute coverage across all accepted offers and mark the request fulfilled
    // once the full window is covered without gaps.
    await updateDoc(offerRef, {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    });
  }

  // Angebot stornieren (offered* Felder entfernen und Request wieder auf "offen" setzen)
  // WICHTIG: Diese Funktion wird vom Anbieter aufgerufen, der sein Angebot storniert
  // Gibt requestedBy zurück, damit der Aufrufer den Suchenden benachrichtigen kann.
  async cancelOffer(requestId: string, offeringUserId: string): Promise<{requestedBy: string} | null> {
    // Sicherheitsprüfung: Stelle sicher, dass der Benutzer tatsächlich ein aktives Angebot hat
    const q = query(this.offersCollection(requestId), where('offererId', '==', offeringUserId));
    const snap = await getDocs(q);
    const hasActiveOffer = snap.docs.some((d: QueryDocSnap) => {
      const status = d.data()?.status ?? 'active';
      return status === 'active' || status === 'accepted' || status === 'standby';
    });

    const requestRef = doc(this.requestsCollection, requestId);
    const requestSnap = await getDoc(requestRef);
    const requestData = readDocData(requestSnap);
    const hasFullOffer = requestData?.offeredBy === offeringUserId;
    const requestedBy = (requestData?.requestedBy as string) || null;

    if (!hasActiveOffer && !hasFullOffer) {
      throw new Error('Kein aktives Angebot zum Stornieren gefunden');
    }

    // Zuerst: Alle aktiven Angebote des Anbieters in der Subcollection auf 'withdrawn' setzen
    await this.withdrawMyOffersForRequest(requestId, offeringUserId);

    // Dann: Request-Dokument aktualisieren (offered* Felder entfernen)
    await updateDoc(doc(this.requestsCollection, requestId), {
      offeredSpotId: deleteField(),
      offeredBy: deleteField(),
      offeredAt: deleteField(),
      fullOfferId: deleteField(),
      isFulfilled: false,
      isArchived: false,
      fulfilledAt: deleteField(),
      fulfilledSpotIds: deleteField(),
      fulfilledByUserIds: deleteField(),
      fulfilledOfferIds: deleteField(),
      archivedBy: deleteField(),
      archivedAt: deleteField(),
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
      fulfilledAt: serverTimestamp(),
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
    
    const data = readDocData(requestSnap);
    const hasOffer = !!(data?.offeredSpotId || data?.offeredBy);
    const offeredBy = data?.offeredBy as string | undefined;
    
    // Wenn bereits ein Angebot vorhanden ist, archivieren statt löschen
    // damit der Anbieter informiert werden kann
    if (hasOffer) {
      await updateDoc(requestRef, {
        isArchived: true,
        archivedBy: data?.requestedBy,
        archivedAt: serverTimestamp(),
        // Entferne offered-Felder, damit der Request nicht mehr als "mit Angebot" erscheint
        offeredSpotId: deleteField(),
        offeredBy: deleteField(),
        offeredAt: deleteField(),
      });
      return {hadOffer: true, offeredBy};
    }
    
    // Wenn kein Angebot vorhanden ist, kann die Anfrage gelöscht werden
    await deleteDoc(requestRef);
    return {hadOffer: false};
  }

  // FCM Token speichern (pro Gerät/Installation; ein User kann mehrere Tokens haben)
  async syncAppVersion(
    userId: string,
    info: {version: string; buildNumber: number; platform: string},
  ): Promise<void> {
    await setDoc(
      doc(this.usersCollection, userId),
      {
        appVersion: info.version,
        appBuildNumber: info.buildNumber,
        appPlatform: info.platform,
        appVersionSyncedAt: serverTimestamp(),
      },
      {merge: true},
    );
  }

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
        lastSeenAt: serverTimestamp(),
        createdAt: serverTimestamp(),
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
        updatedAt: serverTimestamp(),
      },
      {merge: true},
    );
  }

  // User-Parkplatz abrufen
  async getUserParkingSpot(userId: string): Promise<string | null> {
    const docRef = doc(this.usersCollection, userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = readDocData(docSnap);
      return (data?.parkingSpotId as string | undefined) || null;
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
        .filter((d: QueryDocSnap) => d.id !== excludeUserId)
        .map((d: QueryDocSnap) => d.data())
        .filter((data: DocData) => data.fcmToken)
        .map((data: DocData) => data.fcmToken as string);
    } else {
      snapshot = await getDocs(this.usersCollection);
    }

    return snapshot.docs
      .map((docSnap: QueryDocSnap) => docSnap.data())
      .filter((data: DocData) => data.fcmToken)
      .map((data: DocData) => data.fcmToken as string);
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
        updatedAt: serverTimestamp(),
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

    const data = readDocData(docSnap);
    if (!data) {
      return null;
    }
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
      updatedAt: serverTimestamp(),
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
      updatedAt: serverTimestamp(),
    });
  }

  parkingRequestFromDocSnap(docSnap: {id: string; data: () => unknown}): ParkingRequest {
    const data = readDocData(docSnap);
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
    const data = readDocData(facilitySnap);
    // Code kommt von der Document-ID, nicht aus dem Dokument
    return {
      code: normalizedCode, // Document-ID
      name: data?.name as string | undefined,
      active: data?.active !== false, // Default: true, wenn nicht explizit false
    };
  }

  /**
   * Ruft die erfüllten-Anfragen-Statistiken für diese Parkanlage ab (per HTTP Function).
   * Gibt bei Fehler oder ohne Auth null zurück.
   */
  async getFacilityFulfilledStats(
    facilityCode: string,
  ): Promise<{total: number; future: number; byUser: number} | null> {
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
      const url = `https://${region}-${projectId}.cloudfunctions.net/getFacilityFulfilledStatsHttp`;
      const isDev = typeof __DEV__ !== 'undefined' && __DEV__;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: {facilityCode: normalizedCode, ...(isDev ? {debug: true} : {})},
        }),
      });
      const text = await res.text().catch(() => '');
      const json: {
        result?: {
          total?: number;
          future?: number;
          byUser?: number;
          debug?: Array<{
            id: string;
            from: string | null;
            until: string | null;
            requestedBy: string;
            offeredBy: string | null;
            fulfilledByUserIds: number;
            isArchived: boolean;
            isFuture: boolean;
            isByUser: boolean;
          }>;
        };
        error?: {message?: string};
      } = (() => {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })();
      if (!res.ok) return null;
      const result = json?.result;
      if (!result || typeof result.total !== 'number') return null;
      if (isDev && result.debug && result.debug.length > 0) {
        console.log('[FulfilledStats] Erfüllte Anfragen:', result.total, 'gesamt,', result.future, 'zukünftig,', result.byUser, 'von mir');
        console.table(
          result.debug.map((d) => ({
            Von: d.from?.slice(0, 16) ?? '-',
            Bis: d.until?.slice(0, 16) ?? '-',
            Requester: d.requestedBy,
            Anbieter: d.offeredBy ?? '-',
            Zukünftig: d.isFuture ? '✓' : '',
            VonMir: d.isByUser ? '✓' : '',
          })),
        );
      }
      return {
        total: result.total,
        future: typeof result.future === 'number' ? result.future : 0,
        byUser: typeof result.byUser === 'number' ? result.byUser : 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * Ruft die Anzahl der für diese Parkanlage registrierten Nutzer ab (per HTTP Function).
   * Gibt bei Fehler oder ohne Auth null zurück.
   */
  /**
   * Alle in der Anlage vergebenen Parkplatz-IDs (Vereinigung users.parkingSpots).
   * Gibt bei Fehler oder ohne Auth null zurück.
   */
  async getFacilityAssignedSpots(facilityCode: string): Promise<string[] | null> {
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
      const url = `https://${region}-${projectId}.cloudfunctions.net/getFacilityAssignedSpotsHttp`;
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
      const json: {result?: {spotIds?: string[]}; error?: {message?: string}} = (() => {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })();
      if (!res.ok) return null;
      const spotIds = json?.result?.spotIds;
      if (!Array.isArray(spotIds)) return null;
      return spotIds
        .map((s) => String(s).trim().toUpperCase())
        .filter((s) => s.length > 0);
    } catch {
      return null;
    }
  }

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
      createdAt: serverTimestamp(),
    });
  }
}

export default new FirestoreService();

