import {hasSpotNumberSuffix, splitSpotNumber} from './spotNumber';

/** Ab diesem Zoom (1 = 100 %): Duplex-Etagen und L/R-Suffix in der Beschriftung. */
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

/** Kompakte Beschriftung: nur Ziffern (ohne L/R und ohne Duplex-Etagen). */
export function formatSpotLabelCompact(number?: string): string {
  return splitSpotNumber(number).digits;
}

/** Duplex-Etagen und Buchstabe (z. B. L/R) nur bei Zoom über 70 %. */
export function formatSpotLabelForZoom(
  number: string | undefined,
  floorFrom: number | undefined,
  floorTo: number | undefined,
  zoom: number,
): string {
  const hideExtra =
    zoom <= DUPLEX_FLOOR_MIN_ZOOM &&
    (isDuplexSpot(floorFrom, floorTo) || hasSpotNumberSuffix(number));
  if (hideExtra) {
    return formatSpotLabelCompact(number);
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

/** Geschätzte Zeichenbreite / fontSize (fette Ziffern). */
const CHAR_WIDTH_RATIO = 0.58;

/** Innenabstand der Beschriftung im Parkplatz (px). */
export const SPOT_LABEL_PAD_PX = 3;

/** Maximale Start-Schriftgröße für horizontale Beschriftung (adjustsFontSizeToFit verkleinert bei Bedarf). */
export function maxSpotLabelFontSize(boxW: number, boxH: number, labelLen: number): number {
  const len = Math.max(1, labelLen);
  const byHeight = boxH * 0.92;
  const byWidth = boxW / (len * CHAR_WIDTH_RATIO);
  return Math.max(5, Math.min(byHeight, byWidth));
}

/** Hoher Parkplatz (Schrift −90°): longSide = Zeilenbreite, narrowSide = maximaler fontSize. */
export function maxSpotLabelFontSizeVertical(
  longSidePx: number,
  narrowSidePx: number,
  labelLen: number,
): number {
  const len = Math.max(1, labelLen);
  const byNarrow = narrowSidePx * 0.9;
  const byLong = longSidePx / (len * CHAR_WIDTH_RATIO);
  return Math.max(5, Math.min(byNarrow, byLong));
}
