#!/usr/bin/env node

/**
 * Liest versionName und versionCode aus android/app/build.gradle
 * und schreibt download-page/version.json für die Download-Seite.
 */

const fs = require('fs');
const path = require('path');

const buildGradlePath = path.resolve(__dirname, '../android/app/build.gradle');
const outputPath = path.resolve(__dirname, '../download-page/version.json');

const gradleContent = fs.readFileSync(buildGradlePath, 'utf8');

const versionNameMatch = gradleContent.match(/versionName\s+["']([^"']+)["']/);
const versionCodeMatch = gradleContent.match(/versionCode\s+(\d+)/);

const versionName = versionNameMatch ? versionNameMatch[1] : '0.0.0';
const versionCode = versionCodeMatch ? parseInt(versionCodeMatch[1], 10) : 0;

const data = {
  versionName,
  versionCode,
  updatedAt: new Date().toISOString(),
};

const outDir = path.dirname(outputPath);
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
console.log('Written version.json:', data);
