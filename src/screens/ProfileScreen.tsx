import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  useColorScheme,
  Platform,
} from 'react-native';
import {confirmAlert, showAlert} from '../utils/alertUtils';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AuthService, {UserData} from '../services/AuthService';
import FirestoreService from '../services/FirestoreService';
import KeyboardAwareScreen from '../components/KeyboardAwareScreen';
import QRCodeGenerator from '../components/QRCodeGenerator';
import {getColors} from '../theme/colors';
import {FacilityLayoutEditor} from '../facilityLayout';
import {formatAppVersion, getAppVersionInfo} from '../utils/appVersion';

interface Props {
  userData: UserData;
  onBack: () => void;
  onUserDataUpdated: (userData: UserData) => void;
}

const ProfileScreen: React.FC<Props> = ({
  userData,
  onBack,
  onUserDataUpdated,
}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const [username, setUsername] = useState(userData.username);
  const [phone, setPhone] = useState(userData.phone);
  const [facilityCode, setFacilityCode] = useState(userData.facilityCode);
  const [parkingSpots, setParkingSpots] = useState<string[]>(
    userData.parkingSpots.length > 0
      ? [...userData.parkingSpots, '', ''].slice(0, 3)
      : ['', '', ''],
  );
  const [loading, setLoading] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState(userData.email);
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [newEmail, setNewEmail] = useState(userData.email);
  const [showQRCode, setShowQRCode] = useState(false);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [facilityName, setFacilityName] = useState<string | undefined>(undefined);
  const appVersionLabel = formatAppVersion(getAppVersionInfo());

  // Check if user is admin and get facility info
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        // Get user document directly to check admin field
        const {getFirestore, doc, getDoc} = require('@react-native-firebase/firestore');
        const db = getFirestore();
        const userDocRef = doc(db, 'users', userData.uid);
        const userDocSnap = await getDoc(userDocRef);
        
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          const adminStatus = data?.admin === true;
          setIsAdmin(adminStatus);
          
          // Get facility info if admin
          if (adminStatus && userData.facilityCode) {
            const facilityInfo = await FirestoreService.getFacilityInfo(userData.facilityCode);
            if (facilityInfo) {
              setFacilityName(facilityInfo.name);
            }
          }
        }
      } catch (e) {
        console.error('Error checking admin status:', e);
      }
    };
    checkAdmin();
  }, [userData.uid, userData.facilityCode]);

  useEffect(() => {
    // Stelle sicher, dass parkingSpots immer 3 Elemente hat
    const spots = [...userData.parkingSpots];
    while (spots.length < 3) {
      spots.push('');
    }
    setParkingSpots(spots.slice(0, 3));
    setNewEmail(userData.email);
    setFacilityCode(userData.facilityCode);
  }, [userData]);

  const handleParkingSpotChange = (index: number, value: string) => {
    const newSpots = [...parkingSpots];
    newSpots[index] = value;
    setParkingSpots(newSpots);
  };

  const handleSave = async () => {
    if (!username.trim()) {
      showAlert('Fehler', 'Bitte gib einen Benutzernamen ein');
      return;
    }

    const normalizedNewCode = facilityCode.trim().toUpperCase();
    const normalizedOldCode = userData.facilityCode.trim().toUpperCase();
    const facilityCodeChanged = normalizedNewCode !== normalizedOldCode;

    // Warnung wenn Facility-Code geändert wird
    if (facilityCodeChanged) {
      const message = 'Du bist dabei, deine Parkanlagen-Gruppe zu wechseln.\n\n' +
        'Aktuelle Gruppe: ' + normalizedOldCode + '\n' +
        'Neue Gruppe: ' + normalizedNewCode + '\n\n' +
        'Wenn du den Code änderst:\n' +
        '• Du verlierst den Zugriff auf alle Anfragen deiner alten Gruppe\n' +
        '• Du siehst nur noch Anfragen der neuen Gruppe\n' +
        '• Deine bestehenden Anfragen bleiben in der alten Gruppe\n\n' +
        'Möchtest du wirklich die Gruppe wechseln?';
      
      const confirmed = await new Promise<boolean>((resolve) => {
        confirmAlert(
          '⚠️ Gruppe verlassen',
          message,
          () => resolve(true),
          () => resolve(false),
          'Ja, Gruppe wechseln',
          'Abbrechen',
        );
      });

      if (!confirmed) {
        return; // User hat abgebrochen
      }

      // Validiere neuen Facility-Code
      const isValidFacility = await FirestoreService.validateFacilityCode(normalizedNewCode);
      if (!isValidFacility) {
        showAlert(
          'Ungültiger Code',
          'Der eingegebene Parkanlagen-Code existiert nicht. Bitte überprüfe den Code oder kontaktiere den Administrator.',
        );
        return;
      }
    }

    setLoading(true);
    try {
      const validSpots = parkingSpots.filter((spot) => spot.trim() !== '');
      await AuthService.updateUserData({
        username: username.trim(),
        phone: phone.trim() || '', // Allow empty phone
        parkingSpots: validSpots, // Allow empty array
        facilityCode: normalizedNewCode,
      });

      // Aktualisierte User-Daten abrufen
      const updatedUserData = await AuthService.getCurrentUser();
      if (updatedUserData) {
        onUserDataUpdated(updatedUserData);
        if (facilityCodeChanged) {
          showAlert(
            'Gruppe gewechselt',
            'Du hast erfolgreich die Parkanlagen-Gruppe gewechselt. Die App wird jetzt die Anfragen der neuen Gruppe anzeigen.',
          );
        } else {
          showAlert('Erfolg', 'Profil erfolgreich aktualisiert');
        }
      }
    } catch (error: any) {
      console.error('Fehler beim Aktualisieren:', error);
      showAlert('Fehler', 'Profil konnte nicht aktualisiert werden');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      showAlert('Fehler', 'Bitte gib eine gültige E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    try {
      await AuthService.resetPassword(resetEmail.trim());
      showAlert(
        'E-Mail gesendet',
        'Eine E-Mail zum Zurücksetzen des Passworts wurde an ' +
          resetEmail +
          ' gesendet.',
        () => setShowResetPassword(false),
      );
    } catch (error: any) {
      let errorMessage = 'Passwort konnte nicht zurückgesetzt werden';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Kein Konto mit dieser E-Mail gefunden';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Ungültige E-Mail-Adresse';
      }
      showAlert('Fehler', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      Alert.alert('Fehler', 'Bitte gib eine gültige E-Mail-Adresse ein');
      return;
    }
    setLoading(true);
    try {
      await AuthService.requestEmailChange(newEmail.trim());
      showAlert(
        'Bestätigung gesendet',
        'Wir haben eine Bestätigungs-E-Mail an die neue Adresse gesendet. Bitte den Link dort öffnen. Danach die App kurz neu starten (oder einmal ab- und wieder anmelden), damit die Änderung überall sichtbar ist.',
      );
      setShowChangeEmail(false);
    } catch (error: any) {
      let msg = 'E-Mail konnte nicht geändert werden';
      if (error?.code === 'auth/requires-recent-login') {
        msg = 'Bitte melde dich einmal ab und wieder an, bevor du die E-Mail änderst.';
      } else if (error?.code === 'auth/invalid-email') {
        msg = 'Ungültige E-Mail-Adresse';
      } else if (error?.code === 'auth/email-already-in-use') {
        msg = 'Diese E-Mail-Adresse wird bereits verwendet';
      }
      showAlert('Fehler', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    console.log('[ProfileScreen] handleLogout called');
    
    // Use window.confirm for web, Alert.alert for native
    const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
    const isWeb = Platform.OS === 'web' && win?.confirm;
    
    if (isWeb && win) {
      const confirmed = win.confirm('Möchtest du dich wirklich abmelden?');
      console.log('[ProfileScreen] User confirmed logout:', confirmed);
      if (!confirmed) {
        console.log('[ProfileScreen] User cancelled logout');
        return;
      }
    } else {
      Alert.alert(
        'Abmelden',
        'Möchtest du dich wirklich abmelden?',
        [
          {text: 'Abbrechen', style: 'cancel'},
          {
            text: 'Abmelden',
            style: 'destructive',
            onPress: async () => {
              await performLogout();
            },
          },
        ],
      );
      return;
    }
    
    // Perform logout directly for web
    performLogout();
  };
  
  const performLogout = async () => {
    try {
      console.log('[ProfileScreen] Logout button pressed');
      setLoading(true);
      console.log('[ProfileScreen] Starting logout...');
      await AuthService.logout();
      console.log('[ProfileScreen] Logout successful - waiting for auth state change');
      // Logout successful - Auth state listener will handle UI update
      // Force a small delay to ensure auth state updates
      await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
      console.log('[ProfileScreen] After delay - checking if user is still logged in');
    } catch (e: any) {
      console.error('[ProfileScreen] Logout-Fehler:', e);
      const errorMessage = e?.message || e?.code || 'Abmeldung fehlgeschlagen';
      const win = typeof globalThis !== 'undefined' ? (globalThis as any).window : undefined;
      if (win?.alert) {
        win.alert(`Abmeldung fehlgeschlagen: ${errorMessage}`);
      } else {
        Alert.alert('Fehler', `Abmeldung fehlgeschlagen: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    const message = 'Möchtest du wirklich deinen Account und alle deine Daten unwiderruflich löschen?\n\nAlle deine Daten werden dauerhaft gelöscht:\n• Dein Profil\n• Alle deine Anfragen\n• Alle deine Angebote\n• Alle deine Kommentare\n\nDiese Aktion kann NICHT rückgängig gemacht werden.';
    
    confirmAlert(
      '⚠️ Account löschen',
      message,
      async () => {
        setLoading(true);
        try {
          await AuthService.deleteAccount();
          // User wird automatisch ausgeloggt nach erfolgreichem Löschen
          showAlert('Account gelöscht', 'Dein Account und alle zugehörigen Daten wurden erfolgreich gelöscht.');
        } catch (error: any) {
          console.error('Fehler beim Löschen des Accounts:', error);
          let errorMessage = 'Account konnte nicht gelöscht werden';
          if (error?.code === 'functions/http-error') {
            errorMessage = error?.message || errorMessage;
          } else if (error?.message) {
            errorMessage = error.message;
          }
          showAlert('Fehler', errorMessage);
        } finally {
          setLoading(false);
        }
      },
      undefined,
      'Ja, Account löschen',
      'Abbrechen',
    );
  };

  const inputStyle = [
    styles.input,
    {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text},
  ];

  return (
    <KeyboardAwareScreen
      contentContainerStyle={[styles.container, {backgroundColor: colors.screenBg}]}
      keyboardVerticalOffset={0}>
      <View style={[styles.header, {paddingTop: 16 + insets.top, backgroundColor: colors.brand}]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <TouchableOpacity 
          onPress={() => {
            console.log('[ProfileScreen] Header logout icon clicked!');
            handleLogout();
          }} 
          style={styles.iconButton}
          activeOpacity={0.7}>
          <MaterialCommunityIcons name="logout-variant" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.text}]}>Persönliche Informationen</Text>

          <Text style={[styles.label, {color: colors.text}]}>Benutzername *</Text>
          <TextInput
            style={inputStyle}
            placeholder="Dein Benutzername"
            placeholderTextColor={colors.subtext}
            value={username}
            onChangeText={setUsername}
            editable={!loading}
          />
          <Text style={[styles.hint, {color: colors.subtext}]}>
            Andere Nutzer:innen sehen Dich unter diesem Namen
          </Text>

          <Text style={[styles.label, {color: colors.text}]}>E-Mail</Text>
          <TextInput
            style={[
              inputStyle,
              {backgroundColor: colors.surface2, color: colors.subtext},
            ]}
            value={userData.email}
            editable={false}
          />

          <Text style={[styles.label, {color: colors.text}]}>Telefon (optional)</Text>
          <TextInput
            style={inputStyle}
            placeholder="+49 123 456789"
            placeholderTextColor={colors.subtext}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            editable={!loading}
          />

          <Text style={[styles.label, {color: colors.text}]}>Parkanlagen-Code *</Text>
          <TextInput
            style={inputStyle}
            placeholder="z.B. PARK01"
            placeholderTextColor={colors.subtext}
            value={facilityCode}
            onChangeText={(text) => setFacilityCode(text.toUpperCase())}
            autoCapitalize="characters"
            editable={!loading}
          />
          <Text style={[styles.hint, {color: colors.subtext}]}>
            {facilityCode.trim().toUpperCase() !== userData.facilityCode.trim().toUpperCase()
              ? '⚠️ Achtung: Du wirst die Gruppe wechseln, wenn du speicherst!'
              : 'Dieser Code ordnet Dich einer Parkanlage zu'}
          </Text>
        </View>

        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.text}]}>Parkplätze (bis zu 3)</Text>
          {[0, 1, 2].map((index) => (
            <View key={index}>
              <Text style={[styles.label, {color: colors.text}]}>
                Parkplatz {index + 1} (optional)
              </Text>
              <TextInput
                style={inputStyle}
                placeholder={`Parkplatz ${index + 1}`}
                placeholderTextColor={colors.subtext}
                value={parkingSpots[index]}
                onChangeText={(value) => handleParkingSpotChange(index, value)}
                editable={!loading}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            {backgroundColor: colors.brand},
            loading && {backgroundColor: colors.border},
          ]}
          onPress={handleSave}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Speichern</Text>
          )}
        </TouchableOpacity>

        {isAdmin && userData.facilityCode && (
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.text}]}>QR-Code für Registrierung</Text>
            <Text style={[styles.hint, {color: colors.subtext}]}>
              Generiere einen QR-Code, den neue Nutzer scannen können, um sich mit dem Code{' '}
              {userData.facilityCode} zu registrieren.
            </Text>
            <TouchableOpacity
              style={[styles.qrButton, {backgroundColor: colors.surface2}]}
              onPress={() => setShowQRCode(true)}
              disabled={loading}>
              <MaterialCommunityIcons name="qrcode" size={20} color={colors.brand} style={styles.qrIcon} />
              <Text style={[styles.qrButtonText, {color: colors.brand}]}>QR-Code anzeigen</Text>
            </TouchableOpacity>
            <Text style={[styles.hint, {marginTop: 16, color: colors.subtext}]}>
              Erstelle den Lageplan der Anlage offline und lade ihn anschließend in die Cloud hoch.
            </Text>
            <TouchableOpacity
              style={[styles.qrButton, {marginTop: 8, backgroundColor: colors.surface2}]}
              onPress={() => setShowLayoutEditor(true)}
              disabled={loading}>
              <MaterialCommunityIcons name="map-marker-path" size={20} color={colors.brand} style={styles.qrIcon} />
              <Text style={[styles.qrButtonText, {color: colors.brand}]}>Lageplan bearbeiten</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.text}]}>Sicherheit</Text>
          {!showChangeEmail ? (
            <TouchableOpacity
              style={[
                styles.resetPasswordButton,
                {backgroundColor: colors.surface2, borderColor: colors.border},
              ]}
              onPress={() => setShowChangeEmail(true)}
              disabled={loading}>
              <Text style={[styles.resetPasswordButtonText, {color: colors.brand}]}>E-Mail ändern</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.resetPasswordContainer}>
              <Text style={[styles.label, {color: colors.text}]}>Neue E-Mail-Adresse</Text>
              <TextInput
                style={inputStyle}
                placeholder="neu@email.de"
                placeholderTextColor={colors.subtext}
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
              <View style={styles.resetPasswordActions}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => {
                    setShowChangeEmail(false);
                    setNewEmail(userData.email);
                  }}
                  disabled={loading}>
                  <Text style={[styles.cancelButtonText, {color: colors.text}]}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendButton, {backgroundColor: colors.brand}]}
                  onPress={handleChangeEmail}
                  disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.sendButtonText}>Bestätigen</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!showResetPassword ? (
            <TouchableOpacity
              style={[
                styles.resetPasswordButton,
                styles.resetPasswordButtonSpacing,
                {backgroundColor: colors.surface2, borderColor: colors.border},
              ]}
              onPress={() => setShowResetPassword(true)}
              disabled={loading}>
              <Text style={[styles.resetPasswordButtonText, {color: colors.brand}]}>
                Passwort zurücksetzen
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.resetPasswordContainer}>
              <Text style={[styles.label, {color: colors.text}]}>E-Mail-Adresse</Text>
              <TextInput
                style={inputStyle}
                placeholder="deine@email.de"
                placeholderTextColor={colors.subtext}
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
              <View style={styles.resetPasswordActions}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    {backgroundColor: colors.surface2, borderColor: colors.border},
                  ]}
                  onPress={() => {
                    setShowResetPassword(false);
                    setResetEmail(userData.email);
                  }}
                  disabled={loading}>
                  <Text style={[styles.cancelButtonText, {color: colors.text}]}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sendButton, {backgroundColor: colors.brand}]}
                  onPress={handleResetPassword}
                  disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.sendButtonText}>E-Mail senden</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => {
              console.log('[ProfileScreen] Logout button clicked!');
              handleLogout();
            }}
            disabled={loading}
            activeOpacity={0.7}>
            <MaterialCommunityIcons name="logout-variant" size={18} color="#fff" />
            <Text style={styles.logoutButtonText}>Abmelden</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.text}]}>Account löschen</Text>
          <Text style={[styles.hint, {color: colors.subtext}]}>
            Wenn du deinen Account löschst, werden alle deine Daten unwiderruflich gelöscht:
            {'\n'}• Dein Profil und alle persönlichen Informationen
            {'\n'}• Alle deine Parkplatz-Anfragen
            {'\n'}• Alle deine Angebote
            {'\n'}• Alle deine Kommentare
            {'\n\n'}
            Diese Aktion kann nicht rückgängig gemacht werden.
          </Text>
          <TouchableOpacity
            style={styles.deleteAccountButton}
            onPress={handleDeleteAccount}
            disabled={loading}>
            <MaterialCommunityIcons name="delete-forever" size={18} color="#fff" />
            <Text style={styles.deleteAccountButtonText}>Account löschen</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.versionText, {color: colors.subtext}]}>
          Version {appVersionLabel}
        </Text>
      </View>

      <Modal
        visible={showLayoutEditor}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowLayoutEditor(false)}>
        <FacilityLayoutEditor
          facilityCode={userData.facilityCode}
          userId={userData.uid}
          onClose={() => setShowLayoutEditor(false)}
        />
      </Modal>

      <Modal
        visible={showQRCode}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowQRCode(false)}>
        <View style={[styles.modalContainer, {backgroundColor: colors.screenBg}]}>
          <View style={[styles.modalHeader, {borderBottomColor: colors.border}]}>
            <Text style={[styles.modalTitle, {color: colors.text}]}>QR-Code für Registrierung</Text>
            <TouchableOpacity onPress={() => setShowQRCode(false)} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
          </View>
          <QRCodeGenerator
            facilityCode={userData.facilityCode}
            facilityName={facilityName}
          />
        </View>
      </Modal>
    </KeyboardAwareScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  backButton: {
    width: 80,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  iconButton: {
    width: 80,
    alignItems: 'flex-end',
  },
  content: {
    padding: 20,
  },
  section: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  hint: {
    textAlign: 'left',
    fontSize: 12,
    marginTop: 4,
  },
  saveButton: {
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetPasswordButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  resetPasswordButtonSpacing: {
    marginTop: 12,
  },
  resetPasswordButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resetPasswordContainer: {
    marginTop: 8,
  },
  logoutButton: {
    marginTop: 16,
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  deleteAccountButton: {
    marginTop: 16,
    backgroundColor: '#8B0000',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteAccountButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  resetPasswordActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
    marginTop: 10,
  },
  qrIcon: {
    marginRight: 10,
  },
  qrButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 24,
  },
});

export default ProfileScreen;

