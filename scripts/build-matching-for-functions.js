/**
 * Bundle src/shared/matching (TypeScript) to functions/lib/matchingCore.js (CJS).
 * Run before deploying Cloud Functions so they use the single source of truth.
 */
const esbuild = require('esbuild');
const path = require('path');

const entry = path.join(__dirname, '..', 'src', 'shared', 'matching', 'index.ts');
const outfile = path.join(__dirname, '..', 'functions', 'lib', 'matchingCore.js');

esbuild
  .build({
    entryPoints: [entry],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    logLevel: 'info',
  })
  .then(() => console.log('Built', outfile))
  .catch(() => process.exit(1));
