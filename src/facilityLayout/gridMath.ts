import {
  CELL_PX,
  DEFAULT_SPOT_H,
  DEFAULT_SPOT_W,
  GRID_COLS,
  GRID_ROWS,
  LayoutElement,
  LayoutSpot,
  LayoutStreet,
  SpotRotation,
  SymbolRotation,
  SYMBOL_CELLS,
  isSpot,
  isStreet,
  isSymbol,
} from './types';
import {formatSpotNumber, parseSpotNumberStart} from './spotNumber';

export type GridPoint = {x: number; y: number};

export function elementFootprint(el: LayoutElement): {width: number; height: number} {
  if (isSpot(el)) return {width: el.width, height: el.height};
  return {width: SYMBOL_CELLS, height: SYMBOL_CELLS};
}

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

/** Breiter Parkplatz: doppelte Breite → 2×2 Zellen (quadratisch). */
export const SQUARE_SPOT_CELLS = 2;

export function isSquareSpot(spot: LayoutSpot): boolean {
  return spot.width === SQUARE_SPOT_CELLS && spot.height === SQUARE_SPOT_CELLS;
}

export function squareSpotSize(): {width: number; height: number} {
  return {width: SQUARE_SPOT_CELLS, height: SQUARE_SPOT_CELLS};
}

