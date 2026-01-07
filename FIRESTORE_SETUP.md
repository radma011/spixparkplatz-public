# Firestore Datenbank Setup

## ✅ Automatisch (keine manuelle Konfiguration nötig)

Firestore erstellt **automatisch** alle Collections und Documents beim ersten Schreiben:

- ✅ `users` Collection - wird beim Registrieren automatisch erstellt
- ✅ `parking_requests` Collection - wird beim Erstellen einer Anfrage automatisch erstellt
- ✅ `parking_spots` Collection - wird beim Initialisieren automatisch erstellt

**Du musst nichts in der Firebase Console manuell erstellen!**

## 🔒 Security Rules (WICHTIG für Produktion)

Ich habe `firestore.rules` erstellt mit folgenden Regeln:

### Users Collection
- ✅ User können nur ihre eigenen Daten lesen/schreiben
- ✅ E-Mail kann nicht geändert werden
- ✅ User können ihr Profil aktualisieren

### Parking Requests Collection
- ✅ Alle authentifizierten User können Requests lesen
- ✅ User können nur ihre eigenen Requests erstellen
- ✅ Nur Requester oder Anbieter können Requests aktualisieren
- ✅ Nur Requester können ihre Requests löschen

### Parking Spots Collection
- ✅ Alle authentifizierten User können Spots lesen
- ✅ Schreiben ist deaktiviert (nur für Admins, falls nötig)

## 🚀 Security Rules deployen

Um die Security Rules in Firebase zu aktivieren:

```bash
# Firebase CLI installieren (falls noch nicht installiert)
npm install -g firebase-tools

# Bei Firebase anmelden
firebase login

# Rules deployen
firebase deploy --only firestore:rules
```

**WICHTIG:** Ohne deployte Rules ist die Datenbank standardmäßig **nicht geschützt** (nur im Testmodus). Für Produktion sollten die Rules unbedingt deployed werden!

## 📊 Firebase Console

Du kannst in der Firebase Console unter "Firestore Database" alle Daten sehen:
- https://console.firebase.google.com/project/parkplatz-38fe3/firestore

Die Daten werden automatisch dort erscheinen, sobald die App läuft und Daten schreibt.

