import {Alert, Platform} from 'react-native';
import {normalizePhone, tryOpenUrl} from './contactLinks';
import {showAlert} from './alertUtils';

/**
 * Zeigt einen Alert-Dialog mit Kontaktoptionen (Anrufen, SMS, WhatsApp, Signal)
 */
export const showContactOptions = (phone: string | undefined) => {
  if (!phone) {
    showAlert(
      'Kontakt',
      'Keine Telefonnummer im Profil hinterlegt (oder Profil ist noch nicht synchronisiert).',
    );
    return;
  }

  const normalized = normalizePhone(phone);
  if (!normalized) {
    showAlert('Fehler', 'Keine gültige Telefonnummer vorhanden');
    return;
  }

  const {e164, digits} = normalized;

  // Im Web können wir nur einen einfachen Link öffnen, keine App-Auswahl
  const isWeb = Platform.OS === 'web';
  
  if (isWeb) {
    // Im Web: Öffne WhatsApp direkt (am häufigsten verwendet)
    const whatsappUrl = `https://wa.me/${digits}`;
    window.open(whatsappUrl, '_blank');
    return;
  }

  // Native: Zeige Auswahl-Dialog
  Alert.alert(
    'Kontakt',
    'Wie möchtest du die Person kontaktieren?',
    [
      {
        text: 'Anrufen',
        onPress: async () => {
          const ok = await tryOpenUrl(`tel:${e164}`);
          if (!ok) showAlert('Fehler', 'Konnte Telefon-App nicht öffnen');
        },
      },
      {
        text: 'SMS/iMessage',
        onPress: async () => {
          const ok = await tryOpenUrl(`sms:${e164}`);
          if (!ok) showAlert('Fehler', 'Konnte Nachrichten-App nicht öffnen');
        },
      },
      {
        text: 'WhatsApp',
        onPress: async () => {
          // wa.me requires digits only
          const ok = await tryOpenUrl(`https://wa.me/${digits}`);
          if (!ok) showAlert('Fehler', 'Konnte WhatsApp nicht öffnen');
        },
      },
      {
        text: 'Signal',
        onPress: async () => {
          const ok = await tryOpenUrl(`sgnl://send?phone=${encodeURIComponent(e164)}`);
          if (!ok) showAlert('Fehler', 'Konnte Signal nicht öffnen');
        },
      },
      {text: 'Abbrechen', style: 'cancel'},
    ],
  );
};
