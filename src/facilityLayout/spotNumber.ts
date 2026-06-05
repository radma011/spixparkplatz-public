/** Max. Ziffern in der Parkplatznummer (Buchstabe optional dahinter). */
export const MAX_SPOT_NUMBER_DIGITS = 4;

/** z. B. „2140“ oder „2140L“ */
export const MAX_SPOT_NUMBER_LEN = MAX_SPOT_NUMBER_DIGITS + 1;

/** Eingabe: bis zu 4 Ziffern, optional ein Buchstabe am Ende (L/R …). */
export function normalizeSpotNumberInput(raw: string): string {
  const t = raw.trim().toUpperCase().replace(/[^0-9A-Z]/g, '');
  const m = t.match(/^(\d{0,4})([A-Z])?/);
  if (!m) return '';
  return (m[1] ?? '') + (m[2] ?? '');
}

export function sanitizeSpotNumber(value?: string): string | undefined {
  const n = normalizeSpotNumberInput(value ?? '');
  return n.length > 0 ? n : undefined;
}

export function splitSpotNumber(number?: string): {digits: string; letter: string} {
  const n = (number ?? '').trim().toUpperCase();
  if (!n) return {digits: '—', letter: ''};
  const m = n.match(/^(\d+)([A-Z])?$/);
  if (!m) return {digits: n, letter: ''};
  return {digits: m[1], letter: m[2] ?? ''};
}

export function hasSpotNumberSuffix(number?: string): boolean {
  return splitSpotNumber(number).letter.length > 0;
}

export function parseSpotNumberStart(start: string): {
  numeric: number;
  letter: string;
  digitPad: number;
} {
  const normalized = normalizeSpotNumberInput(start);
  const m = normalized.match(/^(\d+)([A-Z])?$/);
  if (!m || !m[1]) {
    return {numeric: 1, letter: '', digitPad: 4};
  }
  const numeric = parseInt(m[1], 10);
  return {
    numeric: Number.isNaN(numeric) ? 1 : numeric,
    letter: m[2] ?? '',
    digitPad: Math.max(4, m[1].length),
  };
}

export function formatSpotNumber(
  value: number,
  letter: string,
  digitPad: number,
): string {
  const digits = String(value).padStart(digitPad, '0').slice(-digitPad);
  return letter ? `${digits}${letter}` : digits;
}
