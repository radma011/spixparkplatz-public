import {
  CELL_PX,
  DEFAULT_SPOT_H,
  DEFAULT_SPOT_W,
  GRID_COLS,
  GRID_ROWS,
  LayoutElement,
  LayoutSpot,
  SpotRotation,
  SymbolRotation,
  SYMBOL_CELLS,
  isSpot,
} from './types';

const SYMBOL_ROTATION_CYCLE: SymbolRotation[] = [0, 90, 180, 270];

export function newId(): string {
  return `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function rectsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function spotSize(rotation: SpotRotation): {width: number; height: number} {
  return rotation === 90
    ? {width: DEFAULT_SPOT_H, height: DEFAULT_SPOT_W}
    : {width: DEFAULT_SPOT_W, height: DEFAULT_SPOT_H};
}

export function normalizeSpotRotation(r?: number): SpotRotation {
  return r === 90 ? 90 : 0;
}

export function nextSpotRotation(r?: number): SpotRotation {
  return normalizeSpotRotation(r) === 0 ? 90 : 0;
}

export function normalizeSymbolRotation(r?: number): SymbolRotation {
  if (r === 90 || r === 180 || r === 270) return r;
  return 0;
}

export function nextSymbolRotation(r?: number): SymbolRotation {
  const cur = normalizeSymbolRotation(r);
  const idx = SYMBOL_ROTATION_CYCLE.indexOf(cur);
  return SYMBOL_ROTATION_CYCLE[(idx + 1) % SYMBOL_ROTATION_CYCLE.length];
}

export function canPlace(
  elements: LayoutElement[],
  x: number,
  y: number,
  w: number,
  h: number,
  exclude?: Set<string>,
): boolean {
  if (x < 0 || y < 0 || x + w > GRID_COLS || y + h > GRID_ROWS) return false;
  for (const el of elements) {
    if (exclude?.has(el.id)) continue;
    const ew = isSpot(el) ? el.width : SYMBOL_CELLS;
    const eh = isSpot(el) ? el.height : SYMBOL_CELLS;
    if (rectsOverlap(x, y, w, h, el.x, el.y, ew, eh)) return false;
  }
  return true;
}

export function cellFromTouch(
  localX: number,
  localY: number,
  cellPx: number = CELL_PX,
): {x: number; y: number} {
  return {
    x: Math.floor(localX / cellPx),
    y: Math.floor(localY / cellPx),
  };
}

export function idsInRect(
  elements: LayoutElement[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  cellPx: number = CELL_PX,
): string[] {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return elements
    .filter((el) => {
      const w = (isSpot(el) ? el.width : SYMBOL_CELLS) * cellPx;
      const h = (isSpot(el) ? el.height : SYMBOL_CELLS) * cellPx;
      const ex = el.x * cellPx;
      const ey = el.y * cellPx;
      return ex < right && ex + w > left && ey < bottom && ey + h > top;
    })
    .map((el) => el.id);
}

export function moveBy(
  elements: LayoutElement[],
  ids: Set<string>,
  dx: number,
  dy: number,
): LayoutElement[] | null {
  if (dx === 0 && dy === 0) return elements;
  const moving = elements.filter((e) => ids.has(e.id));
  for (const el of moving) {
    const w = isSpot(el) ? el.width : SYMBOL_CELLS;
    const h = isSpot(el) ? el.height : SYMBOL_CELLS;
    if (!canPlace(elements, el.x + dx, el.y + dy, w, h, ids)) return null;
  }
  return elements.map((el) =>
    ids.has(el.id) ? {...el, x: el.x + dx, y: el.y + dy} : el,
  );
}

/** Parkplätze: Größe tauschen; Symbole: nur Icon-Richtung (Label bleibt aufrecht). */
export function rotateSelectedElements(
  elements: LayoutElement[],
  ids: Set<string>,
): LayoutElement[] | null {
  const updates = new Map<string, LayoutElement>();
  for (const el of elements) {
    if (!ids.has(el.id)) continue;
    if (isSpot(el)) {
      const rot = nextSpotRotation(el.rotation);
      const {width, height} = spotSize(rot);
      updates.set(el.id, {...el, rotation: rot, width, height});
    } else {
      const rot = nextSymbolRotation(el.rotation);
      updates.set(el.id, {...el, rotation: rot});
    }
  }
  for (const el of updates.values()) {
    if (!isSpot(el)) continue;
    if (!canPlace(elements, el.x, el.y, el.width, el.height, ids)) return null;
  }
  return elements.map((el) => updates.get(el.id) ?? el);
}

export function normalizeSpot(spot: LayoutSpot): LayoutSpot {
  const out = {...spot};
  if (!out.number) delete out.number;
  if (!out.note) delete out.note;
  if (out.floorFrom != null && out.floorTo != null && out.floorTo < out.floorFrom) {
    out.floorTo = out.floorFrom;
  }
  if (out.floorFrom == null) {
    delete out.floorFrom;
    delete out.floorTo;
  }
  return out;
}

export type NumberingOrder = 'row' | 'column';
export type NumberingScope = 'single' | 'selection' | 'neighbors';

function spotTouches(a: LayoutSpot, b: LayoutSpot): boolean {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const h = a.y < by2 && ay2 > b.y;
  const v = a.x < bx2 && ax2 > b.x;
  return (h && (ax2 === b.x || bx2 === a.x)) || (v && (ay2 === b.y || by2 === a.y));
}

function neighborGroup(spots: LayoutSpot[], seedId: string): LayoutSpot[] {
  const seed = spots.find((s) => s.id === seedId);
  if (!seed) return [];
  const visited = new Set<string>();
  const group: LayoutSpot[] = [];
  const q = [seed];
  visited.add(seed.id);
  while (q.length) {
    const cur = q.shift()!;
    group.push(cur);
    for (const o of spots) {
      if (visited.has(o.id)) continue;
      if (spotTouches(cur, o)) {
        visited.add(o.id);
        q.push(o);
      }
    }
  }
  return group;
}

export function spotsForNumbering(
  allSpots: LayoutSpot[],
  selectedIds: Set<string>,
  scope: NumberingScope,
  anchorId?: string,
): LayoutSpot[] {
  if (scope === 'single' && anchorId) {
    const one = allSpots.find((s) => s.id === anchorId);
    return one ? [one] : [];
  }
  if (scope === 'neighbors' && anchorId) {
    return neighborGroup(allSpots, anchorId);
  }
  const picked = allSpots.filter((s) => selectedIds.has(s.id));
  return picked.length > 0 ? picked : allSpots;
}

export function sortSpots(spots: LayoutSpot[], order: NumberingOrder): LayoutSpot[] {
  return [...spots].sort((a, b) =>
    order === 'column'
      ? a.x - b.x || a.y - b.y
      : a.y - b.y || a.x - b.x,
  );
}

export function applyNumbering(
  spots: LayoutSpot[],
  start: string,
  increment: number,
  order: NumberingOrder,
  duplex?: {floorFrom: number; floorTo: number},
): Record<string, {number: string; floorFrom?: number; floorTo?: number}> {
  const sorted = sortSpots(spots, order);
  const out: Record<string, {number: string; floorFrom?: number; floorTo?: number}> = {};
  const base = parseInt(start.replace(/\D/g, ''), 10);
  const numeric = Number.isNaN(base) ? 1 : base;
  const pad = Math.max(4, start.trim().length);

  sorted.forEach((s, i) => {
    const n = numeric + i * increment;
    const number = String(n).padStart(pad, '0').slice(-pad);
    if (duplex) {
      out[s.id] = {number, floorFrom: duplex.floorFrom, floorTo: duplex.floorTo};
    } else {
      out[s.id] = {number};
    }
  });
  return out;
}

export function canvasPx(): {width: number; height: number} {
  return {width: GRID_COLS * CELL_PX, height: GRID_ROWS * CELL_PX};
}

export const MIN_LAYOUT_ZOOM = 0.2;
export const MAX_LAYOUT_ZOOM = 3;
export const DEFAULT_VIEW_CELLS = 40;

export type PxBounds = {x: number; y: number; width: number; height: number};

export function elementsBoundsPx(
  elements: LayoutElement[],
  padCells = 2,
): PxBounds | null {
  if (elements.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;
  for (const el of elements) {
    const w = isSpot(el) ? el.width : SYMBOL_CELLS;
    const h = isSpot(el) ? el.height : SYMBOL_CELLS;
    minX = Math.min(minX, el.x);
    minY = Math.min(minY, el.y);
    maxX = Math.max(maxX, el.x + w);
    maxY = Math.max(maxY, el.y + h);
  }
  const pad = padCells;
  const x0 = Math.max(0, minX - pad);
  const y0 = Math.max(0, minY - pad);
  const x1 = Math.min(GRID_COLS, maxX + pad);
  const y1 = Math.min(GRID_ROWS, maxY + pad);
  return {
    x: x0 * CELL_PX,
    y: y0 * CELL_PX,
    width: Math.max(CELL_PX, (x1 - x0) * CELL_PX),
    height: Math.max(CELL_PX, (y1 - y0) * CELL_PX),
  };
}

export function defaultViewBoundsPx(cells = DEFAULT_VIEW_CELLS): PxBounds {
  const size = cells * CELL_PX;
  return {x: 0, y: 0, width: size, height: size};
}

export function viewBoundsPx(elements: LayoutElement[]): PxBounds {
  return elementsBoundsPx(elements) ?? defaultViewBoundsPx();
}

export function zoomToFitBounds(
  viewportW: number,
  viewportH: number,
  bounds: PxBounds,
  margin = 0.9,
): number {
  if (viewportW <= 0 || viewportH <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return 1;
  }
  const fit = Math.min(viewportW / bounds.width, viewportH / bounds.height) * margin;
  return Math.max(MIN_LAYOUT_ZOOM, Math.min(MAX_LAYOUT_ZOOM, fit));
}
