export interface ParkingRequest {
  id: string;
  requestedBy: string; // User ID
  requestedByUsername?: string; // Username für Anzeige
  requestedByPhone?: string; // Telefonnummer für Kontakt
  facilityCode: string; // Code der Parkanlage
  from: Date;
  until: Date;
  // Ob der Suchende Teilangebote (gestückelte Angebote) akzeptiert.
  // Wenn false, sollen nur vollständige Angebote erstellt werden.
  allowPartialOffers?: boolean;
  offeredSpotId?: string;
  offeredBy?: string; // User ID
  offeredByUsername?: string; // Username für Anzeige
  offeredByPhone?: string; // Telefonnummer für Kontakt
  // For full offers we store the originating offer id (set by Cloud Function).
  fullOfferId?: string;
  // When a request gets fully covered (possibly by multiple partial offers), the server stores these.
  fulfilledOfferIds?: string[];
  fulfilledSpotIds?: string[];
  fulfilledByUserIds?: string[];
  participantIds?: string[];
  initialCommentText?: string;
  lastCommentText?: string;
  lastCommentAt?: Date;
  commentCount?: number;
  isArchived?: boolean;
  archivedAt?: Date;
  archivedBy?: string;
  isFulfilled: boolean;
}

export const isOpen = (request: ParkingRequest): boolean => {
  return !request.isFulfilled && !request.offeredSpotId;
};

export const hasOffer = (request: ParkingRequest): boolean => {
  return !!request.offeredSpotId && !request.isFulfilled;
};

