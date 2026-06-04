export type SymbolKind = 'entrance' | 'exit' | 'door';
export type SpotRotation = 0 | 90;
export type SymbolRotation = 0 | 90 | 180 | 270;

export interface LayoutSymbol {
  id: string;
  type: SymbolKind;
  x: number;
  y: number;
  rotation?: SymbolRotation;
}

/** Dunkelgraue Straßen-Fläche (1×1), ohne Icon/Beschriftung — nur Editor/Anzeige. */
export interface LayoutStreet {
  id: string;
  type: 'street';
  x: number;
  y: number;
}

export interface LayoutSpot {
  id: string;
  type: 'spot';
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: SpotRotation;
  /** Vierstellige Parkplatz-ID — entspricht spotId in Anfragen/Angeboten */
  number?: string;
  floorFrom?: number;
  floorTo?: number;
  note?: string;
}

export type LayoutElement = LayoutSymbol | LayoutSpot | LayoutStreet;

export interface FacilityLayout {
  facilityCode: string;
  gridCols: number;
  gridRows: number;
  elements: LayoutElement[];
  updatedAt: string;
  updatedBy: string;
}

export type LayoutSyncStatus = 'synced' | 'pending' | 'local_only';

export type EditorTool = 'select' | SymbolKind | 'spot' | 'street';

export function isSpot(el: LayoutElement): el is LayoutSpot {
  return el.type === 'spot';
}

export function isSymbol(el: LayoutElement): el is LayoutSymbol {
  return el.type === 'entrance' || el.type === 'exit' || el.type === 'door';
}

export function isStreet(el: LayoutElement): el is LayoutStreet {
  return el.type === 'street';
}

export function isSymbolTool(tool: EditorTool): tool is SymbolKind {
  return tool === 'entrance' || tool === 'exit' || tool === 'door';
}

export function createEmptyLayout(facilityCode: string, userId: string): FacilityLayout {
  const code = facilityCode.trim().toUpperCase();
  return {
    facilityCode: code,
    gridCols: GRID_COLS,
    gridRows: GRID_ROWS,
    elements: [],
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
}

export const GRID_COLS = 240;
export const GRID_ROWS = 240;
export const CELL_PX = 42;
export const SYMBOL_CELLS = 1;
export const MAX_SPOT_NUMBER_LEN = 4;
export const DEFAULT_SPOT_W = 1;
export const DEFAULT_SPOT_H = 2;
