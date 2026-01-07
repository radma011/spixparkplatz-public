#!/bin/bash

# Script zum Erstellen von App Store Screenshots
# Verwendet: xcrun simctl für Screenshots

set -e

# Farben für Output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Screenshot-Verzeichnis
SCREENSHOT_DIR="./screenshots"
mkdir -p "$SCREENSHOT_DIR"

echo -e "${BLUE}📸 App Store Screenshot Generator${NC}\n"

# Funktion zum Erstellen eines Screenshots
take_screenshot() {
    local device_name=$1
    local device_udid=$2
    local output_name=$3
    
    echo -e "${YELLOW}📱 Starte Simulator: $device_name${NC}"
    
    # Simulator booten
    xcrun simctl boot "$device_udid" 2>/dev/null || echo "Simulator bereits gestartet"
    
    # Warte bis Simulator bereit ist
    echo "Warte auf Simulator..."
    sleep 5
    
    # App starten (falls nicht bereits gestartet)
    echo "Starte App..."
    # Hier müsste die App bereits laufen - wir machen nur Screenshots
    
    # Screenshot erstellen
    echo -e "${GREEN}📸 Erstelle Screenshot: $output_name${NC}"
    xcrun simctl io "$device_udid" screenshot "$SCREENSHOT_DIR/$output_name"
    
    echo -e "${GREEN}✅ Screenshot gespeichert: $SCREENSHOT_DIR/$output_name${NC}\n"
}

# Verfügbare Geräte auflisten
echo -e "${BLUE}Verfügbare Geräte:${NC}"
xcrun simctl list devices available | grep -E "(iPhone|iPad)" | head -20

echo -e "\n${YELLOW}⚠️  WICHTIG:${NC}"
echo "1. Starte die App manuell auf jedem Simulator"
echo "2. Navigiere zu dem Screen, den du screenshoten möchtest"
3. Führe dann dieses Script aus\n"

# Geräte-UDIDs (müssen angepasst werden basierend auf deinen installierten Simulatoren)
# Diese können mit 'xcrun simctl list devices' gefunden werden

# iPhone 6.5" (iPhone 11 Pro Max / XS Max)
IPHONE_65_UDID=$(xcrun simctl list devices available | grep -i "iPhone.*Pro Max\|iPhone.*XS Max" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1)

# iPad 12.9" (iPad Pro)
IPAD_129_UDID=$(xcrun simctl list devices available | grep -i "iPad Pro.*12.9" | head -1 | grep -oE '[A-F0-9-]{36}' | head -1)

if [ -z "$IPHONE_65_UDID" ]; then
    echo -e "${YELLOW}⚠️  iPhone 6.5\" Simulator nicht gefunden${NC}"
    echo "Verfügbare iPhone-Geräte:"
    xcrun simctl list devices available | grep -i "iPhone"
    echo ""
    read -p "Gib die UDID des iPhone 6.5\" Simulators ein (oder Enter zum Überspringen): " IPHONE_65_UDID
fi

if [ -z "$IPAD_129_UDID" ]; then
    echo -e "${YELLOW}⚠️  iPad 12.9\" Simulator nicht gefunden${NC}"
    echo "Verfügbare iPad-Geräte:"
    xcrun simctl list devices available | grep -i "iPad"
    echo ""
    read -p "Gib die UDID des iPad 12.9\" Simulators ein (oder Enter zum Überspringen): " IPAD_129_UDID
fi

# Screenshots erstellen
if [ ! -z "$IPHONE_65_UDID" ]; then
    take_screenshot "iPhone 6.5\"" "$IPHONE_65_UDID" "iphone-65-inch.png"
else
    echo -e "${YELLOW}⚠️  iPhone 6.5\" Screenshot übersprungen${NC}\n"
fi

if [ ! -z "$IPAD_129_UDID" ]; then
    take_screenshot "iPad 12.9\"" "$IPAD_129_UDID" "ipad-129-inch.png"
else
    echo -e "${YELLOW}⚠️  iPad 12.9\" Screenshot übersprungen${NC}\n"
fi

echo -e "${GREEN}✅ Alle Screenshots wurden erstellt!${NC}"
echo -e "Screenshots befinden sich in: ${BLUE}$SCREENSHOT_DIR${NC}"
echo -e "\n${YELLOW}Nächste Schritte:${NC}"
echo "1. Überprüfe die Screenshots"
echo "2. Benenne sie entsprechend um (z.B. screenshot-1.png, screenshot-2.png)"
echo "3. Lade sie im App Store Connect hoch"

