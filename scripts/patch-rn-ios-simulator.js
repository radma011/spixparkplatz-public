#!/usr/bin/env node
/**
 * Xcode 27 ships Device Hub instead of Developer/Applications/Simulator.app.
 * Re-apply after npm install if `npm run ios` fails opening Simulator.app.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-community',
  'cli-platform-apple',
  'build',
  'commands',
  'runCommand',
  'runOnSimulator.js',
);

if (!fs.existsSync(target)) {
  console.warn('[patch-rn-ios-simulator] skip: runOnSimulator.js not found');
  process.exit(0);
}

let src = fs.readFileSync(target, 'utf8');
if (src.includes('function openSimulatorUi')) {
  process.exit(0);
}

const needle = 'function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }\nasync function runOnSimulator';
const insert = `function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function openSimulatorUi(activeDeveloperDir, udid) {
  const fs = require('fs');
  const path = require('path');
  const candidates = [
    path.join(activeDeveloperDir, 'Applications/Simulator.app'),
    path.join(activeDeveloperDir, '..', 'Applications', 'DeviceHub.app'),
  ];
  for (const appPath of candidates) {
    if (fs.existsSync(appPath)) {
      require('child_process').execFileSync('open', [appPath, '--args', '-CurrentDeviceUDID', udid]);
      return;
    }
  }
  require('@react-native-community/cli-tools').logger.warn(
    'Simulator.app / DeviceHub.app not found — using simctl only (Xcode 27 Device Hub).',
  );
}
async function runOnSimulator`;

if (!src.includes(needle)) {
  console.warn('[patch-rn-ios-simulator] skip: unexpected runOnSimulator.js format');
  process.exit(0);
}

src = src.replace(needle, insert);
src = src.replace(
  "_child_process().default.execFileSync('open', [`${activeDeveloperDir}/Applications/Simulator.app`, '--args', '-CurrentDeviceUDID', simulator.udid]);",
  'openSimulatorUi(activeDeveloperDir, simulator.udid);',
);

fs.writeFileSync(target, src);
console.log('[patch-rn-ios-simulator] patched for Xcode 27 Device Hub');
