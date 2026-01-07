# App Store Screenshots erstellen

## Automatische Methode (Empfohlen)

### 1. Verfügbare Simulatoren auflisten

```bash
npm run ios:simulators
```

Oder direkt:
```bash
./scripts/list-simulators.sh
```

### 2. App auf den richtigen Simulatoren starten

Du benötigst:
- **iPhone 6.5"** (iPhone 11 Pro Max oder iPhone XS Max)
- **iPad 12.9"** (iPad Pro 12.9")

Starte die App auf jedem Simulator:
```bash
# iPhone 6.5"
npm run ios -- --simulator="iPhone 15 Pro Max"

# iPad 12.9"
npm run ios -- --simulator="iPad Pro (12.9-inch) (6th generation)"
```

### 3. Screenshots erstellen

Navigiere in der App zu den Screens, die du screenshoten möchtest, dann:

```bash
npm run ios:screenshots
```

Oder direkt:
```bash
./scripts/take-screenshots.sh
```

Die Screenshots werden im Ordner `./screenshots/` gespeichert.

## Manuelle Methode

### iPhone 6.5" Screenshot

1. Öffne Xcode
2. Window → Devices and Simulators
3. Starte einen iPhone 11 Pro Max oder iPhone XS Max Simulator
4. Starte die App auf dem Simulator
5. Navigiere zu dem Screen, den du screenshoten möchtest
6. Device → Screenshot (oder Cmd+S)
7. Der Screenshot wird auf dem Desktop gespeichert

### iPad 12.9" Screenshot

1. Starte einen iPad Pro 12.9" Simulator
2. Starte die App auf dem Simulator
3. Navigiere zu dem Screen, den du screenshoten möchtest
4. Device → Screenshot (oder Cmd+S)
5. Der Screenshot wird auf dem Desktop gespeichert

## Screenshot-Anforderungen für App Store

- **iPhone 6.5"**: 1284 x 2778 Pixel (Portrait) oder 2778 x 1284 Pixel (Landscape)
- **iPad 12.9"**: 2048 x 2732 Pixel (Portrait) oder 2732 x 2048 Pixel (Landscape)

## Screenshots konvertieren

Falls du bereits Screenshots hast, die du konvertieren möchtest:

### Mit ImageMagick (falls installiert)

```bash
# iPhone Screenshot konvertieren
convert existing-screenshot.png -resize 1284x2778! iphone-65-inch.png

# iPad Screenshot konvertieren
convert existing-screenshot.png -resize 2048x2732! ipad-129-inch.png
```

### Mit sips (macOS Standard-Tool)

```bash
# iPhone Screenshot konvertieren
sips -z 2778 1284 existing-screenshot.png --out iphone-65-inch.png

# iPad Screenshot konvertieren
sips -z 2732 2048 existing-screenshot.png --out ipad-129-inch.png
```

**⚠️ WICHTIG**: Konvertierte Screenshots können verzerrt aussehen. Es ist besser, Screenshots direkt auf den richtigen Simulatoren zu erstellen.

## Tipps

1. **Mehrere Screenshots**: Erstelle Screenshots von verschiedenen wichtigen Screens (Login, Hauptansicht, Profil, etc.)
2. **Konsistenz**: Verwende die gleichen Screens für iPhone und iPad
3. **Qualität**: Stelle sicher, dass die Screenshots scharf und gut lesbar sind
4. **Status Bar**: Die Status Bar wird automatisch korrekt angezeigt

