import {SYMBOL_LABELS} from './constants';
import {maxSpotLabelFontSize} from './spotLabel';
import type {LayoutSymbol} from './types';

export const MAX_SYMBOL_LABEL_LEN = 24;
const SYMBOL_LABEL_MAX_LINES = 3;

export function sanitizeSymbolLabel(raw?: string): string | undefined {
  const t = (raw ?? '').trim();
  if (!t) return undefined;
  return t.slice(0, MAX_SYMBOL_LABEL_LEN);
}

export function symbolUsesCustomLabel(el: LayoutSymbol): boolean {
  return (el.type === 'exit' || el.type === 'door') && !!sanitizeSymbolLabel(el.label);
}

export function symbolDisplayLabel(el: LayoutSymbol): string {
  return sanitizeSymbolLabel(el.label) ?? SYMBOL_LABELS[el.type];
}

/** Maximale Start-Schriftgröße für eigene Symbol-Labels (wie Parkplätze, bis zu 3 Zeilen). */
export function maxCustomSymbolLabelFontSize(
  boxW: number,
  boxH: number,
  label: string,
): number {
  const text = label.trim();
  const len = Math.max(1, text.length);
  if (len <= 8) {
    return maxSpotLabelFontSize(boxW, boxH, len);
  }
  const approxLines = Math.min(
    SYMBOL_LABEL_MAX_LINES,
    Math.max(1, Math.ceil(len / Math.max(1, Math.floor(boxW / 7)))),
  );
  const longestLineChars = Math.ceil(len / approxLines);
  return maxSpotLabelFontSize(boxW, boxH / approxLines, longestLineChars);
}

export function normalizeSymbolLabel(el: LayoutSymbol): LayoutSymbol {
  if (el.type !== 'exit' && el.type !== 'door') {
    if (!el.label) return el;
    const {label: _removed, ...rest} = el;
    return rest;
  }
  const label = sanitizeSymbolLabel(el.label);
  if (label) return {...el, label};
  const {label: _removed, ...rest} = el;
  return rest;
}
