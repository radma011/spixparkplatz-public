#!/usr/bin/env bash
# Run React Native on a physical iOS device with Metro reachable via LAN.
# Usage: ./scripts/run-ios-device.sh "Device Name"
# Requires: Mac and device on same Wi‑Fi, Metro running (npm start).

set -e
DEVICE_NAME="$1"

if [ -z "$DEVICE_NAME" ]; then
  echo "Usage: ./scripts/run-ios-device.sh \"Device Name\""
  echo "Example: ./scripts/run-ios-device.sh \"Minimanolito 7\""
  exit 1
fi

# Mac's LAN IP so the device can reach Metro (same Wi‑Fi required)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
if [ -z "$IP" ]; then
  echo "Warn: Could not detect Mac IP (en0/en1). Use Dev Menu on device to set Debug server host to your Mac IP:8081"
  IP="localhost"
fi

echo "Packager host: $IP (iPad/iPhone muss im gleichen WLAN sein)"
echo ""
echo "Falls Live Reload / r + j auf dem Gerät nicht gehen:"
echo "  1. Auf dem Gerät schütteln → Dev Menu öffnen"
echo "  2. \"Debug server host & port\" → eintragen: ${IP}:8081"
echo "  3. App neu laden"
echo ""
export REACT_NATIVE_PACKAGER_HOSTNAME="$IP"
exec npx react-native run-ios --device "$DEVICE_NAME"
