const fs = require('fs');
const path = require('path');

const versionPath = path.join(__dirname, 'download-page/version.json');
const {versionName, versionCode} = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: 'Spix Parken',
  slug: 'spixparkplatz',
  version: versionName,
  orientation: 'default',
  scheme: 'parkplatz',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'com.radisoglou.parkplatz',
    buildNumber: String(versionCode),
    supportsTablet: true,
  },
  android: {
    package: 'com.radisoglou.parkplatz',
    versionCode: Number(versionCode),
  },
  extra: {
    eas: {
      projectId: '57b10551-611f-4fbb-b025-b17f472f6d3f',
    },
  },
};
