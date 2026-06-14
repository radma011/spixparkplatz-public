import FirestoreService from './FirestoreService';
import PushNotificationService from './PushNotificationService';
import {ParkingRequest} from '../models/ParkingRequest';
import {formatDateTime, formatDateRange} from '../utils/dateUtils';
import {RequestOffer} from '../models/RequestOffer';
import type {ParkingAvailability} from '../models/ParkingAvailability';
import {
  findBestMatchingAvailability,
  calculateOfferTimeWindow,
} from '../utils/availabilityMatching';

class ParkingRequestService {
  // Stream aller offenen Anfragen
  watchOpenRequests(facilityCode: string) {
    return FirestoreService.watchOpenRequests(facilityCode);
  }

  // Alle offenen Anfragen abrufen
  async getOpenRequests(facilityCode: string): Promise<ParkingRequest[]> {
    return await FirestoreService.getOpenRequests(facilityCode);
  }

  // User-Parkplatz abrufen
  async getUserParkingSpot(userId: string): Promise<string | null> {
    return await FirestoreService.getUserParkingSpot(userId);
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
    // Only log in development mode (works on native & web)
    const isDev =
      (typeof __DEV__ !== 'undefined' && __DEV__) ||
      (typeof globalThis !== 'undefined' &&
        (globalThis as any).process &&
        (globalThis as any).process.env &&
        (globalThis as any).process.env.NODE_ENV !== 'production');
    if (isDev) {
      console.log('[Auto-Matching] Creating request:', {
        facilityCode,
        from: from.toISOString(),
        until: until.toISOString(),
        hasComment: !!initialComment,
      });
    }

    const request = await FirestoreService.createRequest(
      userId,
      username,
      phone,
      facilityCode,
      from,
      until,
      allowPartialOffers,
      initialComment,
    );

    if (isDev) {
      console.log('[Auto-Matching] Request created:', {
        requestId: request.id,
        facilityCode,
        from: request.from.toISOString(),
        until: request.until.toISOString(),
      });

      // Note: Automatic matching is now handled server-side by the onRequestCreated Cloud Function
      // This ensures reliability, prevents race conditions, and works even when the client is offline
      console.log(
        '[Auto-Matching] Server-side matching will be triggered automatically by Cloud Function',
      );
      console.log(
        '[Auto-Matching] Waiting for server-side matching to complete (check offers collection for auto-created offers)',
      );
    }

    // Broadcast push: server-side in onRequestCreatedV2 after auto-match (only if no full auto-match).

    return request;
  }

  watchComments(requestId: string) {
    return FirestoreService.watchComments(requestId);
  }

  async addComment(requestId: string, authorId: string, text: string): Promise<void> {
    await FirestoreService.createComment(requestId, authorId, text);
  }

  async updateComment(requestId: string, commentId: string, newText: string): Promise<void> {
    await FirestoreService.updateComment(requestId, commentId, newText);
  }

  // Check if a spot is available for a given time range
  async checkSpotAvailability(
    spotId: string,
    facilityCode: string,
    from: Date,
    until: Date,
    excludeRequestId?: string,
  ): Promise<{request: ParkingRequest; overlapMinutes: number} | null> {
    return await FirestoreService.checkSpotAvailability(spotId, facilityCode, from, until, excludeRequestId);
  }

  // Parkplatz für Anfrage anbieten
  // skipRequesterNotification: true z. B. beim Re-Check nach Verfügbarkeitsänderung (Angebot wird nur aktualisiert).
  // requestOverride: wenn gesetzt (z. B. nach Storno im Recheck), wird nicht getOpenRequests genutzt – vermeidet Cache/Zeitproblem.
  async offerParkingSpot(
    requestId: string,
    offeringUserId: string,
    offeringUsername: string,
    offeringPhone: string,
    facilityCode: string,
    spotIdOverride?: string,
    fromOverride?: Date,
    untilOverride?: Date,
    skipRequesterNotification?: boolean,
    requestOverride?: ParkingRequest,
  ): Promise<boolean> {
    const spotId =
      spotIdOverride ?? (await FirestoreService.getUserParkingSpot(offeringUserId));
    if (!spotId) {
      return false;
    }

    let request: ParkingRequest | undefined;
    if (requestOverride && requestOverride.id === requestId) {
      request = requestOverride;
    } else {
      const requests = await FirestoreService.getOpenRequests(facilityCode);
      request = requests.find((r) => r.id === requestId);
    }
    // The request stays "open" as long as there is no FULL offer written onto the request doc.
    if (!request) {
      return false;
    }
    if (!requestOverride && request.offeredSpotId) {
      return false;
    }

    const offerFrom = fromOverride ?? request.from;
    const offerUntil = untilOverride ?? request.until;

    try {
      await FirestoreService.createOffer(requestId, offeringUserId, spotId, offerFrom, offerUntil);
    } catch (e) {
      console.error('Offer create failed:', e);
      return false;
    }

    if (!skipRequesterNotification) {
      try {
        const isPartial =
          offerFrom.getTime() !== request.from.getTime() || offerUntil.getTime() !== request.until.getTime();
        await PushNotificationService.sendPushToUser(
          request.requestedBy,
          isPartial ? 'Teilangebot verfügbar' : 'Parkplatz verfügbar!',
          isPartial
            ? `Parkplatz ${spotId} ist teilweise verfügbar (${formatDateTime(offerFrom)}–${formatDateTime(
                offerUntil,
              )}, von ${offeringUsername})`
            : `Parkplatz ${spotId} steht für dich zur Verfügung (von ${offeringUsername})`,
          {
            type: isPartial ? 'spot_partial' : 'spot_available',
            requestId,
            spotId,
            offeredBy: offeringUserId,
          },
        );
      } catch (e) {
        console.log('Push send (offer) failed:', e);
      }
    }

    return true;
  }

