type DateLike = Date | { toDate: () => Date } | { getTime: () => number };

function toMs(v: DateLike): number {
  if (v instanceof Date) return v.getTime();
  if (typeof (v as { toDate: () => Date }).toDate === 'function')
    return (v as { toDate: () => Date }).toDate().getTime();
  return (v as { getTime: () => number }).getTime();
}

/**
 * Compute offer time window: intersection of request and availability window.
 */
export function calculateOfferTimeWindow(
  requestFrom: DateLike,
  requestUntil: DateLike,
  windowFrom: DateLike,
  windowUntil: DateLike,
): {from: Date; until: Date} {
  const reqFrom = toMs(requestFrom);
  const reqUntil = toMs(requestUntil);
  const winFrom = toMs(windowFrom);
  const winUntil = toMs(windowUntil);

  return {
    from: new Date(Math.max(reqFrom, winFrom)),
    until: new Date(Math.min(reqUntil, winUntil)),
  };
}
