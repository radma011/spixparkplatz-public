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
import PushNotificationService from './src/services/PushNotificationService';
import {logRematchResult} from './src/utils/logRematchResult';

function App(): React.JSX.Element {
  const isDarkMode = useColorScheme() === 'dark';
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [externalFocus, setExternalFocus] = useState<
    {requestId: string; tab?: 'active' | 'fulfilled'; offerId?: string} | undefined
  >(undefined);
  const [initialFacilityCode, setInitialFacilityCode] = useState<string | undefined>(undefined);

  useEffect(() => {
    // Auth State Listener – only this sets loading=false, so we never show Login before auth is ready
    const unsubscribe = AuthService.onAuthStateChanged((userData) => {
      console.log('[App] Auth state changed callback:', userData ? `User: ${userData.uid}` : 'User: null (logged out)');
      setUser(userData);
      setLoading(false);
    });

    // Deep links only on native (not on web)
    if (Platform.OS === 'web') {
      return () => unsubscribe();
    }

    // Handle deep links on app start (native only) – do NOT setLoading(false) here
    const handleDeepLink = (url: string | null) => {
      if (!url) return;
      
      console.log('Deep link received:', url);
      
      if (!url.startsWith('parkplatz://')) {
        return;
      }
      
      let code: string | null = null;
      
      try {
        const parsedUrl = new URL(url) as any;
        const host = parsedUrl.host || '';
        const pathname = parsedUrl.pathname || '';
        if (host === 'register' || pathname === '/register') {
          code = parsedUrl.searchParams?.get('code') || null;
        }
      } catch (e) {
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
        console.log('Extracted facility code:', normalizedCode);
        setInitialFacilityCode(normalizedCode);
      }
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url) {
          console.log('Initial URL:', url);
          handleDeepLink(url);
        }
      })
      .catch((err) => {
        console.error('Error getting initial URL:', err);
      });

    const subscription = Linking.addEventListener('url', (event) => {
      console.log('Deep link event:', event.url);
      handleDeepLink(event.url);
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

  // Web dev: ?rematch=dry | ?diagnose=jFqhKg0gG1yUS3Wk4X7c&spot=2082
  useEffect(() => {
    if (Platform.OS !== 'web' || !user || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const diagnoseId = params.get('diagnose');
    if (diagnoseId) {
      const spot = params.get('spot') || undefined;
      (async () => {
        try {
          const payload = await PushNotificationService.diagnoseParkingMatch({
            requestId: diagnoseId,
            spotId: spot,
          });
          const lines =
            (payload as {lines?: string[]})?.lines ??
            (payload as {result?: {lines?: string[]}})?.result?.lines ??
            [];
          console.log(`[diagnose] ${diagnoseId}${spot ? ` spot ${spot}` : ''} (${lines.length} Zeilen)`);
          if (lines.length === 0) {
            console.log('[diagnose] (keine Zeilen – Rohantwort:)', payload);
          }
          for (const line of lines) {
            console.log(`[diagnose] ${line}`);
          }
        } catch (e) {
          console.error('[diagnose] failed:', e);
        } finally {
          window.history.replaceState({}, '', window.location.pathname);
        }
      })();
      return;
    }

    const mode = params.get('rematch');
    if (!mode) return;

    let cancelled = false;
    (async () => {
      try {
        if (mode === 'dry' || mode === 'all') {
          const dry = await PushNotificationService.runRematchFacilityNow({dryRun: true});
          logRematchResult('Dry Run', dry);
        }
        if (cancelled) return;
        if (mode === 'live' || mode === 'all') {
          const live = await PushNotificationService.runRematchFacilityNow();
          logRematchResult('Live', live);
        }
      } catch (e) {
        console.error('[rematch] failed:', e);
      } finally {
        window.history.replaceState({}, '', window.location.pathname);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

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

