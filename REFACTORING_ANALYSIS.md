# Code Refactoring Analyse & Vorschläge

## 🔍 Identifizierte Probleme

### 1. **Wiederholte Button-Styles**
- `actionBtn`, `actionRed`, `actionPrimary`, `actionBlue`, `actionDark`, `actionGray` in mehreren Dateien
- `actionTextWhite` wird überall wiederholt
- `submitButton`, `cancelButton` haben ähnliche Patterns

**Betroffene Dateien:**
- `RequestCard.tsx` (1098-1128)
- `AvailabilityCard.tsx` (358-375)
- `MyRequestCard.tsx` (414-433)
- `NewRequestModal.tsx` (621-647)
- `NewAvailabilityModal.tsx` (923-943)

### 2. **Wiederholte Modal-Styles**
- `modalOverlay`, `modalContent`, `modalHeader`, `modalTitle`, `modalCloseButton`
- `modalBody`, `modalBodyContent`, `modalFooter`
- Fast identische Implementierung in `NewRequestModal` und `NewAvailabilityModal`

**Betroffene Dateien:**
- `NewRequestModal.tsx` (476-510, 613-620)
- `NewAvailabilityModal.tsx` (727-780)
- `CommentsModal.tsx` (ähnliche Patterns)

### 3. **Wiederholte Input-Styles**
- `inputGroup`, `inputLabel`, `inputButton`, `inputButtonText`
- `dateTimeRow`, `inputButtonHalf`

**Betroffene Dateien:**
- `NewRequestModal.tsx`
- `NewAvailabilityModal.tsx`

### 4. **Code-Duplikation**
- DateTimePicker-Logik wird in mehreren Modals wiederholt
- Ähnliche Button-Komponenten werden inline definiert

## ✅ Vorschlag: Zentrale Komponenten & Styles

### Struktur:
```
src/
  components/
    common/
      Button.tsx          # Wiederverwendbare Button-Komponente
      Modal.tsx           # Basis-Modal-Komponente
      InputButton.tsx     # Input-Button für Date/Time Picker
      ActionButton.tsx    # Action-Button mit Icon + Text
  styles/
    buttons.ts           # Button-Styles
    modals.ts            # Modal-Styles
    inputs.ts            # Input-Styles
    common.ts            # Gemeinsame Styles
  theme/
    colors.ts            # (bereits vorhanden)
```

## 📋 Refactoring Plan

### Phase 1: Zentrale Styles
1. `src/styles/buttons.ts` - Alle Button-Styles
2. `src/styles/modals.ts` - Alle Modal-Styles
3. `src/styles/inputs.ts` - Alle Input-Styles
4. `src/styles/common.ts` - Gemeinsame Utilities

### Phase 2: Wiederverwendbare Komponenten
1. `Button.tsx` - Primär/Secondary/Danger Buttons
2. `ActionButton.tsx` - Button mit Icon (für RequestCard)
3. `Modal.tsx` - Basis-Modal mit Header/Footer
4. `InputButton.tsx` - Button für Date/Time Picker

### Phase 3: Refactoring bestehender Komponenten
1. RequestCard.tsx - Nutze ActionButton
2. NewRequestModal.tsx - Nutze Modal + Button
3. NewAvailabilityModal.tsx - Nutze Modal + Button
4. AvailabilityCard.tsx - Nutze ActionButton

## 🎯 Best Practices Check

### ✅ Gut:
- Services sind gut getrennt (AuthService, FirestoreService, etc.)
- Models sind sauber definiert
- Theme-System (colors.ts) existiert bereits
- Utils sind getrennt (dateUtils, etc.)

### ⚠️ Verbesserungspotenzial:
- **Komponenten-Duplikation**: Viele ähnliche Button/Modal-Implementierungen
- **Style-Duplikation**: Styles werden in jeder Komponente neu definiert
- **Fehlende Abstraktion**: DateTimePicker-Logik könnte in Hook extrahiert werden
- **Inkonsistente Naming**: `actionBtn` vs `button` vs `submitButton`

## 📝 Empfohlene nächste Schritte

1. **Sofort**: Zentrale Styles-Dateien erstellen
2. **Kurzfristig**: Button-Komponenten extrahieren
3. **Mittelfristig**: Modal-Basis-Komponente erstellen
4. **Langfristig**: Custom Hooks für wiederholte Logik (useDateTimePicker, etc.)
