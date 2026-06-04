import type {SymbolKind} from './types';

export const ELEMENT_COLORS: Record<SymbolKind | 'spot' | 'street', string> = {
  entrance: '#22C55E',
  exit: '#EF4444',
  door: '#8B5CF6',
  spot: '#0EA5E9',
  street: '#4B5563',
};

export const SYMBOL_ICONS: Record<SymbolKind, string> = {
  entrance: 'login',
  exit: 'logout',
  door: 'door',
};

export const SYMBOL_LABELS: Record<SymbolKind, string> = {
  entrance: 'Einfahrt',
  exit: 'Ausfahrt',
  door: 'Tür',
};

/**
 * Rendered cell size (px) = CELL_PX × zoom. Below this, symbol cells show icon only
 * (Einfahrt / Ausfahrt / Tür text hidden when zoomed out).
 */
export const SYMBOL_LABEL_MIN_CELL_PX = 32;

export function symbolShowsTextLabel(cellPx: number): boolean {
  return cellPx >= SYMBOL_LABEL_MIN_CELL_PX;
}
