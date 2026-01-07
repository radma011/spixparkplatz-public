import React, {useState, useEffect} from 'react';
import {View, StyleSheet, Linking} from 'react-native';
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';

interface Props {
  onAuthSuccess: () => void;
  initialFacilityCode?: string;
}

const AuthScreen: React.FC<Props> = ({onAuthSuccess, initialFacilityCode}) => {
  const [showRegister, setShowRegister] = useState(!!initialFacilityCode);
  const [facilityCode, setFacilityCode] = useState(initialFacilityCode || '');

  useEffect(() => {
    // Update facility code when initialFacilityCode prop changes
    if (initialFacilityCode) {
      setFacilityCode(initialFacilityCode);
      setShowRegister(true);
    }
  }, [initialFacilityCode]);

  useEffect(() => {
    // Handle deep links when app is already running (for when user is not logged in)
    const handleDeepLink = (url: string | null) => {
      if (!url) return;
      
      console.log('AuthScreen: Deep link received:', url);
      
      // Parse parkplatz://register?code=XXX
      let code: string | null = null;
      
      try {
        const parsedUrl = new URL(url);
        if (parsedUrl.host === 'register' || parsedUrl.pathname === '/register') {
          code = parsedUrl.searchParams.get('code');
        }
      } catch (e) {
        // Fallback: regex parsing
        const match = url.match(/parkplatz:\/\/register\?code=([^&]+)/i);
        if (match && match[1]) {
          code = match[1];
        } else {
          const match2 = url.match(/parkplatz:\/\/[^?]*\?code=([^&]+)/i);
          if (match2 && match2[1]) {
            code = match2[1];
          }
        }
      }
      
      if (code) {
        const normalizedCode = code.trim().toUpperCase();
        console.log('AuthScreen: Extracted facility code:', normalizedCode);
        setFacilityCode(normalizedCode);
        setShowRegister(true);
      }
    };

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.container}>
      {showRegister ? (
        <RegisterScreen
          onRegisterSuccess={onAuthSuccess}
          onBackToLogin={() => setShowRegister(false)}
          initialFacilityCode={facilityCode}
        />
      ) : (
        <LoginScreen
          onLoginSuccess={onAuthSuccess}
          onNavigateToRegister={() => setShowRegister(true)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});

export default AuthScreen;

