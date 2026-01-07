# Git History Cleanup - Firebase Keys entfernen

## Status

Die Firebase-Konfigurationsdateien wurden aus dem Git-Index entfernt, aber **die Keys sind noch in der Git-Historie vorhanden**.

## Problem

Wenn Dateien bereits committed wurden, bleiben sie in der Git-Historie, auch wenn sie später entfernt werden. Jeder mit Zugriff auf das Repository kann die alten Commits durchsuchen und die Keys finden.

## Lösungsoptionen

### Option 1: Keys in Firebase rotieren (EMPFOHLEN) ✅

**Das ist die sicherste und einfachste Lösung:**

1. In der Firebase Console neue API-Keys generieren
2. Die alten Keys deaktivieren/löschen
3. Die neuen Keys in die lokalen Konfigurationsdateien eintragen

**Vorteile:**
- Einfach und schnell
- Keine Historie-Umschreibung nötig
- Keine Probleme mit Collaborators
- Die alten Keys funktionieren nicht mehr, auch wenn sie in der Historie sind

### Option 2: Git-Historie umschreiben (Komplex)

Die Historie-Umschreibung ist technisch möglich, aber:

- **Sehr komplex** - erfordert spezielle Tools (`git filter-repo` oder `git filter-branch`)
- **Destruktiv** - überschreibt die gesamte Historie
- **Erfordert Force-Push** - alle Collaborators müssen ihre Repositories neu klonen
- **Kann Probleme verursachen** - Pull Requests, Issues, etc. können betroffen sein

**Wenn Sie die Historie trotzdem umschreiben möchten:**

```bash
# 1. Backup erstellen
git clone --mirror https://github.com/radma011/spixparkplatz.git backup.git

# 2. git-filter-repo installieren (empfohlen)
pip3 install git-filter-repo

# 3. Keys aus Historie entfernen
git filter-repo --path DATENSCHUTZ.html --invert-paths
git filter-repo --path android/app/google-services.json --invert-paths
git filter-repo --path ios/spixparkplatz/GoogleService-Info.plist --invert-paths

# 4. Force-Push (ACHTUNG: Destruktiv!)
git push origin --force --all
git push origin --force --tags

# 5. Alle Collaborators informieren, dass sie neu klonen müssen
```

## Aktuelle Situation

- ✅ Firebase-Konfigurationsdateien sind aus `.gitignore`
- ✅ Dateien wurden aus dem Git-Index entfernt (`git rm --cached`)
- ✅ Keys wurden aus `DATENSCHUTZ.html` in separate Datei ausgelagert
- ❌ Keys sind noch in der Git-Historie (alte Commits)

## Empfehlung

**Rotieren Sie die Keys in Firebase** (Option 1). Das ist die sicherste und praktischste Lösung.

Die alten Keys in der Historie sind dann zwar noch sichtbar, aber nicht mehr funktionsfähig.

