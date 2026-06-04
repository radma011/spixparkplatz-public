/** Ab diesem Zoom (1 = 100 %) Duplex-Etagen in der Kartenbeschriftung anzeigen. */
export const DUPLEX_FLOOR_MIN_ZOOM = 0.7;

export function isDuplexSpot(floorFrom?: number, floorTo?: number): boolean {
  if (floorFrom == null || Number.isNaN(floorFrom)) return false;
  const to = floorTo ?? floorFrom;
  return to > floorFrom;
}

export function formatSpotLabel(
  number?: string,
  floorFrom?: number,
  floorTo?: number,
): string {
  const base = number?.trim() || '—';
  if (floorFrom == null || Number.isNaN(floorFrom)) {
    return base;
  }
  const to = floorTo ?? floorFrom;
  if (to === floorFrom) {
    return `${base} (${floorFrom})`;
  }
  return `${base} (${floorFrom}-${to})`;
}

/** Duplex: Etagen nur bei Zoom über 70 %, sonst nur die Nummer. */
export function formatSpotLabelForZoom(
  number: string | undefined,
  floorFrom: number | undefined,
  floorTo: number | undefined,
  zoom: number,
): string {
  if (isDuplexSpot(floorFrom, floorTo) && zoom <= DUPLEX_FLOOR_MIN_ZOOM) {
    return number?.trim() || '—';
  }
  return formatSpotLabel(number, floorFrom, floorTo);
}

export function parseFloorInput(raw: string): {floorFrom?: number; floorTo?: number} {
  const t = raw.trim();
  if (!t) return {};
  if (t.includes('-')) {
    const [a, b] = t.split('-');
    const from = parseInt(a?.trim() ?? '', 10);
    const to = parseInt(b?.trim() ?? '', 10);
    if (Number.isNaN(from)) return {};
    const floorFrom = Math.max(0, from);
    const floorTo = Number.isNaN(to) ? floorFrom : Math.max(floorFrom, Math.max(0, to));
    return {floorFrom, floorTo};
  }
  const n = parseInt(t, 10);
  if (Number.isNaN(n)) return {};
  const v = Math.max(0, n);
  return {floorFrom: v, floorTo: v};
}

export function formatFloorInput(floorFrom?: number, floorTo?: number): string {
  if (floorFrom == null || Number.isNaN(floorFrom)) return '';
  const to = floorTo ?? floorFrom;
  return to === floorFrom ? String(floorFrom) : `${floorFrom}-${to}`;
}

export function spotFontSize(cellW: number, cellH: number, labelLen: number): number {
  const minSide = Math.min(cellW, cellH);
  if (labelLen > 10) return Math.max(7, minSide * 0.22);
  if (labelLen > 7) return Math.max(8, minSide * 0.26);
  return Math.max(9, minSide * 0.32);
}

/** Hoher Parkplatz (Schrift −90°): Schrift darf schmale Seite nicht überschreiten. */
export function spotFontSizeVertical(
  longSidePx: number,
  narrowSidePx: number,
  labelLen: number,
): number {
  const base = spotFontSize(longSidePx, narrowSidePx, labelLen);
  const capByNarrow = narrowSidePx * 0.82;
  const capByLong = longSidePx / (Math.max(1, labelLen) * 0.58);
  return Math.max(6, Math.min(base, capByNarrow, capByLong));
}
