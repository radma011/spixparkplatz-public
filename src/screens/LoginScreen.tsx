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
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import {showAlert} from '../utils/alertUtils';
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
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert('Fehler', 'Bitte gib E-Mail und Passwort ein');
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
      showAlert('Fehler', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScreen contentContainerStyle={[styles.container, {paddingTop: Math.max(insets.top, 20), backgroundColor: colors.screenBg}]}>
      <Image source={require('../AppIcon.png')} style={styles.icon} />
      <Text style={[styles.title, {color: colors.text}]}>Anmelden</Text>
      <Text style={[styles.subtitle, {color: colors.subtext}]}>Melde dich an, um Parkplätze zu teilen</Text>

      {Platform.OS === 'web' ? (
        <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} style={{width: '100%', maxWidth: 400}}>
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
            autoComplete="email"
          />

          <Text style={[styles.label, {color: colors.text}]}>Passwort</Text>
          <View style={[styles.passwordRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <TextInput
              style={[styles.passwordInput, {color: colors.text}]}
              placeholder="Dein Passwort"
              placeholderTextColor={colors.subtext}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              editable={!loading}
              autoComplete="current-password"
            />
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeButton}
              accessibilityLabel={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}>
              <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={22} color={colors.subtext} />
            </TouchableOpacity>
          </View>

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
        </form>
      ) : (
        <>
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
          <View style={[styles.passwordRow, {backgroundColor: colors.surface, borderColor: colors.border}]}>
            <TextInput
              style={[styles.passwordInput, {color: colors.text}]}
              placeholder="Dein Passwort"
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
        </>
      )}

      <TouchableOpacity
        style={styles.linkButton}
        onPress={onNavigateToRegister}
        disabled={loading}>
        <Text style={[styles.linkText, {color: colors.brand}]}>Noch kein Konto? Hier registrieren</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => {
          setResetEmail(email);
          setShowResetPasswordModal(true);
        }}
        disabled={loading}>
        <Text style={[styles.linkText, {color: colors.brand}]}>Passwort vergessen?</Text>
      </TouchableOpacity>

      <Modal
        visible={showResetPasswordModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowResetPasswordModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}>
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, {backgroundColor: colors.surface}]}>
              <Text style={[styles.modalTitle, {color: colors.text}]}>Passwort zurücksetzen</Text>
              <Text style={[styles.modalSubtitle, {color: colors.subtext}]}>
                Gib deine E-Mail-Adresse ein:
              </Text>
              <TextInput
                style={[styles.modalInput, {backgroundColor: colors.surface2, borderColor: colors.border, color: colors.text}]}
                placeholder="deine@email.de"
                placeholderTextColor={colors.subtext}
                value={resetEmail}
                onChangeText={setResetEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
                editable={!loading}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalCancelButton, {backgroundColor: colors.surface2, borderColor: colors.border}]}
                  onPress={() => {
                    setShowResetPasswordModal(false);
                    setResetEmail('');
                  }}
                  disabled={loading}>
                  <Text style={[styles.modalButtonText, {color: colors.subtext}]}>Abbrechen</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSendButton, {backgroundColor: colors.brand}, loading && styles.modalButtonDisabled]}
                  onPress={async () => {
                    if (resetEmail && resetEmail.includes('@')) {
                      setLoading(true);
                      try {
                        await AuthService.resetPassword(resetEmail);
                        showAlert(
                          'E-Mail gesendet',
                          'Eine E-Mail zum Zurücksetzen des Passworts wurde gesendet.',
                          () => {
                            setShowResetPasswordModal(false);
                            setResetEmail('');
                          },
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
                    } else {
                      showAlert('Fehler', 'Bitte gib eine gültige E-Mail-Adresse ein');
                    }
                  }}
                  disabled={loading}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalSendButtonText}>Senden</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
  },
  modalInput: {
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  modalSendButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonDisabled: {
    opacity: 0.6,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalSendButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default LoginScreen;

