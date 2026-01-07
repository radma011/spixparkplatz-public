import React, {useState} from 'react';
import {
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  View,
  useColorScheme,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import AuthService from '../services/AuthService';
import KeyboardAwareScreen from '../components/KeyboardAwareScreen';
import {getColors} from '../theme/colors';

interface Props {
  onLoginSuccess: () => void;
  onNavigateToRegister: () => void;
}

const LoginScreen: React.FC<Props> = ({onLoginSuccess, onNavigateToRegister}) => {
  const insets = useSafeAreaInsets();
  const colors = getColors(useColorScheme());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Fehler', 'Bitte gib E-Mail und Passwort ein');
      return;
    }

    setLoading(true);
    try {
      await AuthService.login(email.trim(), password);
      onLoginSuccess();
    } catch (error: any) {
      let errorMessage = 'Login fehlgeschlagen';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'Kein Konto mit dieser E-Mail gefunden';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Falsches Passwort';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Ungültige E-Mail-Adresse';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = 'Ungültige Anmeldedaten';
      }
      Alert.alert('Fehler', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScreen contentContainerStyle={[styles.container, {paddingTop: Math.max(insets.top, 20), backgroundColor: colors.screenBg}]}>
      <Image source={require('../AppIcon.png')} style={styles.icon} />
      <Text style={[styles.title, {color: colors.text}]}>Anmelden</Text>
      <Text style={[styles.subtitle, {color: colors.subtext}]}>Melde dich an, um Parkplätze zu teilen</Text>

      <Text style={[styles.label, {color: colors.text}]}>E-Mail</Text>
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

      <Text style={[styles.label, {color: colors.text}]}>Passwort</Text>
      <TextInput
        style={[styles.input, {backgroundColor: colors.surface, borderColor: colors.border, color: colors.text}]}
        placeholder="Dein Passwort"
        placeholderTextColor={colors.subtext}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, {backgroundColor: colors.brand}, loading && styles.buttonDisabled]}
        onPress={handleLogin}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Anmelden</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={onNavigateToRegister}
        disabled={loading}>
        <Text style={[styles.linkText, {color: colors.brand}]}>Noch kein Konto? Hier registrieren</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => {
          Alert.prompt(
            'Passwort zurücksetzen',
            'Gib deine E-Mail-Adresse ein:',
            [
              {text: 'Abbrechen', style: 'cancel'},
              {
                text: 'Senden',
                onPress: async (email?: string) => {
                  if (email && email.includes('@')) {
                    try {
                      await AuthService.resetPassword(email);
                      Alert.alert(
                        'E-Mail gesendet',
                        'Eine E-Mail zum Zurücksetzen des Passworts wurde gesendet.',
                      );
                    } catch (error: any) {
                      let errorMessage = 'Passwort konnte nicht zurückgesetzt werden';
                      if (error.code === 'auth/user-not-found') {
                        errorMessage = 'Kein Konto mit dieser E-Mail gefunden';
                      } else if (error.code === 'auth/invalid-email') {
                        errorMessage = 'Ungültige E-Mail-Adresse';
                      }
                      Alert.alert('Fehler', errorMessage);
                    }
                  }
                },
              },
            ],
            'plain-text',
            email,
          );
        }}
        disabled={loading}>
        <Text style={[styles.linkText, {color: colors.brand}]}>Passwort vergessen?</Text>
      </TouchableOpacity>
    </KeyboardAwareScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
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

export default LoginScreen;

