import {getApp} from '@react-native-firebase/app';
import {getAuth, getIdToken} from '@react-native-firebase/auth';
import {
  AuthorizationStatus,
  getMessaging,
  getToken,
  onTokenRefresh,
  registerDeviceForRemoteMessages,
  requestPermission,
  subscribeToTopic,
} from '@react-native-firebase/messaging';
import {Platform} from 'react-native';
import FirestoreService from './FirestoreService';

class PushNotificationService {
  private messaging = getMessaging(getApp());
  private auth = getAuth(getApp());
  private lastToken: string | null = null;

  private async callCallableHttp(functionName: string, data: any): Promise<any> {
    const user = this.auth.currentUser;
    if (!user) {
      const err: any = new Error('Login required');
      err.code = 'unauthenticated';
      throw err;
    }

    const token = await getIdToken(user, true);
    const projectId = getApp().options.projectId;
    if (!projectId) {
      throw new Error('Missing Firebase projectId (getApp().options.projectId)');
    }

    // Keep in sync with Cloud Functions region (we run everything in europe-west3).
    const region = 'europe-west3';
    const url = `https://${region}-${projectId}.cloudfunctions.net/${functionName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({data}),
    });

    const text = await res.text().catch(() => '');
    const json: any = (() => {
      try {
        return text ? JSON.parse(text) : {};
      } catch {
        return {};
      }
    })();
    if (!res.ok) {
      const msg =
        json?.error?.message ||
        json?.message ||
        (text ? `${text}`.slice(0, 200) : null) ||
        `HTTP ${res.status}`;
      const err: any = new Error(msg);
      err.code = json?.error?.status || 'functions/http-error';
      err.details = json?.error?.details;
      (err as any).status = res.status;
      throw err;
    }

    // Firebase callable responses typically return { result: ... }
    return json?.result ?? json;
  }

  // FCM Token initialisieren und speichern
  async initializeToken(userId: string): Promise<string | null> {
    try {
      // Push-Notifications werden auf macOS und Web nicht unterstützt
      if (Platform.OS === 'macos' || Platform.OS === 'web') {
        console.log(`Push-Notifications werden auf ${Platform.OS} nicht unterstützt`);
        return null;
      }

      // Berechtigung anfordern (muss zuerst erfolgen)
      const authStatus = await requestPermission(this.messaging);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      if (!enabled) {
        console.log('Push-Berechtigung nicht erteilt');
        return null;
      }

      // Für iOS: Gerät für Remote Messages registrieren (falls Methode existiert)
      if (Platform.OS === 'ios') {
        try {
          await registerDeviceForRemoteMessages(this.messaging);
        } catch (registerError: any) {
          const msg = String(registerError?.message ?? registerError ?? '');
          // If the app isn't signed with a Push-enabled provisioning profile / entitlement,
          // iOS will refuse registration. Retrying token fetch won't help and just spams logs.
          if (msg.includes('aps-environment')) {
            console.log(
              'APNs Registrierung fehlgeschlagen (aps-environment fehlt) – Push Tokens werden übersprungen.',
            );
            return null;
          }
          // Wenn die Registrierung fehlschlägt (z.B. im Simulator oder ohne Capability), 
          // versuchen wir trotzdem, den Token abzurufen
          console.log('Registrierung für Remote Messages fehlgeschlagen:', registerError.message);
          // Nicht abbrechen, sondern weitermachen
        }
      }

      // Kurz warten, damit die native Registrierung abgeschlossen ist
      await new Promise(resolve => setTimeout(resolve, 500));

      // Token abrufen (mit Retry-Logik)
      let token: string | null = null;
      let retries = 3;
      
      while (retries > 0 && !token) {
        try {
          token = await getToken(this.messaging);
          if (token) {
            await FirestoreService.saveFCMToken(userId, token, {platform: Platform.OS});
            console.log('FCM Token gespeichert:', token);
            this.lastToken = token;
            // Subscribe each installation to global topic for broadcasts
            try {
              await subscribeToTopic(this.messaging, 'all');
            } catch (e: any) {
              console.log('Topic subscribe failed:', e?.message ?? e);
            }
            break;
          }
        } catch (tokenError: any) {
          if (tokenError?.code === 'messaging/unregistered') {
            // Wenn noch nicht registriert, kurz warten und erneut versuchen
            console.log(`Token-Abruf fehlgeschlagen (${retries} Versuche übrig), warte...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            retries--;
            if (retries === 0) {
              console.log('Token konnte nicht abgerufen werden - Gerät möglicherweise nicht für Remote Messages registriert');
              return null;
            }
          } else {
            throw tokenError;
          }
        }
      }

      // Token Updates abonnieren
      onTokenRefresh(this.messaging, async (newToken) => {
        await FirestoreService.saveFCMToken(userId, newToken, {platform: Platform.OS});
        if (this.lastToken && this.lastToken !== newToken) {
          // Best-effort cleanup of previous token for this installation
          await FirestoreService.deleteFCMToken(userId, this.lastToken);
        }
        this.lastToken = newToken;
        console.log('Neuer FCM Token gespeichert:', newToken);
      });

      return token;
    } catch (error: any) {
      // Wenn der Fehler mit "unregistered", "aps-environment" oder "notifications are not allowed" zu tun hat
      const errorMessage = String(error?.message ?? '');
      const errorCode = String(error?.code ?? '');
      
      if (errorCode === 'messaging/unregistered' || 
          errorMessage.includes('aps-environment') ||
          errorMessage.includes('unregistered') ||
          errorMessage.includes('Notifications are not allowed') ||
          errorMessage.includes('notifications are not allowed')) {
        console.log('Push-Notifications nicht verfügbar:', errorMessage || errorCode);
        return null;
      }
      console.error('Fehler beim Initialisieren des FCM Tokens:', error);
      return null;
    }
  }

  /**
   * Beim Logout den FCM-Token dieses Geräts für den User in Firestore löschen,
   * damit das Gerät keine Push-Nachrichten mehr erhält.
   */
  async removeTokenForLogout(userId: string): Promise<void> {
    try {
      if (this.lastToken) {
        await FirestoreService.deleteFCMToken(userId, this.lastToken);
        console.log('FCM Token beim Logout entfernt');
      }
      this.lastToken = null;
    } catch (e: any) {
      console.warn('FCM Token konnte beim Logout nicht entfernt werden:', e?.message ?? e);
    }
  }

  // Push-Benachrichtigung an alle User senden
  async sendPushToAll(
    title: string,
    body: string,
    data?: Record<string, string>,
    excludeUserId?: string,
    facilityCode?: string,
  ): Promise<void> {
    const payload: any = {
      notification: {title, body},
      data: data ?? {},
    };
    // Never send nulls via callable payload (native bridge can choke on NSNull->NSString)
    if (excludeUserId) {
      payload.excludeUserId = excludeUserId;
    }
    if (facilityCode) {
      payload.facilityCode = facilityCode;
    }
    await this.callCallableHttp('sendPushToAllHttp', payload);
  }

  // Push-Benachrichtigung an einen User senden
  async sendPushToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): Promise<void> {
    await this.callCallableHttp('sendPushToUserHttp', {
      uid: userId,
      notification: {title, body},
      data: data ?? {},
    });
  }

  /**
   * Debug helper: triggers the backend scheduled maintenance immediately and returns stats.
   * Use dryRun=true to avoid actually sending pushes.
   */
  async runMaintenanceNow(opts?: {dryRun?: boolean; nowMs?: number}): Promise<any> {
    return await this.callCallableHttp('runMaintenanceNowHttp', {
      dryRun: opts?.dryRun === true,
      ...(typeof opts?.nowMs === 'number' ? {nowMs: opts.nowMs} : {}),
    });
  }
}

export default new PushNotificationService();

