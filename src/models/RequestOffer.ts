export type OfferStatus = 'active' | 'withdrawn' | 'accepted' | 'standby';

export interface RequestOffer {
  id: string;
  requestId: string;
  offererId: string;
  offererUsername?: string;
  spotId: string;
  from: Date;
  until: Date;
  status: OfferStatus;
  createdAt?: Date;
}

export function isFullOffer(requestFrom: Date, requestUntil: Date, offerFrom: Date, offerUntil: Date) {
  return offerFrom.getTime() <= requestFrom.getTime() && offerUntil.getTime() >= requestUntil.getTime();
}


