#!/bin/bash

# Script zum Resizen von Screenshots auf App Store Größen

set -e

# Farben für Output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

SCREENSHOT_DIR="./screenshots"
OUTPUT_DIR="./screenshots/app-store"

mkdir -p "$OUTPUT_DIR"

echo -e "${BLUE}📐 App Store Screenshot Resizer${NC}\n"

# App Store Anforderungen
IPHONE_65_WIDTH=1284
IPHONE_65_HEIGHT=2778
IPAD_129_WIDTH=2048
IPAD_129_HEIGHT=2732

# Funktion zum Resizen eines Screenshots
resize_screenshot() {
    local input_file=$1
    local output_name=$2
    local target_width=$3
    local target_height=$4
    local device_type=$5
    
    echo -e "${YELLOW}📱 Verarbeite: $(basename "$input_file")${NC}"
    
    # Aktuelle Dimensionen abrufen
    local current_width=$(sips -g pixelWidth "$input_file" 2>/dev/null | grep pixelWidth | awk '{print $2}')
    local current_height=$(sips -g pixelHeight "$input_file" 2>/dev/null | grep pixelHeight | awk '{print $2}')
    
    if [ -z "$current_width" ] || [ -z "$current_height" ]; then
        echo -e "  ${RED}❌ Fehler beim Lesen der Bildgröße${NC}\n"
        return 1
    fi
    
    echo "  Aktuelle Größe: ${current_width}x${current_height}"
    echo "  Zielgröße: ${target_width}x${target_height} (${device_type})"
    
    # Prüfe ob bereits die richtige Größe
    if [ "$current_width" -eq "$target_width" ] && [ "$current_height" -eq "$target_height" ]; then
        echo -e "  ${GREEN}✓ Bereits korrekte Größe${NC}"
        cp "$input_file" "$OUTPUT_DIR/$output_name"
        echo ""
        return 0
    fi
    
    # Verwende sips zum Resizen (behält Aspect Ratio bei und fügt Padding hinzu falls nötig)
    # sips -z resized die Höhe zuerst, dann die Breite
    echo "  → Resize mit sips..."
    
    # Erstelle temporäre Datei
    local temp_file="$OUTPUT_DIR/temp_$(basename "$input_file")"
    cp "$input_file" "$temp_file"
    
    # Resize auf Zielgröße (sips skaliert proportional und fügt schwarze Balken hinzu falls nötig)
    sips -z "$target_height" "$target_width" "$temp_file" --out "$OUTPUT_DIR/$output_name" > /dev/null 2>&1
    
    # Verifiziere die finale Größe
    local final_width=$(sips -g pixelWidth "$OUTPUT_DIR/$output_name" 2>/dev/null | grep pixelWidth | awk '{print $2}')
    local final_height=$(sips -g pixelHeight "$OUTPUT_DIR/$output_name" 2>/dev/null | grep pixelHeight | awk '{print $2}')
    
    # Lösche temporäre Datei
    rm -f "$temp_file"
    
    if [ "$final_width" -eq "$target_width" ] && [ "$final_height" -eq "$target_height" ]; then
        echo -e "  ${GREEN}✅ Erfolgreich resized: $output_name (${final_width}x${final_height})${NC}\n"
        return 0
    else
        echo -e "  ${RED}❌ Fehler: Finale Größe ist ${final_width}x${final_height} statt ${target_width}x${target_height}${NC}\n"
        return 1
    fi
}

# Zähle Screenshots
iphone_count=0
ipad_count=0
success_count=0
error_count=0

for file in "$SCREENSHOT_DIR"/*.png; do
    if [ ! -f "$file" ]; then
        continue
    fi
    
    filename=$(basename "$file")
    
    # Prüfe ob iPhone oder iPad basierend auf Dateinamen
    if [[ "$filename" == *"iPhone"* ]]; then
        iphone_count=$((iphone_count + 1))
        output_name="iphone-65-inch-${iphone_count}.png"
        
        if resize_screenshot "$file" "$output_name" "$IPHONE_65_WIDTH" "$IPHONE_65_HEIGHT" "iPhone 6.5\""; then
            success_count=$((success_count + 1))
        else
            error_count=$((error_count + 1))
        fi
    elif [[ "$filename" == *"iPad"* ]]; then
        ipad_count=$((ipad_count + 1))
        output_name="ipad-129-inch-${ipad_count}.png"
        
        if resize_screenshot "$file" "$output_name" "$IPAD_129_WIDTH" "$IPAD_129_HEIGHT" "iPad 12.9\""; then
            success_count=$((success_count + 1))
        else
            error_count=$((error_count + 1))
        fi
    else
        echo -e "${YELLOW}⚠️  Unbekannter Gerätetyp: $filename${NC}"
        echo "  → Überspringe..."
        echo ""
    fi
done

echo -e "${GREEN}✅ Fertig!${NC}"
echo -e "Resized Screenshots befinden sich in: ${BLUE}$OUTPUT_DIR${NC}"
echo -e "\n${YELLOW}📋 Zusammenfassung:${NC}"
echo "  iPhone 6.5\" Screenshots: $iphone_count"
echo "  iPad 12.9\" Screenshots: $ipad_count"
echo "  Erfolgreich: $success_count"
if [ $error_count -gt 0 ]; then
    echo -e "  ${RED}Fehler: $error_count${NC}"
fi
echo -e "\n${YELLOW}💡 Hinweis:${NC}"
echo "  sips resized Bilder proportional. Falls das Aspect Ratio nicht passt,"
echo "  können schwarze Balken hinzugefügt werden. Für perfekte Screenshots"
echo "  solltest du sie direkt auf den richtigen Simulatoren erstellen."
echo -e "\n${YELLOW}💡 Tipp:${NC} Überprüfe die Screenshots vor dem Upload zum App Store!"
