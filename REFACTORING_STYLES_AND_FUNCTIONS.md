# Refactoring: Zentrale Styles & Funktionen

## ✅ Erstellt

### 1. Zentrale Styles
- `src/styles/cards.ts` - Card-Styles (card, cardHeader, cardTitle, etc.)
- `src/styles/chips.ts` - Chip/Badge-Styles (chip, dayBadge, statusChips, etc.)

### 2. Wiederverwendbare Komponenten
- `src/components/common/StatusChip.tsx` - Status-Chip Komponente
- `src/components/common/DayBadge.tsx` - Day-Badge Komponente

### 3. Gemeinsame Funktionen
- `src/utils/contactUtils.ts` - `showContactOptions()` Funktion

## 📋 Identifizierte Duplikationen

### Styles die zentralisiert werden sollten:

#### Card Styles (in RequestCard, MyRequestCard, AvailabilityCard):
- ✅ `card`, `cardHeader`, `cardTitle`, `cardSubtitle` → `src/styles/cards.ts`
- ✅ `badgesRow`, `dayBadge`, `dayBadgeText` → `src/styles/chips.ts`
- ✅ `chip`, `chipText`, `chipTextWhite` → `src/styles/chips.ts`
- ✅ Status Chips: `myRequestChip`, `offerChip`, `openChip`, `fulfilledChip`, `archivedChip` → `src/styles/chips.ts`

#### Funktionen die extrahiert werden sollten:
- ✅ `handleContact` (in RequestCard) → `showContactOptions()` in `contactUtils.ts`
- ⚠️ `commentPreview` Logik könnte in Hook extrahiert werden
- ⚠️ Status-Berechnungen (`isMyRequest`, `hasOffer`, etc.) könnten in Hooks

## 🔄 Migration Plan

### Phase 1: RequestCard.tsx
1. ✅ ActionButtons migriert
2. ⏳ Card Styles → `cardStyles` importieren
3. ⏳ Chip Styles → `chipStyles` importieren
4. ⏳ StatusChip Komponente verwenden
5. ⏳ DayBadge Komponente verwenden
6. ⏳ `handleContact` → `showContactOptions` verwenden

### Phase 2: MyRequestCard.tsx
- Gleiche Migration wie RequestCard

### Phase 3: AvailabilityCard.tsx
- Card Styles verwenden
- Badge Styles verwenden

## 💡 Beispiel Migration

### Vorher:
```tsx
<View style={styles.badgesRow}>
  {dayBadge && (
    <View style={styles.dayBadge}>
      <Text style={styles.dayBadgeText}>{dayBadge}</Text>
    </View>
  )}
  <View style={[styles.chip, styles.offerChip]}>
    <Text style={[styles.chipText, styles.chipTextWhite]}>Angeboten</Text>
  </View>
</View>
```

### Nachher:
```tsx
import DayBadge from '../common/DayBadge';
import StatusChip from '../common/StatusChip';
import {chipStyles} from '../../styles/chips';

<View style={chipStyles.badgesRow}>
  <DayBadge date={request.from} />
  <StatusChip type="offer" label="Angeboten" />
</View>
```

### Vorher (handleContact):
```tsx
const handleContact = () => {
  if (!contactPhone) {
    Alert.alert('Kontakt', 'Keine Telefonnummer...');
    return;
  }
  // ... 50+ Zeilen Code
};
```

### Nachher:
```tsx
import {showContactOptions} from '../utils/contactUtils';

<TouchableOpacity onPress={() => showContactOptions(contactPhone)}>
  {/* ... */}
</TouchableOpacity>
```
