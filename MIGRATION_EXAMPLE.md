# Migration Beispiel: RequestCard.tsx

## 1. Imports hinzufügen

```tsx
import StatusChip from './common/StatusChip';
import DayBadge from './common/DayBadge';
import {cardStyles} from '../styles/cards';
import {chipStyles} from '../styles/chips';
import {showContactOptions} from '../utils/contactUtils';
```

## 2. Badges & Chips ersetzen

### Vorher (Zeilen 341-367):
```tsx
<View style={styles.badgesRow}>
  {dayBadge && (
    <View style={styles.dayBadge}>
      <Text style={styles.dayBadgeText}>{dayBadge}</Text>
    </View>
  )}
  {isArchived && (
    <View style={[styles.chip, styles.archivedChip]}>
      <Text style={[styles.chipText, styles.chipTextWhite]}>Aufgehoben</Text>
    </View>
  )}
  {isFulfilled && (
    <View style={[styles.chip, styles.fulfilledChip]}>
      <Text style={[styles.chipText, styles.chipTextWhite]}>Erfüllt</Text>
    </View>
  )}
  {isMyRequest && (
    <View style={[styles.chip, styles.myRequestChip]}>
      <Text style={styles.chipText}>Meine Anfrage</Text>
    </View>
  )}
  {hasOffer && (
    <View style={[styles.chip, styles.offerChip]}>
      <Text style={[styles.chipText, styles.chipTextWhite]}>
        {isMyRequest ? 'Angeboten' : 'Mein Angebot'}
      </Text>
    </View>
  )}
  {isOpen(request) && (
    <View style={[styles.chip, styles.openChip]}>
      <Text style={[styles.chipText, styles.chipTextWhite]}>Offen</Text>
    </View>
  )}
</View>
```

### Nachher:
```tsx
<View style={chipStyles.badgesRow}>
  <DayBadge date={request.from} />
  {isArchived && <StatusChip type="archived" label="Aufgehoben" />}
  {isFulfilled && <StatusChip type="fulfilled" label="Erfüllt" />}
  {isMyRequest && <StatusChip type="myRequest" label="Meine Anfrage" />}
  {hasOffer && (
    <StatusChip
      type="offer"
      label={isMyRequest ? 'Angeboten' : 'Mein Angebot'}
    />
  )}
  {isOpen(request) && <StatusChip type="open" label="Offen" />}
</View>
```

## 3. handleContact ersetzen

### Vorher (Zeilen 248-299):
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
// handleContact Funktion komplett entfernen
// Direkt verwenden:
<TouchableOpacity onPress={() => showContactOptions(contactPhone)}>
  {/* ... */}
</TouchableOpacity>
```

## 4. Card Styles ersetzen

### Vorher:
```tsx
<View style={[styles.card, highlight && styles.cardHighlight]}>
  <View style={styles.cardHeader}>
    <View style={styles.cardTitleContainer}>
      <View style={styles.titleRow}>
        <Text style={styles.cardTitle}>...</Text>
      </View>
      <Text style={styles.cardSubtitle}>...</Text>
    </View>
  </View>
</View>
```

### Nachher:
```tsx
<View style={[cardStyles.card, highlight && cardStyles.cardHighlight]}>
  <View style={cardStyles.cardHeader}>
    <View style={cardStyles.cardTitleContainer}>
      <View style={cardStyles.titleRow}>
        <Text style={cardStyles.cardTitle}>...</Text>
      </View>
      <Text style={cardStyles.cardSubtitle}>...</Text>
    </View>
  </View>
</View>
```

## 5. Styles entfernen

Aus `styles` entfernen:
- ✅ `badgesRow`, `dayBadge`, `dayBadgeText`
- ✅ `chip`, `chipText`, `chipTextWhite`
- ✅ `myRequestChip`, `offerChip`, `openChip`, `fulfilledChip`, `archivedChip`
- ✅ `card`, `cardHeader`, `cardTitleContainer`, `titleRow`, `cardTitle`, `cardSubtitle`
- ✅ `headerContactBtn`

Diese sind jetzt zentral in:
- `src/styles/cards.ts`
- `src/styles/chips.ts`

## 📊 Ergebnis

- **~200 Zeilen Code reduziert**
- **Konsistente Styles** über alle Komponenten
- **Wiederverwendbare Komponenten** (StatusChip, DayBadge)
- **Zentrale Funktionen** (showContactOptions)
