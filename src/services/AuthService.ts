import {getApp} from '@react-native-firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  getIdToken,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  verifyBeforeUpdateEmail,
} from '@react-native-firebase/auth';
import FirestoreService from './FirestoreService';

export interface UserData {
  uid: string;
  username: string;
  email: string;
  phone: string;
  parkingSpots: string[]; // Array von Parkplatz-Nummern (bis zu 3)
  facilityCode: string; // Code der Parkanlage, der dem User zugeordnet ist
  createdAt: Date;
}

function logFirebaseAuthError(context: string, error: any) {
  const safeStringify = (value: any) => {
    try {
      const seen = new WeakSet();
      return JSON.stringify(
        value,
        (_key, val) => {
          if (typeof val === 'object' && val !== null) {
            if (seen.has(val)) {
              return '[Circular]';
            }
            seen.add(val);
          }
          if (typeof val === 'function') {
            return `[Function ${val.name || 'anonymous'}]`;
          }
          return val;
        },
        2,
      );
    } catch (e) {
      return `<<unstringifiable: ${String(e)}>>`;
    }
  };

  // RNFB errors often contain useful native fields; log them explicitly.
  const details = {
    code: error?.code,
    message: error?.message,
    nativeErrorCode: error?.nativeErrorCode,
    nativeErrorMessage: error?.nativeErrorMessage,
    userInfo: error?.userInfo,
    // Extra fields that are often useful on iOS:
    stack: error?.stack,
    name: error?.name,
    errorKeys: error ? Object.keys(error) : [],
    toString: error ? String(error) : null,
  };
  console.error(context, details);
  // Ensure the deeply nested userInfo is actually visible (Metro console often collapses objects)
  console.error(`${context} (details json):\n${safeStringify(details)}`);
}

class AuthService {
  private auth = getAuth(getApp());

