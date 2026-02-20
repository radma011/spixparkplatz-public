/**
 * Parkplatz-Sharing App
 * React Native Version
 */

import React, {useEffect, useState} from 'react';
import {StatusBar, StyleSheet, useColorScheme, ActivityIndicator, View, Linking, Platform} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {getApp} from '@react-native-firebase/app';
import {getMessaging, getInitialNotification, onNotificationOpenedApp} from '@react-native-firebase/messaging';
import AuthScreen from './src/screens/AuthScreen';
import ParkingRequestsScreen from './src/screens/ParkingRequestsScreen';
import AuthService, {UserData} from './src/services/AuthService';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [externalFocus, setExternalFocus] = useState<
    {requestId: string; tab?: 'active' | 'fulfilled'; offerId?: string} | undefined
  >(undefined);
  const [initialFacilityCode, setInitialFacilityCode] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Deep links only work on native platforms, not on web
    if (Platform.OS === 'web') {
      setLoading(false);
      return;
    }

    // Handle deep links on app start
    const handleDeepLink = (url: string | null) => {
      if (!url) return;
      
      console.log('Deep link received:', url);
      
      // Only handle parkplatz:// URLs, ignore http/https URLs
      if (!url.startsWith('parkplatz://')) {
        return;
      }
      
      // Parse parkplatz://register?code=XXX
      // Try multiple parsing methods for robustness
      let code: string | null = null;
      
      try {
        // Method 1: Standard URL parsing
        const parsedUrl = new URL(url) as any;
        const host = parsedUrl.host || '';
        const pathname = parsedUrl.pathname || '';
        if (host === 'register' || pathname === '/register') {
          code = parsedUrl.searchParams?.get('code') || null;
        }
      } catch (e) {
        // Method 2: Simple regex for parkplatz://register?code=XXX
        const match = url.match(/parkplatz:\/\/register\?code=([^&]+)/i);
        if (match && match[1]) {
          code = match[1];
        } else {
          // Method 3: Try without host/path
          const match2 = url.match(/parkplatz:\/\/[^?]*\?code=([^&]+)/i);
          if (match2 && match2[1]) {
            code = match2[1];
          }
        }
      }
      
      if (code) {
        const normalizedCode = code.trim().toUpperCase();
        console.log('Extracted facility code:', normalizedCode);
        setInitialFacilityCode(normalizedCode);
      }
    };

    // Check if app was opened via deep link
    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          console.log('Initial URL:', url);
          handleDeepLink(url);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error getting initial URL:', err);
        setLoading(false);
      });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      console.log('Deep link event:', event.url);
      handleDeepLink(event.url);
      // If user is logged in, we might want to log them out or show a message
      // For now, we'll just set the code (user would need to log out to register)
    });

    // Auth State Listener einrichten
    const unsubscribe = AuthService.onAuthStateChanged((userData) => {
      console.log('[App] Auth state changed callback:', userData ? `User: ${userData.uid}` : 'User: null (logged out)');
      setUser(userData);
      setLoading(false);
    });

    return () => {
      unsubscribe();
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const messaging = getMessaging(getApp());

    const handle = (msg: any) => {
      const data = msg?.data ?? {};
      const requestId = data?.requestId ? String(data.requestId) : null;
      if (!requestId) return;
      const offerId = data?.offerId ? String(data.offerId) : undefined;
      const type = data?.type ? String(data.type) : '';
      const tab: 'active' | 'fulfilled' =
        type === 'request_archived' ? 'fulfilled' : 'active';
      setExternalFocus({requestId, offerId, tab});
    };

    // Cold start from notification
    getInitialNotification(messaging)
      .then((msg) => {
        if (msg) handle(msg);
      })
      .catch(() => {});

    // Background -> open
    const unsub = onNotificationOpenedApp(messaging, handle);
    return () => unsub();
  }, []);

  const handleAuthSuccess = async () => {
    const userData = await AuthService.getCurrentUser();
    setUser(userData);
  };

  if (loading) {
    return (
      <SafeAreaProvider>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      {user ? (
        <ParkingRequestsScreen currentUserId={user.uid} userData={user} externalFocus={externalFocus} />
      ) : (
        <AuthScreen onAuthSuccess={handleAuthSuccess} initialFacilityCode={initialFacilityCode} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});

export default App;

