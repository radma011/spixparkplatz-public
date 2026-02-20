# 🔒 Sicherheitshinweis: API-Schlüssel kompromittiert

## Problem
Ein Firebase API-Schlüssel wurde öffentlich auf GitHub gefunden und von Google als Sicherheitsrisiko identifiziert.

**Betroffener Schlüssel:** `AIzaSyDQe9CN8Hmf22VJf7yn5EAq13D6GVSNcqE`  
**Projekt:** Spix Parkplatzapp (parkplatz-38fe3)  
**Datei:** `web/firebase-config.ts`

## Sofortige Maßnahmen

### 1. API-Schlüssel rotieren (WICHTIG!)
1. Gehe zu [Google Cloud Console](https://console.cloud.google.com/)
2. Wähle das Projekt "parkplatz-38fe3"
3. Gehe zu **APIs & Services** → **Credentials**
4. Finde den API-Schlüssel `AIzaSyDQe9CN8Hmf22VJf7yn5EAq13D6GVSNcqE`
5. Klicke auf **Schlüssel neu generieren** (Rotate Key)
6. Kopiere den neuen Schlüssel

### 2. API-Schlüssel einschränken
Nach der Rotation:
1. Bearbeite den neuen API-Schlüssel
2. Füge **API-Einschränkungen** hinzu:
   - Nur Firebase APIs erlauben
   - Nur bestimmte APIs (Firebase Authentication, Firestore, etc.)
3. Füge **Anwendungseinschränkungen** hinzu:
   - HTTP-Referrer für Web: `https://aviationsapps.com/*`
   - Oder IP-Adressen für Server

### 3. Datei aus Git-Historie entfernen
Die Datei wurde bereits zur `.gitignore` hinzugefügt, aber sie existiert noch in der Git-Historie:

```bash
# Entferne die Datei aus Git (aber behalte sie lokal)
git rm --cached web/firebase-config.ts

# Oder entferne sie komplett aus der Historie (Vorsicht: ändert Git-Historie!)
git filter-branch --force --index-filter \
  "git rm --cached --ignore-unmatch web/firebase-config.ts" \
  --prune-empty --tag-name-filter cat -- --all
```

### 4. Neue Konfiguration einrichten
1. Kopiere `web/firebase-config.example.ts` zu `web/firebase-config.ts`
2. Füge den neuen API-Schlüssel ein
3. Stelle sicher, dass `web/firebase-config.ts` in `.gitignore` ist ✅

### 5. Repository prüfen
Suche nach weiteren Vorkommen des alten Schlüssels:
```bash
git log --all --full-history --source -- web/firebase-config.ts
grep -r "AIzaSyDQe9CN8Hmf22VJf7yn5EAq13D6GVSNcqE" .
```

## Best Practices für die Zukunft

1. **Nie API-Schlüssel committen** - Verwende `.gitignore`
2. **Umgebungsvariablen verwenden** - Für Production
3. **API-Schlüssel einschränken** - In Google Cloud Console
4. **Regelmäßig prüfen** - Google Cloud Console → APIs & Services → Credentials

## Weitere Informationen
- [Google Cloud: Umgang mit gehackten Anmeldedaten](https://cloud.google.com/iam/docs/managing-compromised-credentials)
- [Firebase: API-Schlüssel sichern](https://firebase.google.com/docs/projects/api-keys)
