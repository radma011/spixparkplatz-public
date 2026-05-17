/**
 * Run facility rematch locally via Admin SDK (same logic as runRematchFacilityHttp).
 *
 * Usage:
 *   node scripts/runRematchFacility.js SPIX!1739 --dry-run
 *   node scripts/runRematchFacility.js SPIX!1739
 *   node scripts/runRematchFacility.js SPIX!1739 --dry-run --json
 */

const admin = require('firebase-admin');
const {runRematchFacility} = require('../lib/rematchFacility');

const facilityCode = (process.argv[2] || 'SPIX!1739').trim().toUpperCase();
const dryRun = process.argv.includes('--dry-run');
const jsonOut = process.argv.includes('--json');
const skipIfHasActiveOffer = !process.argv.includes('--allow-duplicate-offers');

if (!admin.apps.length) {
  admin.initializeApp({projectId: process.env.GCLOUD_PROJECT || 'parkplatz-38fe3'});
}

async function main() {
  const db = admin.firestore();
  const result = await runRematchFacility({
    admin,
    db,
    facilityCode,
    dryRun,
    skipIfHasActiveOffer,
    sendPush: !dryRun,
    sendPushToUser: dryRun
      ? undefined
      : async (uid, title, body, data) => {
          console.log('[push]', uid.slice(0, 8), title);
        },
  });

  if (jsonOut) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('\n=== Rematch', facilityCode, dryRun ? '(DRY RUN)' : '(LIVE)', '===\n');
  console.log('openRequests:', result.openRequests);
  console.log('offersCreated:', result.offersCreated);
  console.log('skippedHasOffer:', result.skippedHasOffer);
  console.log('noMatch:', result.noMatch);
  console.log('matchAutoOfferDisabled:', result.matchAutoOfferDisabled);
  console.log('errors:', result.errors);
  console.log('\nDetails:');
  for (const d of result.details) {
    console.log(' ', JSON.stringify(d));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
