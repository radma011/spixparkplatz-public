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
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import AuthService, {UserData} from '../services/AuthService';
import FirestoreService from '../services/FirestoreService';
import KeyboardAwareScreen from '../components/KeyboardAwareScreen';
import QRCodeGenerator from '../components/QRCodeGenerator';
import {getColors} from '../theme/colors';

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [facilityName, setFacilityName] = useState<string | undefined>(undefined);

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
      Alert.alert('Fehler', 'Bitte gib einen Benutzernamen ein');
      return;
    }

    const normalizedNewCode = facilityCode.trim().toUpperCase();
    const normalizedOldCode = userData.facilityCode.trim().toUpperCase();
    const facilityCodeChanged = normalizedNewCode !== normalizedOldCode;

    // Warnung wenn Facility-Code geändert wird
    if (facilityCodeChanged) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(
          '⚠️ Gruppe verlassen',
          'Du bist dabei, deine Parkanlagen-Gruppe zu wechseln.\n\n' +
            'Aktuelle Gruppe: ' + normalizedOldCode + '\n' +
            'Neue Gruppe: ' + normalizedNewCode + '\n\n' +
            'Wenn du den Code änderst:\n' +
            '• Du verlierst den Zugriff auf alle Anfragen deiner alten Gruppe\n' +
            '• Du siehst nur noch Anfragen der neuen Gruppe\n' +
            '• Deine bestehenden Anfragen bleiben in der alten Gruppe\n\n' +
            'Möchtest du wirklich die Gruppe wechseln?',
          [
            {
              text: 'Abbrechen',
              style: 'cancel',
              onPress: () => resolve(false),
            },
            {
              text: 'Ja, Gruppe wechseln',
              style: 'destructive',
              onPress: () => resolve(true),
            },
          ],
        );
      });

      if (!confirmed) {
        return; // User hat abgebrochen
      }

      // Validiere neuen Facility-Code
      const isValidFacility = await FirestoreService.validateFacilityCode(normalizedNewCode);
      if (!isValidFacility) {
        Alert.alert(
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
          Alert.alert(
            'Gruppe gewechselt',
            'Du hast erfolgreich die Parkanlagen-Gruppe gewechselt. Die App wird jetzt die Anfragen der neuen Gruppe anzeigen.',
          );
        } else {
          Alert.alert('Erfolg', 'Profil erfolgreich aktualisiert');
        }
      }
    } catch (error: any) {
      console.error('Fehler beim Aktualisieren:', error);
      Alert.alert('Fehler', 'Profil konnte nicht aktualisiert werden');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail.trim() || !resetEmail.includes('@')) {
      Alert.alert('Fehler', 'Bitte gib eine gültige E-Mail-Adresse ein');
      return;
    }

    setLoading(true);
    try {
      await AuthService.resetPassword(resetEmail.trim());
      Alert.alert(
        'E-Mail gesendet',
        'Eine E-Mail zum Zurücksetzen des Passworts wurde an ' +
          resetEmail +
          ' gesendet.',
        [{text: 'OK', onPress: () => setShowResetPassword(false)}],
      );
    } catch (error: any) {
      let errorMessage = 'Passwort konnte nicht zurückgesetzt werden';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Kein Konto mit dieser E-Mail gefunden';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Ungültige E-Mail-Adresse';
      }
      Alert.alert('Fehler', errorMessage);
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
      Alert.alert(
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
      Alert.alert('Fehler', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Abmelden',
      'Möchtest du dich wirklich abmelden?',
      [
        {text: 'Abbrechen', style: 'cancel'},
        {
          text: 'Abmelden',
          style: 'destructive',
          onPress: async () => {
            try {
              await AuthService.logout();
            } catch (e) {
              console.error('Logout-Fehler:', e);
              Alert.alert('Fehler', 'Abmeldung fehlgeschlagen');
            }
          },
        },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '⚠️ Account löschen',
      'Möchtest du wirklich deinen Account und alle deine Daten unwiderruflich löschen?\n\nAlle deine Daten werden dauerhaft gelöscht:\n• Dein Profil\n• Alle deine Anfragen\n• Alle deine Angebote\n• Alle deine Kommentare\n\nDiese Aktion kann NICHT rückgängig gemacht werden.',
      [
        {text: 'Abbrechen', style: 'cancel'},
        {
          text: 'Ja, Account löschen',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              await AuthService.deleteAccount();
              // User wird automatisch ausgeloggt nach erfolgreichem Löschen
              Alert.alert(
                'Account gelöscht',
                'Dein Account und alle zugehörigen Daten wurden erfolgreich gelöscht.',
                [{text: 'OK'}],
              );
            } catch (error: any) {
              console.error('Fehler beim Löschen des Accounts:', error);
              let errorMessage = 'Account konnte nicht gelöscht werden';
              if (error?.code === 'functions/http-error') {
                errorMessage = error?.message || errorMessage;
              } else if (error?.message) {
                errorMessage = error.message;
              }
              Alert.alert('Fehler', errorMessage);
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  return (
    <KeyboardAwareScreen contentContainerStyle={styles.container} keyboardVerticalOffset={0}>
      <View style={[styles.header, {paddingTop: 16 + insets.top}]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Zurück</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profil</Text>
        <TouchableOpacity onPress={handleLogout} style={styles.iconButton}>
          <MaterialCommunityIcons name="logout-variant" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Persönliche Informationen</Text>

          <Text style={styles.label}>Benutzername *</Text>
          <TextInput
            style={styles.input}
            placeholder="Dein Benutzername"
            value={username}
            onChangeText={setUsername}
            editable={!loading}
          />
          <Text style={styles.hint}>Andere Nutzer:innen sehen Dich unter diesem Namen</Text>

          <Text style={styles.label}>E-Mail</Text>
          <TextInput
            style={[styles.input, styles.inputDisabled]}
            value={userData.email}
            editable={false}
          />

          <Text style={styles.label}>Telefon (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="+49 123 456789"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            editable={!loading}
          />

          <Text style={styles.label}>Parkanlagen-Code *</Text>
          <TextInput
            style={styles.input}
            placeholder="z.B. PARK01"
            value={facilityCode}
            onChangeText={(text) => setFacilityCode(text.toUpperCase())}
            autoCapitalize="characters"
            editable={!loading}
          />
          <Text style={styles.hint}>
            {facilityCode.trim().toUpperCase() !== userData.facilityCode.trim().toUpperCase()
              ? '⚠️ Achtung: Du wirst die Gruppe wechseln, wenn du speicherst!'
              : 'Dieser Code ordnet Dich einer Parkanlage zu'}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Parkplätze (bis zu 3)</Text>
          {[0, 1, 2].map((index) => (
            <View key={index}>
              <Text style={styles.label}>
                Parkplatz {index + 1} (optional)
              </Text>
              <TextInput
                style={styles.input}
                placeholder={`Parkplatz ${index + 1}`}
                value={parkingSpots[index]}
                onChangeText={(value) => handleParkingSpotChange(index, value)}
                editable={!loading}
              />
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveButton, loading && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Speichern</Text>
          )}
        </TouchableOpacity>

        {isAdmin && userData.facilityCode && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>QR-Code für Registrierung</Text>
            <Text style={styles.hint}>
              Generiere einen QR-Code, den neue Nutzer scannen können, um sich mit dem Code{' '}
              {userData.facilityCode} zu registrieren.
            </Text>
            <TouchableOpacity
              style={styles.qrButton}
              onPress={() => setShowQRCode(true)}
              disabled={loading}>
              <MaterialCommunityIcons name="qrcode" size={20} color="#007AFF" style={styles.qrIcon} />
              <Text style={styles.qrButtonText}>QR-Code anzeigen</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sicherheit</Text>
          {!showChangeEmail ? (
            <TouchableOpacity
              style={styles.resetPasswordButton}
              onPress={() => setShowChangeEmail(true)}
              disabled={loading}>
              <Text style={styles.resetPasswordButtonText}>E-Mail ändern</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.resetPasswordContainer}>
              <Text style={styles.label}>Neue E-Mail-Adresse</Text>
              <TextInput
                style={styles.input}
                placeholder="neu@email.de"
                value={newEmail}
                onChangeText={setNewEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
              <View style={styles.resetPasswordActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowChangeEmail(false);
                    setNewEmail(userData.email);
                  }}
                  disabled={loading}>
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sendButton}
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
              style={[styles.resetPasswordButton, styles.resetPasswordButtonSpacing]}
              onPress={() => setShowResetPassword(true)}
              disabled={loading}>
              <Text style={styles.resetPasswordButtonText}>
                Passwort zurücksetzen
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.resetPasswordContainer}>
              <Text style={styles.label}>E-Mail-Adresse</Text>
              <TextInput
                style={styles.input}
                placeholder="deine@email.de"
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                editable={!loading}
              />
              <View style={styles.resetPasswordActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowResetPassword(false);
                    setResetEmail(userData.email);
                  }}
                  disabled={loading}>
                  <Text style={styles.cancelButtonText}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.sendButton}
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
            onPress={handleLogout}
            disabled={loading}>
            <MaterialCommunityIcons name="logout-variant" size={18} color="#fff" />
            <Text style={styles.logoutButtonText}>Abmelden</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account löschen</Text>
          <Text style={styles.hint}>
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
      </View>

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
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#007AFF',
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
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputDisabled: {
    backgroundColor: '#f5f5f5',
    color: '#666',
  },
  hint: {
    textAlign: 'left',
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  resetPasswordButton: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  resetPasswordButtonSpacing: {
    marginTop: 12,
  },
  resetPasswordButtonText: {
    color: '#007AFF',
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
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
  sendButton: {
    flex: 1,
    backgroundColor: '#007AFF',
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
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    marginTop: 10,
  },
  qrIcon: {
    marginRight: 10,
  },
  qrButtonText: {
    fontSize: 16,
    color: '#007AFF',
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
});

export default ProfileScreen;

