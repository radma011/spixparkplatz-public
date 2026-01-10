# Google Play Store Veröffentlichung - Anleitung

## 1. App-Signierung einrichten (WICHTIG!)

Die App muss mit einem Production-Keystore signiert werden. Aktuell wird noch der Debug-Keystore verwendet.

### Keystore erstellen:

```bash
cd android/app
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

**WICHTIG**: 
- Speichere das Passwort und den Alias-Namen sicher!
- Bewahre die `.keystore` Datei sicher auf (Backup erstellen!)
- Ohne diese Datei kannst du keine Updates veröffentlichen!

### Keystore-Konfiguration in `android/app/build.gradle`:

1. Erstelle eine Datei `android/gradle.properties` (falls nicht vorhanden) oder füge hinzu:

```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.keystore
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_STORE_PASSWORD=dein-store-passwort
MYAPP_RELEASE_KEY_PASSWORD=dein-key-passwort
```

2. Aktualisiere `android/app/build.gradle`:

```gradle
signingConfigs {
    debug {
        storeFile file('debug.keystore')
        storePassword 'android'
        keyAlias 'androiddebugkey'
        keyPassword 'android'
    }
    release {
        if (project.hasProperty('MYAPP_RELEASE_STORE_FILE')) {
            storeFile file(MYAPP_RELEASE_STORE_FILE)
            storePassword MYAPP_RELEASE_STORE_STORE_PASSWORD
            keyAlias MYAPP_RELEASE_KEY_ALIAS
            keyPassword MYAPP_RELEASE_KEY_PASSWORD
        }
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled enableProguardInReleaseBuilds
        proguardFiles getDefaultProguardFile("proguard-android.txt"), "proguard-rules.pro"
    }
}
```

## 2. Release-Build erstellen

```bash
cd android
./gradlew bundleRelease
```

Das erstellt eine `.aab` (Android App Bundle) Datei unter:
`android/app/build/outputs/bundle/release/app-release.aab`

**Alternative**: Für ein `.apk` (nicht empfohlen für Play Store):
```bash
./gradlew assembleRelease
```

## 3. Play Console Setup

1. Gehe zu https://play.google.com/console
2. Erstelle eine neue App
3. Fülle die App-Informationen aus:
   - App-Name
   - Standard-Sprache
   - App oder Spiel
   - Kostenlos oder kostenpflichtig
   - Datenschutzrichtlinie (erforderlich!)

## 4. App-Listing vorbereiten

### Benötigte Assets:

1. **App-Icon**: 512x512px (PNG, 32-bit)
2. **Feature-Grafik**: 1024x500px (optional, aber empfohlen)
3. **Screenshots**: 
   - Mindestens 2 Screenshots
   - Empfohlene Größen:
     - Phone: 1080 x 1920px oder höher
     - Tablet: 1200 x 1920px oder höher
4. **Kurzbeschreibung**: Max. 80 Zeichen
5. **Vollständige Beschreibung**: Max. 4000 Zeichen
6. **Datenschutzrichtlinie**: URL (erforderlich!)

### Content-Rating

- Fülle den Content-Rating-Fragebogen aus
- Erstelle ein Konto bei einem Rating-System (z.B. ESRB, PEGI)

## 5. App-Informationen

### Wichtige Felder:

- **App-Name**: Max. 50 Zeichen
- **Kurzbeschreibung**: Max. 80 Zeichen
- **Vollständige Beschreibung**: Max. 4000 Zeichen
- **App-Kategorie**: Wähle die passende Kategorie
- **Kontakt-E-Mail**: Für Support-Anfragen
- **Website**: Optional
- **Datenschutzrichtlinie**: **ERFORDERLICH!**

## 6. Pre-Launch Report

- Google führt automatisch Tests durch
- Prüfe die Ergebnisse und behebe kritische Fehler

## 7. Release erstellen

1. Gehe zu "Production" → "Create new release"
2. Lade die `.aab` Datei hoch
3. Füge Release Notes hinzu (für Nutzer sichtbar)
4. Speichere und überprüfe

## 8. App zur Prüfung einreichen

1. Prüfe alle Angaben
2. Klicke auf "Review release"
3. Google prüft die App (kann 1-7 Tage dauern)

## 9. Nach der Veröffentlichung

- Überwache Reviews und Ratings
- Reagiere auf Nutzer-Feedback
- Plane regelmäßige Updates

## Wichtige Hinweise

⚠️ **Keystore sicher aufbewahren!** Ohne den Keystore kannst du keine Updates veröffentlichen!

⚠️ **Datenschutzrichtlinie ist erforderlich!** Erstelle eine und hoste sie online.

⚠️ **Versionierung**: Bei jedem Update muss `versionCode` erhöht werden!

## Nützliche Links

- [Play Console](https://play.google.com/console)
- [Android App Bundle](https://developer.android.com/guide/app-bundle)
- [App-Signierung](https://reactnative.dev/docs/signed-apk-android)
- [Play Store Richtlinien](https://play.google.com/about/developer-content-policy/)
