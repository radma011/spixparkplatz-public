// Learn more https://docs.expo.dev/guides/customizing-metro
// EAS Build uses `expo export:embed` and requires expo/metro-config (not @react-native/metro-config alone).
const {getDefaultConfig} = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

module.exports = config;
