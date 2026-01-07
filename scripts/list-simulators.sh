#!/bin/bash

# Script zum Auflisten aller verfügbaren Simulatoren

echo "📱 Verfügbare iOS Simulatoren:"
echo ""
echo "iPhone-Geräte:"
xcrun simctl list devices available | grep -i "iPhone" | grep -v "unavailable"

echo ""
echo "iPad-Geräte:"
xcrun simctl list devices available | grep -i "iPad" | grep -v "unavailable"

echo ""
echo "💡 Tipp: Verwende 'xcrun simctl list devices' für mehr Details"
echo "💡 Für App Store Screenshots benötigst du:"
echo "   - iPhone 6.5\" (iPhone 11 Pro Max oder XS Max)"
echo "   - iPad 12.9\" (iPad Pro 12.9\")"

