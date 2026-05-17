type RematchDetail = {
  requestId?: string;
  result?: string;
  spotId?: string;
  offerFrom?: string;
  offerUntil?: string;
  gapFrom?: string;
  gapUntil?: string;
  message?: string;
  diagnosis?: string[];
};

type RematchStats = {
  facilityCode?: string;
  dryRun?: boolean;
  openRequests?: number;
  offersCreated?: number;
  noMatch?: number;
  skippedHasOffer?: number;
  gapsRematched?: number;
  errors?: number;
  details?: RematchDetail[];
};

const fmtBerlin = (iso?: string) => {
  if (!iso) return '?';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
};

/** Readable rematch summary in the console (no object expand needed). */
export function logRematchResult(label: string, payload: unknown): void {
  const r = (payload as {result?: RematchStats})?.result ?? (payload as RematchStats);
  if (!r || typeof r !== 'object') {
    console.log(`[rematch] ${label}: keine Daten`);
    return;
  }

  const mode = r.dryRun ? 'VORSCHAU (Dry Run)' : 'LIVE';
  console.log(
    `[rematch] ${label} — ${mode} | ${r.facilityCode ?? '?'} | offene Anfragen: ${r.openRequests ?? 0} | ` +
      `neue Matches: ${r.offersCreated ?? 0} | keine Lücke getroffen: ${r.noMatch ?? 0} | ` +
      `übersprungen: ${r.skippedHasOffer ?? 0} | Lücken geprüft: ${r.gapsRematched ?? 0}`,
  );

  const details = r.details ?? [];
  const newMatches = details.filter(
    (d) => d.result === 'would_create_offer' || d.result === 'offer_created',
  );

  if (newMatches.length > 0) {
    console.log(`[rematch] ▶ ${newMatches.length} neues Matching würde erstellt / wurde erstellt:`);
    for (const d of newMatches) {
      const action = d.result === 'offer_created' ? 'erstellt' : 'würde erstellt';
      console.log(
        `[rematch]   ✓ ${d.requestId} → Spot ${d.spotId} ${action} | ` +
          `Angebot ${fmtBerlin(d.offerFrom)} – ${fmtBerlin(d.offerUntil)} | ` +
          `Lücke ${fmtBerlin(d.gapFrom)} – ${fmtBerlin(d.gapUntil)}`,
      );
    }
  } else {
    console.log('[rematch] ▶ Kein neues Matching (keine would_create_offer / offer_created).');
  }

  const rest = details.filter(
    (d) => d.result !== 'would_create_offer' && d.result !== 'offer_created',
  );
  if (rest.length > 0) {
    console.log('[rematch] Weitere Ergebnisse:');
    for (const d of rest) {
      const gap =
        d.gapFrom && d.gapUntil ? ` | Lücke ${fmtBerlin(d.gapFrom)} – ${fmtBerlin(d.gapUntil)}` : '';
      const extra = d.message ? ` (${d.message})` : '';
      console.log(`[rematch]   · ${d.requestId}: ${d.result}${gap}${extra}`);
      const diag = d.diagnosis;
      if (Array.isArray(diag)) {
        for (const line of diag) {
          console.log(`[rematch]       → ${line}`);
        }
      }
    }
  }
}
