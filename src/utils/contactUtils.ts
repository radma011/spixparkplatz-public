import {Alert} from 'react-native';
import {normalizePhone, tryOpenUrl} from './contactLinks';

/**
 * Zeigt einen Alert-Dialog mit Kontaktoptionen (Anrufen, SMS, WhatsApp, Signal)
 */
export const showContactOptions = (phone: string | undefined) => {
  if (!phone) {
    Alert.alert(
      'Kontakt',
      'Keine Telefonnummer im Profil hinterlegt (oder Profil ist noch nicht synchronisiert).',
    );
    return;
  }

  const normalized = normalizePhone(phone);
  if (!normalized) {
    Alert.alert('Fehler', 'Keine gültige Telefonnummer vorhanden');
    return;
  }

  const {e164, digits} = normalized;

  Alert.alert(
    'Kontakt',
    'Wie möchtest du die Person kontaktieren?',
    [
      {
        text: 'Anrufen',
        onPress: async () => {
          const ok = await tryOpenUrl(`tel:${e164}`);
          if (!ok) Alert.alert('Fehler', 'Konnte Telefon-App nicht öffnen');
        },
      },
      {
        text: 'SMS/iMessage',
        onPress: async () => {
          const ok = await tryOpenUrl(`sms:${e164}`);
          if (!ok) Alert.alert('Fehler', 'Konnte Nachrichten-App nicht öffnen');
        },
      },
      {
        text: 'WhatsApp',
        onPress: async () => {
          // wa.me requires digits only
          const ok = await tryOpenUrl(`https://wa.me/${digits}`);
          if (!ok) Alert.alert('Fehler', 'Konnte WhatsApp nicht öffnen');
        },
      },
      {
        text: 'Signal',
        onPress: async () => {
          const ok = await tryOpenUrl(`sgnl://send?phone=${encodeURIComponent(e164)}`);
          if (!ok) Alert.alert('Fehler', 'Konnte Signal nicht öffnen');
        },
      },
      {text: 'Abbrechen', style: 'cancel'},
    ],
  );
};
