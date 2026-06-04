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
