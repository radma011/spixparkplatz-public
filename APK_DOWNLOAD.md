# APK für direkten Download (z. B. von deinem Server)

So erstellst du eine signierte Release-APK, die Nutzer direkt von deiner Website herunterladen können (ohne Play Store).

## Voraussetzungen

- **Release-Keystore** muss eingerichtet sein (siehe `PLAY_STORE_PUBLICATION.md`, Abschnitt „Keystore erstellen“).
- In `android/gradle.properties` (wird nicht ins Git committed) müssen die Keystore-Daten stehen:
  - `MYAPP_RELEASE_STORE_FILE`
  - `MYAPP_RELEASE_KEY_ALIAS`
  - `MYAPP_RELEASE_STORE_PASSWORD`
  - `MYAPP_RELEASE_KEY_PASSWORD`
- Die Keystore-Datei (z. B. `my-release-key.keystore`) muss unter `android/app/` liegen.

## APK bauen

```bash
npm run android:apk
```

Oder manuell:

```bash
cd android
./gradlew assembleRelease
```

Die fertige APK liegt danach hier:

```
android/app/build/outputs/apk/release/app-release.apk
```

## APK auf deinen Server legen

1. **APK umbenennen** (optional, z. B. mit Versionsnummer):
   ```bash
   cp android/app/build/outputs/apk/release/app-release.apk SpixParkplatz-1.0.2.apk
   ```

2. **Auf den Server kopieren** (z. B. per SCP/SFTP in einen Ordner wie `/var/www/html/downloads/` oder deinen Webroot).

3. **Download-Link anbieten**, z. B.:
   ```html
   <a href="/apps/spixparkplatz/SpixParkplatz-1.0.2.apk" download>SpixParkplatz für Android herunterladen</a>
   ```

4. **MIME-Type** (optional): Wenn dein Server APK-Dateien ausliefert, sollte der Content-Type `application/vnd.android.package-archive` gesetzt sein. Bei den meisten Servern reicht die Endung `.apk`.

## Hinweise für Nutzer

- Beim ersten Installieren von außerhalb des Play Store muss auf dem Gerät **„Installation aus unbekannten Quellen“** (bzw. „Unbekannte Apps installieren“) für den verwendeten Browser erlaubt sein.
- Nach dem Download die APK öffnen und die Installation bestätigen.

## Version anpassen

Version und Version-Code stehen in `android/app/build.gradle`:

- `versionCode` (ganze Zahl, z. B. 3) – bei jedem Upload/Release erhöhen.
- `versionName` (z. B. `"1.0.2"`) – Anzeigename für Nutzer.

Nach Änderung erneut `npm run android:apk` ausführen.
