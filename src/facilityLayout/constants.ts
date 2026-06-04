import type {SymbolKind} from './types';

export const ELEMENT_COLORS: Record<SymbolKind | 'spot', string> = {
  entrance: '#22C55E',
  exit: '#EF4444',
  door: '#8B5CF6',
  spot: '#0EA5E9',
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
