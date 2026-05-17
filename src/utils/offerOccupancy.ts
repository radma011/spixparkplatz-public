import type {OfferStatus} from '../models/RequestOffer';

/** Offers that reserve or occupy a spot (calendar + matching). */
export function isOfferBlockingOccupancy(status: OfferStatus | string | undefined): boolean {
  return status === 'active' || status === 'accepted';
}

export function isOfferWithdrawnOrInactive(status: OfferStatus | string | undefined): boolean {
  return status === 'withdrawn' || status === 'standby';
}