export function spotSizeForSpot(spot: LayoutSpot): {width: number; height: number} {
  return isSquareSpot(spot) ? squareSpotSize() : spotSize(normalizeSpotRotation(spot.rotation));
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
    const {width: ew, height: eh} = elementFootprint(el);
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
      const {width: fw, height: fh} = elementFootprint(el);
      const w = fw * cellPx;
      const h = fh * cellPx;
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
    const {width: w, height: h} = elementFootprint(el);
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
      const {width, height} = isSquareSpot(el) ? squareSpotSize() : spotSize(rot);
      updates.set(el.id, {...el, rotation: rot, width, height});
    } else if (isSymbol(el)) {
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
export type NumberingDirection = 'asc' | 'desc';

/** Kurztext für die UI — feste Sortierreihenfolge auf dem Raster. */
export function numberingOrderHint(order: NumberingOrder): string {
  return order === 'row'
    ? 'Reihenfolge: oben → unten, pro Zeile links → rechts'
    : 'Reihenfolge: links → rechts, pro Spalte oben → unten';
}
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
  direction: NumberingDirection = 'asc',
  duplex?: {floorFrom: number; floorTo: number},
): Record<string, {number: string; floorFrom?: number; floorTo?: number}> {
  const sorted = sortSpots(spots, order);
  const out: Record<string, {number: string; floorFrom?: number; floorTo?: number}> = {};
  const {numeric, letter, digitPad} = parseSpotNumberStart(start);
  const step = (direction === 'asc' ? 1 : -1) * (increment || 0);

  sorted.forEach((s, i) => {
    const n = numeric + i * step;
    const number = formatSpotNumber(n, letter, digitPad);
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
    const {width: w, height: h} = elementFootprint(el);
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

export function viewBoundsPx(elements: LayoutElement[], padCells = 2): PxBounds {
  return elementsBoundsPx(elements, padCells) ?? defaultViewBoundsPx();
}

/** Minimal inset between content bounds and viewport edge when fitting. */
export const LAYOUT_FIT_EDGE_PX = 6;

export type ZoomFitOptions = {
  /** 1 = maximal fill; values below 1 shrink (legacy default was 0.9). */
  margin?: number;
  edgePaddingPx?: number;
};

export function zoomToFitBounds(
  viewportW: number,
  viewportH: number,
  bounds: PxBounds,
  options: ZoomFitOptions = {},
): number {
  if (viewportW <= 0 || viewportH <= 0 || bounds.width <= 0 || bounds.height <= 0) {
    return 1;
  }
  const margin = options.margin ?? 1;
  const edge = options.edgePaddingPx ?? LAYOUT_FIT_EDGE_PX;
  const availW = Math.max(1, viewportW - edge * 2);
  const availH = Math.max(1, viewportH - edge * 2);
  const fit = Math.min(availW / bounds.width, availH / bounds.height) * margin;
  return Math.max(MIN_LAYOUT_ZOOM, Math.min(MAX_LAYOUT_ZOOM, fit));
}

/** Pan offset so the center of all layout objects sits in the viewport center. */
export function panToCenterContent(
  viewportW: number,
  viewportH: number,
  bounds: PxBounds,
  zoom: number,
): {x: number; y: number} {
  const contentL = bounds.x * zoom;
  const contentT = bounds.y * zoom;
  const contentW = bounds.width * zoom;
  const contentH = bounds.height * zoom;
  return {
    x: viewportW / 2 - (contentL + contentW / 2),
    y: viewportH / 2 - (contentT + contentH / 2),
  };
}

/** Keep pan within range so the viewport never shows only empty canvas. */
export function clampPanToContent(
  panX: number,
  panY: number,
  viewportW: number,
  viewportH: number,
  bounds: PxBounds,
  zoom: number,
): {x: number; y: number} {
  const contentL = bounds.x * zoom;
  const contentT = bounds.y * zoom;
  const contentW = bounds.width * zoom;
  const contentH = bounds.height * zoom;
  const contentR = contentL + contentW;
  const contentB = contentT + contentH;

  let x = panX;
  let y = panY;

  if (contentW <= viewportW) {
    x = (viewportW - contentW) / 2 - contentL;
  } else {
    x = Math.max(viewportW - contentR, Math.min(contentL, x));
  }

  if (contentH <= viewportH) {
    y = (viewportH - contentH) / 2 - contentT;
  } else {
    y = Math.max(viewportH - contentB, Math.min(contentT, y));
  }

  return {x, y};
}

/** Scroll offsets for editor mode — center on object bounds, not empty grid. */
export function scrollToCenterContent(
  viewportW: number,
  viewportH: number,
  bounds: PxBounds,
  zoom: number,
  canvasW: number,
  canvasH: number,
): {scrollX: number; scrollY: number} {
  const contentL = bounds.x * zoom;
  const contentT = bounds.y * zoom;
  const contentW = bounds.width * zoom;
  const contentH = bounds.height * zoom;
  let scrollX = contentL + (contentW - viewportW) / 2;
  let scrollY = contentT + (contentH - viewportH) / 2;
  scrollX = Math.max(0, Math.min(Math.max(0, canvasW - viewportW), scrollX));
  scrollY = Math.max(0, Math.min(Math.max(0, canvasH - viewportH), scrollY));
  return {scrollX, scrollY};
}

function streetKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function hasStreetAt(elements: LayoutElement[], x: number, y: number): boolean {
  return elements.some((el) => isStreet(el) && el.x === x && el.y === y);
}

export function isGridAdjacent4(a: GridPoint, b: GridPoint): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** Orthogonal path from `from` toward `to` (horizontal first, then vertical), including `to`. */
export function manhattanPathCells(from: GridPoint, to: GridPoint): GridPoint[] {
  const cells: GridPoint[] = [];
  let x = from.x;
  let y = from.y;
  while (x !== to.x) {
    x += Math.sign(to.x - x);
    cells.push({x, y});
  }
  while (y !== to.y) {
    y += Math.sign(to.y - y);
    cells.push({x, y});
  }
  return cells;
}

export function streetsConnected(
  a: GridPoint,
  b: GridPoint,
  elements: LayoutElement[],
): boolean {
  if (a.x === b.x && a.y === b.y) return true;
  const start = streetKey(a.x, a.y);
  const goal = streetKey(b.x, b.y);
  const grid = new Set<string>();
  for (const el of elements) {
    if (isStreet(el)) grid.add(streetKey(el.x, el.y));
  }
  if (!grid.has(start) || !grid.has(goal)) return false;
  const q = [start];
  const seen = new Set([start]);
  while (q.length > 0) {
    const k = q.shift()!;
    if (k === goal) return true;
    const [sx, sy] = k.split(',').map(Number);
    for (const [nx, ny] of [
      [sx + 1, sy],
      [sx - 1, sy],
      [sx, sy + 1],
      [sx, sy - 1],
    ]) {
      const nk = streetKey(nx, ny);
      if (grid.has(nk) && !seen.has(nk)) {
        seen.add(nk);
        q.push(nk);
      }
    }
  }
  return false;
}

export function shouldFillStreetBetween(
  from: GridPoint | null,
  to: GridPoint,
  elements: LayoutElement[],
): from is GridPoint {
  if (!from) return false;
  if (from.x === to.x && from.y === to.y) return false;
  if (isGridAdjacent4(from, to)) return false;
  return !streetsConnected(from, to, elements);
}

export function appendStreetsAlongPath(
  elements: LayoutElement[],
  from: GridPoint,
  to: GridPoint,
): {elements: LayoutElement[]; added: number; blocked: number} {
  const path = manhattanPathCells(from, to);
  let els = elements;
  let added = 0;
  let blocked = 0;
  const streetAt = new Set(
    elements.filter(isStreet).map((el) => streetKey(el.x, el.y)),
  );
  for (const {x, y} of path) {
    const k = streetKey(x, y);
    if (streetAt.has(k)) continue;
    if (!canPlace(els, x, y, SYMBOL_CELLS, SYMBOL_CELLS)) {
      blocked += 1;
      continue;
    }
    const el: LayoutStreet = {id: newId(), type: 'street', x, y};
    els = [...els, el];
    streetAt.add(k);
    added += 1;
  }
  return {elements: els, added, blocked};
}
