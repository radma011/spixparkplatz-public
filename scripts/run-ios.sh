#!/usr/bin/env bash
# iOS run helper for Xcode 27+ (Device Hub instead of legacy Simulator.app).
# Usage:
#   ./scripts/run-ios.sh
#   ./scripts/run-ios.sh "iPhone 17 Pro"
#   IOS_SIMULATOR="iPad mini (A17 Pro)" ./scripts/run-ios.sh

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# React Native pipes xcodebuild through xcbeautify when installed (best terminal progress).
if ! command -v xcbeautify >/dev/null 2>&1; then
  echo "Tipp: brew install xcbeautify — dann siehst du beim Build echten Fortschritt (Compile/Link)."
  echo "      Oder: npm run ios:verbose für die vollständige xcodebuild-Ausgabe."
  echo ""
fi

DEV_DIR="${DEVELOPER_DIR:-$(xcode-select -p)}"
DEVICE_HUB="$DEV_DIR/../Applications/DeviceHub.app"
if [ -d "$DEVICE_HUB" ]; then
  open -a "$DEVICE_HUB" 2>/dev/null || true
fi

# Always prefer Debug for day-to-day runs (Release is much slower; use --mode Release explicitly if needed).
MODE_ARGS=(--mode Debug)
for a in "$@"; do
  if [ "$a" = "--mode" ]; then
    MODE_ARGS=()
    break
  fi
done

if [ "$#" -eq 0 ]; then
  exec npx react-native run-ios "${MODE_ARGS[@]}" --simulator "${IOS_SIMULATOR:-iPhone 17 Pro}"
else
  exec npx react-native run-ios "${MODE_ARGS[@]}" "$@"
fi
