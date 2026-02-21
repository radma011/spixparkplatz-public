# Download-Seite für SpixParkplatz

Diese Dateien auf den Server legen unter: **https://aviationapps.com/apps/spixparkplatz**

## Dateien

- `index.html` – Startseite mit Logo, Android-Download und iOS-Link
- `version.json` – wird per Script aus der Android-Build-Version befüllt
- `logo.png` – Logo (siehe unten)
- `SpixParkplatz.apk` – die gebaute Android-APK (wird beim `npm run android:apk` automatisch hierher kopiert)

## Logo

Logo als `logo.png` in diesen Ordner legen, z. B. Kopie von `src/AppIcon.png`:

```bash
cp ../src/AppIcon.png logo.png
```

## Version aktualisieren

Vor dem Hochladen die Version aus dem Android-Build übernehmen:

```bash
npm run download-page:version
```

Das liest `versionName` und `versionCode` aus `android/app/build.gradle` und schreibt `download-page/version.json`. Die HTML-Seite lädt diese Datei per JavaScript und zeigt die Version an.

## Upload

1. APK bauen: `npm run android:apk` (kopiert die APK automatisch als `SpixParkplatz.apk` nach `download-page/`)
2. Version schreiben: `npm run download-page:version`
3. In `download-page/`: `logo.png` anlegen (falls noch nicht vorhanden)
4. Gesamten Ordner `download-page/` auf den Server nach `/apps/spixparkplatz/` kopieren (z. B. per FTP/SCP), sodass `index.html` unter `https://aviationapps.com/apps/spixparkplatz/` erreichbar ist.