  async acceptOffer(requestId: string, offer: RequestOffer): Promise<void> {
    await FirestoreService.acceptOffer(requestId, offer);

    // Load request to get requester name
    let requesterName = 'einem Nutzer';
    try {
      const request = await FirestoreService.getParkingRequestById(requestId);
      if (request?.requestedByUsername) {
        requesterName = request.requestedByUsername;
      } else if (request?.requestedBy) {
        // Try to load username from users_public if not in request document
        const publicUser = await FirestoreService.getPublicUser(request.requestedBy);
        if (publicUser?.username) {
          requesterName = publicUser.username;
        }
      }
    } catch (e) {
      console.log('Failed to load requester name:', e);
    }

    // Notify offerer
    try {
      await PushNotificationService.sendPushToUser(
        offer.offererId,
        'Anfrage angenommen',
        `Dein Angebot für Parkplatz ${offer.spotId} wurde von ${requesterName} angenommen`,
        {
          type: 'offer_accepted',
          requestId,
          spotId: offer.spotId,
        },
      );
    } catch (e) {
      console.log('Push send (offer_accepted) failed:', e);
    }
  }

  watchOffersForRequest(requestId: string) {
    return FirestoreService.watchOffersForRequest(requestId);
  }

  async getOffersForRequest(requestId: string): Promise<RequestOffer[]> {
    return FirestoreService.getOffersForRequest(requestId);
  }

  async withdrawMyOffersForRequest(requestId: string, offeringUserId: string): Promise<void> {
    await FirestoreService.withdrawMyOffersForRequest(requestId, offeringUserId);
  }

  async withdrawOffer(requestId: string, offerId: string, offeringUserId: string): Promise<void> {
    await FirestoreService.withdrawOffer(requestId, offerId, offeringUserId);
  }

  async archiveFulfilledRequest(currentUserId: string, request: ParkingRequest): Promise<void> {
    await FirestoreService.archiveRequest(request.id, currentUserId);

    // Notify other involved parties
    const recipients = new Set<string>();
    recipients.add(request.requestedBy);
    if (request.offeredBy) recipients.add(request.offeredBy);
    (request.fulfilledByUserIds || []).forEach((uid) => recipients.add(uid));
    recipients.delete(currentUserId);

    const requesterDidArchive = currentUserId === request.requestedBy;
    const timeRange = formatDateRange(request.from, request.until);
    const requesterName = request.requestedByUsername || 'einem Nutzer';
    
    const title = requesterDidArchive
      ? 'Parkplatzangebot nicht mehr benötigt'
      : '⚠️ Angebot zurückgezogen';
    
    await Promise.all(
      Array.from(recipients).map(async (uid) => {
        const isRequester = uid === request.requestedBy;
        const body = requesterDidArchive
          ? `Dein Parkplatzangebot für ${timeRange} von ${requesterName} wird nicht länger benötigt. Danke!`
          : 'Das Angebot für den Parkplatz wurde zurückgezogen!';
        
        try {
          await PushNotificationService.sendPushToUser(uid, title, body, {
            type: 'request_archived',
            requestId: request.id,
          });
        } catch (e) {
          console.log('Push send (request_archived) failed:', e);
        }
      }),
    );
  }

  // Eigenes Angebot stornieren. Benachrichtigung an den Suchenden sendet nur die Cloud Function (onOfferUpdatedV2), damit nicht doppelt gepusht wird.
  async cancelOffer(requestId: string, offeringUserId: string): Promise<void> {
    await FirestoreService.cancelOffer(requestId, offeringUserId);
  }