  // Registrierung mit Email und Passwort
  async register(
    email: string,
    password: string,
    username: string,
    phone: string,
    parkingSpots: string[],
    facilityCode: string,
    createNewFacility?: boolean,
    facilityName?: string,
  ): Promise<UserData> {
    try {
      const normalizedCode = facilityCode.trim().toUpperCase();
      
      // WICHTIG: Zuerst Firebase Auth User erstellen, damit wir authentifiziert sind
      // für Firestore-Operationen
      const userCredential = await createUserWithEmailAndPassword(
        this.auth,
        email,
        password,
      );

      const user = userCredential.user;
      
      // Jetzt können wir Firestore-Operationen durchführen (User ist authentifiziert)
      let finalCode = normalizedCode;
      
      if (createNewFacility) {
        // Neues Facility erstellen - prüfen ob Code bereits existiert und ggf. neu generieren
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
          const codeExists = await FirestoreService.validateFacilityCode(finalCode);
          if (!codeExists) {
            break; // Code ist verfügbar
          }
          // Code existiert bereits, neuen generieren
          const {generateFacilityCode} = require('../utils/facilityCodeGenerator');
          finalCode = generateFacilityCode();
          attempts++;
        }
        
        if (attempts >= maxAttempts) {
          // User löschen, da Registrierung fehlgeschlagen ist
          await deleteUser(user);
          const error: any = new Error('Konnte keinen verfügbaren Code generieren');
          error.code = 'auth/facility-code-generation-failed';
          throw error;
        }
        
        // Facility mit dem finalen Code erstellen
        try {
          await FirestoreService.createFacility(finalCode, facilityName);
        } catch (error: any) {
          // User löschen, da Registrierung fehlgeschlagen ist
          await deleteUser(user);
          if (error.message?.includes('existiert bereits')) {
            const err: any = new Error('Facility-Code existiert bereits');
            err.code = 'auth/facility-already-exists';
            throw err;
          }
          throw error;
        }
      } else {
        // Bestehendes Facility validieren
        const isValidFacility = await FirestoreService.validateFacilityCode(finalCode);
        if (!isValidFacility) {
          // User löschen, da Registrierung fehlgeschlagen ist
          await deleteUser(user);
          const error: any = new Error('Ungültiger Parkanlagen-Code');
          error.code = 'auth/invalid-facility-code';
          throw error;
        }
      }

      // User-Daten in Firestore speichern
      const userData: UserData = {
        uid: user.uid,
        username,
        email,
        phone,
        parkingSpots: parkingSpots.filter((spot) => spot.trim() !== ''), // Leere entfernen
        facilityCode: finalCode, // Verwende den finalen Code (kann sich geändert haben)
        createdAt: new Date(),
      };

      // Wenn neues Facility erstellt wurde, User als Admin markieren
      await FirestoreService.saveUserData(userData, createNewFacility === true);

      return userData;
    } catch (error: any) {
      logFirebaseAuthError('Registrierungsfehler (Firebase Auth):', error);
      throw error;
    }
  }

  // Login mit Email und Passwort
  async login(email: string, password: string): Promise<UserData> {
    try {
      const userCredential = await signInWithEmailAndPassword(
        this.auth,
        email,
        password,
      );

      const user = userCredential.user;

      // User-Daten aus Firestore abrufen
      const userData = await FirestoreService.getUserData(user.uid);
      if (!userData) {
        throw new Error('User-Daten nicht gefunden');
      }

      // Backfill public profile for existing users
      await FirestoreService.upsertPublicUserData(user.uid, {
        username: userData.username,
        phone: userData.phone,
      });

      return userData;
    } catch (error: any) {
      logFirebaseAuthError('Login-Fehler (Firebase Auth):', error);
      throw error;
    }
  }

  // Logout
  async logout(): Promise<void> {
    try {
      console.log('[AuthService] Logout called');
      // Check if auth instance is valid
      if (!this.auth) {
        console.error('[AuthService] Auth instance not available');
        throw new Error('Auth instance not available');
      }
      
      console.log('[AuthService] Current user before logout:', this.auth.currentUser?.uid || 'null');
      
      // Sign out
      console.log('[AuthService] Calling signOut...');
      await signOut(this.auth);
      console.log('[AuthService] signOut completed');
      
      // Verify logout was successful
      const currentUserAfterLogout = this.auth.currentUser;
      console.log('[AuthService] Current user after logout:', currentUserAfterLogout?.uid || 'null');
      
      if (currentUserAfterLogout) {
        console.warn('[AuthService] User still authenticated after signOut, retrying...');
        // Retry once
        await signOut(this.auth);
        console.log('[AuthService] Retry signOut completed');
      } else {
        console.log('[AuthService] Logout successful - user is null');
      }
    } catch (error: any) {
      console.error('[AuthService] Logout error:', error);
      logFirebaseAuthError('Logout-Fehler (Firebase Auth):', error);
      throw error;
    }
  }

  // Aktuellen User abrufen
  async getCurrentUser(): Promise<UserData | null> {
    try {
      const user = this.auth.currentUser;
      if (!user) {
        return null;
      }

      const userData = await FirestoreService.getUserData(user.uid);
      if (userData) {
        // Sync email from Auth -> Firestore (after verifyBeforeUpdateEmail is confirmed)
        const authEmail = user.email ?? undefined;
        if (authEmail && userData.email !== authEmail) {
          await FirestoreService.updateUserEmail(user.uid, authEmail);
          userData.email = authEmail;
        }

        // Backfill public profile
        await FirestoreService.upsertPublicUserData(user.uid, {
          username: userData.username,
          phone: userData.phone,
        });
      }
      return userData;
    } catch (error: any) {
      console.error('Fehler beim Abrufen des aktuellen Users:', error);
      return null;
    }
  }

  // Auth State Listener
  onAuthStateChanged(callback: (user: UserData | null) => void) {
    console.log('[AuthService] Setting up auth state listener');
    return onAuthStateChanged(this.auth, async (firebaseUser) => {
      console.log('[AuthService] Auth state changed:', firebaseUser ? `User: ${firebaseUser.uid}` : 'User: null (logged out)');
      if (firebaseUser) {
        try {
          const userData = await FirestoreService.getUserData(firebaseUser.uid);
          if (userData) {
            // Sync email from Auth -> Firestore (after verifyBeforeUpdateEmail is confirmed)
            const authEmail = firebaseUser.email ?? undefined;
            if (authEmail && userData.email !== authEmail) {
              await FirestoreService.updateUserEmail(firebaseUser.uid, authEmail);
              userData.email = authEmail;
            }

            // Backfill public profile
            await FirestoreService.upsertPublicUserData(firebaseUser.uid, {
              username: userData.username,
              phone: userData.phone,
            });
          }
          console.log('[AuthService] Calling callback with userData:', userData ? `User: ${userData.uid}` : 'null');
          callback(userData);
        } catch (error) {
          console.error('Fehler beim Abrufen der User-Daten:', error);
          callback(null);
        }
      } else {
        console.log('[AuthService] User logged out, calling callback with null');
        callback(null);
      }
    });
  }

  // E-Mail ändern (Bestätigung an die neue Adresse)
  async requestEmailChange(newEmail: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Kein User angemeldet');
    }
    await verifyBeforeUpdateEmail(user, newEmail);
  }

  // Passwort zurücksetzen
  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error: any) {
      logFirebaseAuthError('Fehler beim Zurücksetzen des Passworts (Firebase Auth):', error);
      throw error;
    }
  }

  // User-Daten aktualisieren
  async updateUserData(userData: {
    username?: string;
    phone?: string;
    parkingSpots?: string[];
    facilityCode?: string;
  }): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Kein User angemeldet');
    }

    const updates: any = {};
    if (userData.username !== undefined) {
      updates.username = userData.username;
    }
    if (userData.phone !== undefined) {
      updates.phone = userData.phone;
    }
    if (userData.parkingSpots !== undefined) {
      updates.parkingSpots = userData.parkingSpots.filter((spot) => spot.trim() !== '');
    }
    if (userData.facilityCode !== undefined) {
      updates.facilityCode = userData.facilityCode.trim().toUpperCase();
    }

    await FirestoreService.updateUserData(user.uid, updates);
  }

  // Account und alle Daten löschen
  async deleteAccount(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) {
      throw new Error('Kein User angemeldet');
    }

    const token = await getIdToken(user, true);
    const projectId = getApp().options.projectId;
    if (!projectId) {
      throw new Error('Missing Firebase projectId');
    }

    const region = 'europe-west3';
    const url = `https://${region}-${projectId}.cloudfunctions.net/deleteUserDataHttp`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
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
      throw err;
    }

    // Nach erfolgreichem Löschen automatisch ausloggen
    // (Der Auth User wurde bereits von der Cloud Function gelöscht)
    try {
      await signOut(this.auth);
    } catch (e) {
      // Ignore logout errors - user is already deleted
      console.log('Logout after account deletion:', e);
    }
  }
}

export default new AuthService();

