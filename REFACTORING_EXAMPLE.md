# Refactoring Beispiel: RequestCard.tsx

## Vorher (aktuell):
```tsx
{isMyOffer && myActiveOffer && !isArchived && !isFulfilled && (
  <TouchableOpacity style={[styles.actionBtn, styles.actionRed]} onPress={() => onCancelOffer(request)}>
    <MaterialCommunityIcons name="close-circle-outline" size={16} color="#fff" />
    <Text style={styles.actionTextWhite}>Storno</Text>
  </TouchableOpacity>
)}
```

## Nachher (mit ActionButton):
```tsx
import ActionButton from '../common/ActionButton';

{isMyOffer && myActiveOffer && !isArchived && !isFulfilled && (
  <ActionButton
    onPress={() => onCancelOffer(request)}
    label="Storno"
    icon="close-circle-outline"
    variant="red"
  />
)}
```

## Vorteile:
- ✅ Weniger Code (3 Zeilen statt 5)
- ✅ Konsistente Styles
- ✅ Einfacher zu warten
- ✅ Type-safe Props

## Weitere Beispiele:

### Modal Footer Buttons:
```tsx
// Vorher:
<TouchableOpacity
  style={[styles.cancelButton, {backgroundColor: colors.surface2}]}
  onPress={handleClose}
  disabled={isSubmitting}>
  <Text style={[styles.cancelButtonText, {color: colors.subtext}]}>Abbrechen</Text>
</TouchableOpacity>
<TouchableOpacity
  style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
  onPress={handleSubmit}
  disabled={isSubmitting}>
  <Text style={styles.submitButtonText}>
    {isSubmitting ? 'Erstelle...' : 'Anfragen'}
  </Text>
</TouchableOpacity>

// Nachher:
import Button from '../common/Button';

<Button
  variant="cancel"
  label="Abbrechen"
  onPress={handleClose}
  disabled={isSubmitting}
/>
<Button
  variant="primary"
  label={isSubmitting ? 'Erstelle...' : 'Anfragen'}
  onPress={handleSubmit}
  disabled={isSubmitting}
  loading={isSubmitting}
/>
```

### Modal mit BaseModal:
```tsx
// Vorher: 50+ Zeilen Modal-Setup in jeder Komponente

// Nachher:
import BaseModal from '../common/Modal';
import Button from '../common/Button';

<BaseModal
  visible={visible}
  onClose={onClose}
  title="Neue Anfrage"
  footer={
    <>
      <Button variant="cancel" label="Abbrechen" onPress={onClose} />
      <Button variant="primary" label="Anfragen" onPress={handleSubmit} />
    </>
  }>
  {/* Modal Content */}
</BaseModal>
```