  /**
   * Nach Bearbeitung oder Löschen einer Verfügbarkeit: Angebote für den betroffenen Spot
   * neu prüfen – bei Erweiterung Angebot aktualisieren, bei Verkürzung/Löschung stornieren und benachrichtigen.
   * Berücksichtigt Voll- und Teilangebote (bei Teilangeboten steht offeredBy nicht auf dem Request).
   */
  async recheckOffersAfterAvailabilityChange(
    currentUserId: string,
    facilityCode: string,
    spotId: string,
    allAvailabilitiesAfterChange: ParkingAvailability[],
    username: string,
    phone: string,
  ): Promise<void> {
    // Vollangebote: Request hat offeredBy/offeredSpotId
    const fullOfferRequests = await FirestoreService.getRequestsWithMyOfferForSpot(
      currentUserId,
      facilityCode,
      spotId,
    );
    // Teilangebote: Request hat kein offeredBy; Angebot liegt nur in der Subcollection
    const openRequests = await FirestoreService.getOpenRequests(facilityCode);
    const partialOfferRequests: ParkingRequest[] = [];
    for (const r of openRequests) {
      const myOffer = await FirestoreService.getMyActiveOfferForRequest(r.id, currentUserId);
      if (myOffer && myOffer.spotId === spotId) partialOfferRequests.push(r);
    }
    const seenIds = new Set<string>();
    const requestsWithMyOffer: ParkingRequest[] = [];
    for (const r of fullOfferRequests) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        requestsWithMyOffer.push(r);
      }
    }
    for (const r of partialOfferRequests) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        requestsWithMyOffer.push(r);
      }
    }

    for (const request of requestsWithMyOffer) {
      const myOffer = await FirestoreService.getMyActiveOfferForRequest(request.id, currentUserId);
      if (!myOffer) continue;

      const match = await findBestMatchingAvailability(
        request,
        allAvailabilitiesAfterChange,
        {excludeRequestId: request.id},
      );

      if (!match || match.spotId !== spotId) {
        await this.cancelOffer(request.id, currentUserId);
        continue;
      }

      const newWindow = calculateOfferTimeWindow(
        request.from,
        request.until,
        match.from,
        match.until,
      );
      const sameWindow =
        Math.abs(newWindow.from.getTime() - myOffer.from.getTime()) < 60 * 1000 &&
        Math.abs(newWindow.until.getTime() - myOffer.until.getTime()) < 60 * 1000;
      if (sameWindow) continue;

      await FirestoreService.updateOffer(request.id, myOffer.id, newWindow.from, newWindow.until);
      try {
        const isPartial =
          newWindow.from.getTime() !== request.from.getTime() || newWindow.until.getTime() !== request.until.getTime();
        await PushNotificationService.sendPushToUser(
          request.requestedBy,
          'Angebot wurde aktualisiert',
          isPartial
            ? `Dein Parkplatzangebot für Spot ${spotId} wurde angepasst: ${formatDateTime(newWindow.from)} – ${formatDateTime(newWindow.until)}`
            : `Dein Parkplatzangebot für Spot ${spotId} deckt jetzt den gesamten Zeitraum ab.`,
          {
            type: 'offer_updated',
            requestId: request.id,
            spotId,
            offeredBy: currentUserId,
          },
        );
      } catch (e) {
        console.log('Push send (offer_updated) failed:', e);
      }
    }
  }

  // Anfrage als erfüllt markieren
  async fulfillRequest(requestId: string): Promise<void> {
    await FirestoreService.fulfillRequest(requestId);
  }

  // Eigene Anfrage löschen
  // Wenn die Anfrage bereits ein Angebot hat, wird sie archiviert statt gelöscht
  async deleteRequest(requestId: string, requesterUsername?: string): Promise<void> {
    const result = await FirestoreService.deleteRequest(requestId);
    
    // Wenn die Anfrage ein Angebot hatte, benachrichtige den Anbieter
    if (result.hadOffer && result.offeredBy) {
      try {
        const body = requesterUsername
          ? `Die Parkplatz-Anfrage wurde von ${requesterUsername} zurückgezogen`
          : 'Die Parkplatz-Anfrage wurde vom Suchenden zurückgezogen';
        await PushNotificationService.sendPushToUser(
          result.offeredBy,
          'Anfrage zurückgezogen',
          body,
          {
            type: 'request_withdrawn',
            requestId,
          },
        );
      } catch (e) {
        console.log('Push send (request_withdrawn) failed:', e);
      }
    }
  }

  // FCM Token initialisieren
  async initializeFCMToken(userId: string): Promise<void> {
    await PushNotificationService.initializeToken(userId);
  }

}

export default new ParkingRequestService();

