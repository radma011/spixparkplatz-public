import {Alert, Platform} from 'react-native';

/**
 * Web-kompatible Alert-Utility
 * Verwendet window.confirm für Bestätigungen im Web, Alert.alert für native Plattformen
 */

interface AlertButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

/**
 * Zeigt einen Bestätigungsdialog (mit Abbrechen- und Bestätigen-Button)
 * @param title Titel des Dialogs
 * @param message Nachricht
 * @param onConfirm Callback wenn bestätigt wird
 * @param onCancel Optionaler Callback wenn abgebrochen wird
 * @param confirmText Text für Bestätigungsbutton (Standard: "OK")
 * @param cancelText Text für Abbrechen-Button (Standard: "Abbrechen")
 */
export const confirmAlert = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  confirmText: string = 'OK',
  cancelText: string = 'Abbrechen',
) => {
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

  if (isWeb) {
    const confirmed = window.confirm(`${title}\n\n${message}`);
    if (confirmed) {
      onConfirm();
    } else if (onCancel) {
      onCancel();
    }
  } else {
    Alert.alert(
      title,
      message,
      [
        {text: cancelText, style: 'cancel', onPress: onCancel},
        {
          text: confirmText,
          style: confirmText.toLowerCase().includes('lösch') || confirmText.toLowerCase().includes('storn') ? 'destructive' : 'default',
          onPress: onConfirm,
        },
      ],
    );
  }
};

/**
 * Zeigt einen einfachen Alert (nur OK-Button)
 * @param title Titel
 * @param message Nachricht
 * @param onPress Optionaler Callback wenn OK gedrückt wird
 */
export const showAlert = (title: string, message: string, onPress?: () => void) => {
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

  if (isWeb) {
    window.alert(`${title}\n\n${message}`);
    if (onPress) {
      onPress();
    }
  } else {
    Alert.alert(title, message, [{text: 'OK', onPress}]);
  }
};

/**
 * Zeigt einen Alert mit mehreren Buttons (nur für native, im Web wird window.confirm verwendet)
 * @param title Titel
 * @param message Nachricht
 * @param buttons Array von Buttons
 */
export const showAlertWithButtons = (title: string, message: string, buttons: AlertButton[]) => {
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

  if (isWeb) {
    // Im Web können wir nur confirm/alert verwenden
    // Wenn es mehr als 2 Buttons gibt, verwenden wir confirm mit dem ersten destruktiven Button
    const destructiveButton = buttons.find((b) => b.style === 'destructive');
    const cancelButton = buttons.find((b) => b.style === 'cancel');
    const defaultButton = buttons.find((b) => !b.style || b.style === 'default');

    if (destructiveButton && cancelButton) {
      // Bestätigungsdialog mit destruktivem Button
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && destructiveButton.onPress) {
        destructiveButton.onPress();
      } else if (!confirmed && cancelButton.onPress) {
        cancelButton.onPress();
      }
    } else if (defaultButton) {
      // Einfacher Dialog
      const confirmed = window.confirm(`${title}\n\n${message}`);
      if (confirmed && defaultButton.onPress) {
        defaultButton.onPress();
      }
    } else {
      // Fallback: einfacher Alert
      window.alert(`${title}\n\n${message}`);
      if (buttons[0]?.onPress) {
        buttons[0].onPress();
      }
    }
  } else {
    Alert.alert(title, message, buttons);
  }
};
