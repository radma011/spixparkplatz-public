import React, {useState, useEffect} from 'react';
import {
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  View,
  Switch,
  useColorScheme,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {showAlert} from '../utils/alertUtils';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AuthService from '../services/AuthService';
import FirestoreService from '../services/FirestoreService';
import KeyboardAwareScreen from '../components/KeyboardAwareScreen';
import {getColors} from '../theme/colors';
import {generateFacilityCode} from '../utils/facilityCodeGenerator';

interface Props {
  onRegisterSuccess: () => void;
  onBackToLogin: () => void;
  initialFacilityCode?: string;
}

const RegisterScreen: React.FC<Props> = ({onRegisterSuccess, onBackToLogin, initialFacilityCode}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [facilityCode, setFacilityCode] = useState(initialFacilityCode || '');
  const [createNewFacility, setCreateNewFacility] = useState(false);
  const [facilityName, setFacilityName] = useState('');
  const [parkingSpots, setParkingSpots] = useState<string[]>(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Update facility code when initialFacilityCode prop changes (e.g., from deep link)
  useEffect(() => {
    if (initialFacilityCode) {
      const normalizedCode = initialFacilityCode.trim().toUpperCase();
      setFacilityCode(normalizedCode);
    }
  }, [initialFacilityCode]);

  const handleParkingSpotChange = (index: number, value: string) => {
    const newSpots = [...parkingSpots];
    newSpots[index] = value;
    setParkingSpots(newSpots);
  };

  const handleCreateNewFacilityToggle = (value: boolean) => {
    setCreateNewFacility(value);
    if (value) {
      // Switch aktiviert: Zufälligen Code generieren
      // Validierung erfolgt erst beim Registrieren (da User noch nicht eingeloggt ist)
      const {generateFacilityCode} = require('../utils/facilityCodeGenerator');
      setFacilityCode(generateFacilityCode());
    } else {
      // Switch deaktiviert: Code löschen
      setFacilityCode('');
    }
  };

  const validateForm = (): boolean => {
    if (!username.trim()) {
      showAlert('Fehler', 'Bitte gib einen Benutzernamen ein');
      return false;
    }

    if (!facilityCode.trim()) {
      showAlert('Fehler', 'Bitte gib einen Parkanlagen-Code ein');
      return false;
    }

    if (!email.trim() || !email.includes('@')) {
      showAlert('Fehler', 'Bitte gib eine gültige E-Mail-Adresse ein');
      return false;
    }

    if (!password || password.length < 6) {
      showAlert('Fehler', 'Das Passwort muss mindestens 6 Zeichen lang sein');
      return false;
    }

    if (password !== confirmPassword) {
      showAlert('Fehler', 'Die Passwörter stimmen nicht überein');
      return false;
    }

    return true;
  };

  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    if (createNewFacility && !facilityName.trim()) {
      showAlert('Fehler', 'Bitte gib einen Namen für die Parkanlage ein');
      return;
    }

    setLoading(true);
    try {
      const validSpots = parkingSpots.filter((spot) => spot.trim() !== '');
      
      // Die Validierung und Code-Generierung erfolgt jetzt in AuthService.register()
      // nach dem Login, daher können wir den Code direkt übergeben
      await AuthService.register(
        email.trim(),
        password,
        username.trim(),
        phone.trim() || '', // Allow empty phone
        validSpots, // Allow empty array
        facilityCode.trim().toUpperCase(), // Normalize facility code
        createNewFacility,
        facilityName.trim() || undefined,
      );
      const successMessage = createNewFacility
        ? 'Registrierung erfolgreich! Du bist jetzt Administrator dieser Parkanlage.'
        : 'Registrierung erfolgreich!';
      showAlert('Erfolg', successMessage, onRegisterSuccess);
    } catch (error: any) {
      let errorMessage = 'Registrierung fehlgeschlagen';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Diese E-Mail-Adresse ist bereits registriert';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Ungültige E-Mail-Adresse';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Das Passwort ist zu schwach';
      } else if (error.code === 'auth/invalid-facility-code') {
        errorMessage = 'Ungültiger Parkanlagen-Code. Bitte überprüfe den Code oder kontaktiere den Administrator.';
      } else if (error.code === 'auth/facility-already-exists') {
        errorMessage = 'Dieser Parkanlagen-Code existiert bereits. Bitte deaktiviere und aktiviere den Toggle erneut, um einen neuen Code zu generieren.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      showAlert('Fehler', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScreen contentContainerStyle={[styles.container, {paddingTop: Math.max(insets.top, 20), backgroundColor: colors.screenBg}]}>
      <Image source={require('../AppIcon.png')} style={styles.icon} />
      <Text style={[styles.title, {color: colors.text}]}>Registrierung</Text>
      <Text style={[styles.subtitle, {color: colors.subtext}]}>
        Erstelle ein Konto für die Parkplatz-Sharing App
      </Text>

      <Text style={[styles.label, {color: colors.text}]}>Benutzername *</Text>
      <TextInput
        style={[styles.input, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text}]}
        placeholder="Dein Benutzername"
        placeholderTextColor={colors.subtext}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        editable={!loading}
      />
      <Text style={[styles.hint, {color: colors.subtext}]}>Andere Nutzer:innen sehen Dich unter diesem Namen</Text>

      <Text style={[styles.label, {color: colors.text}]}>E-Mail *</Text>
      <TextInput
        style={[styles.input, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text}]}
        placeholder="deine@email.de"
        placeholderTextColor={colors.subtext}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
        editable={!loading}
      />
      <View style={{height: 24}} />

      <View style={[styles.facilityContainer, {backgroundColor: colors.surface2, borderColor: colors.border}]}>
        <View style={styles.facilitySection}>
          <View style={styles.switchRow}>
            <Text style={[styles.facilityLabel, {color: colors.text}]}>Neuen Parkanlagen-Code erstellen</Text>
            <Switch
              value={createNewFacility}
              onValueChange={handleCreateNewFacilityToggle}
              trackColor={{false: colors.border, true: colors.brand}}
              thumbColor={createNewFacility ? '#fff' : colors.subtext}
              disabled={loading}
            />
          </View>
          <Text style={[styles.hint, {color: colors.subtext}]}>
            {createNewFacility
              ? 'Du wirst als Administrator dieser neuen Parkanlage registriert.'
              : 'Aktiviere dies, um eine neue Parkanlage zu erstellen. Du wirst automatisch Administrator.\nWenn du einer bestehenden Gruppe beitreten willst, gib den Code hier ein.'}
          </Text>
        </View>

        <Text style={[styles.label, {color: colors.text}]}>Parkanlagen-Code *</Text>
        <TextInput
          style={[
            styles.input,
            {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text},
            createNewFacility && styles.inputReadOnly,
          ]}
          placeholder="z.B. PARK01"
          placeholderTextColor={colors.subtext}
          value={facilityCode}
          onChangeText={(text) => setFacilityCode(text.toUpperCase())}
          autoCapitalize="characters"
          editable={!createNewFacility && !loading}
        />
        <Text style={[styles.hint, {color: colors.subtext}]}>
          {createNewFacility
            ? 'Dieser Code wurde automatisch generiert und ist garantiert verfügbar.'
            : 'Dieser Code ordnet Dich einer Parkanlage zu. Der Code muss in der Datenbank vorhanden sein.'}
        </Text>

        {createNewFacility && (
          <>
            <Text style={[styles.label, {color: colors.text}]}>Name der Parkanlage *</Text>
            <TextInput
              style={[styles.input, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text}]}
              placeholder="z.B. Parkhaus Zentrum"
              placeholderTextColor={colors.subtext}
              value={facilityName}
              onChangeText={setFacilityName}
              editable={!loading}
            />
            <Text style={[styles.hint, {color: colors.subtext}]}>Dieser Name wird anderen Nutzern angezeigt</Text>
          </>
        )}
      </View>

      <Text style={[styles.label, {color: colors.text}]}>Telefon (optional)</Text>
      <TextInput
        style={[styles.input, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text}]}
        placeholder="+49 123 456789 (optional)"
        placeholderTextColor={colors.subtext}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        editable={!loading}
      />

      {Platform.OS === 'web' ? (
        <form onSubmit={(e) => { e.preventDefault(); handleRegister(); }} style={{width: '100%', maxWidth: 400}}>
          <Text style={[styles.label, {color: colors.text}]}>Passwort *</Text>
          <View style={[styles.passwordRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <TextInput
              style={[styles.passwordInput, {color: colors.text}]}
              placeholder="Mindestens 6 Zeichen"
              placeholderTextColor={colors.subtext}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!loading}
              autoComplete="new-password"
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeButton}
              accessibilityLabel={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}>
              <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, {color: colors.text}]}>Passwort bestätigen *</Text>
          <View style={[styles.passwordRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <TextInput
              style={[styles.passwordInput, {color: colors.text}]}
              placeholder="Passwort wiederholen"
              placeholderTextColor={colors.subtext}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              editable={!loading}
              autoComplete="new-password"
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword((v) => !v)}
              style={styles.eyeButton}
              accessibilityLabel={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}>
              <MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.subtext} />
            </TouchableOpacity>
          </View>
        </form>
      ) : (
        <>
          <Text style={[styles.label, {color: colors.text}]}>Passwort *</Text>
          <View style={[styles.passwordRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <TextInput
              style={[styles.passwordInput, {color: colors.text}]}
              placeholder="Mindestens 6 Zeichen"
              placeholderTextColor={colors.subtext}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeButton}
              accessibilityLabel={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}>
              <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.subtext} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, {color: colors.text}]}>Passwort bestätigen *</Text>
          <View style={[styles.passwordRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <TextInput
              style={[styles.passwordInput, {color: colors.text}]}
              placeholder="Passwort wiederholen"
              placeholderTextColor={colors.subtext}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
              editable={!loading}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword((v) => !v)}
              style={styles.eyeButton}
              accessibilityLabel={showConfirmPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}>
              <MaterialCommunityIcons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.subtext} />
            </TouchableOpacity>
          </View>
        </>
      )}

      <Text style={[styles.label, {color: colors.text}]}>Parkplatz-Nummer(n) (optional, bis zu 3)</Text>
      {[0, 1, 2].map((index) => (
        <TextInput
          key={index}
          style={[styles.input, index > 0 && styles.parkingSpotInputSpacing, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text}]}
          placeholder={`Parkplatz ${index + 1} (optional)`}
          placeholderTextColor={colors.subtext}
          value={parkingSpots[index]}
          onChangeText={(value) => handleParkingSpotChange(index, value)}
          editable={!loading}
        />
      ))}

      <TouchableOpacity
        style={[styles.button, {backgroundColor: colors.brand}, loading && styles.buttonDisabled]}
        onPress={handleRegister}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Registrieren</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={onBackToLogin}
        disabled={loading}>
        <Text style={[styles.linkText, {color: colors.brand}]}>Bereits ein Konto? Hier anmelden</Text>
      </TouchableOpacity>
    </KeyboardAwareScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    alignItems: 'center',
  },
  icon: {
    width: 80,
    height: 80,
    marginBottom: 32,
    borderRadius: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 32,
    textAlign: 'center',
  },
  form: {width: '100%', maxWidth: 400},
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 16,
    width: '100%',
    maxWidth: 400,
  },
  input: {
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    borderWidth: 1,
    borderRadius: 8,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    paddingRight: 8,
    fontSize: 16,
  },
  eyeButton: {
    padding: 8,
  },
  parkingSpotInputSpacing: {
    marginTop: 12,
  },
  hint: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 8,
    width: '100%',
    maxWidth: 400,
    textAlign: 'left',
  },
  facilityContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  facilitySection: {
    width: '100%',
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  facilityLabel: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 12,
  },
  inputReadOnly: {
    opacity: 0.7,
  },
  button: {
    width: '100%',
    maxWidth: 400,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  linkButton: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
  },
});

export default RegisterScreen;

