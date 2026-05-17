/**
 * Firebase Web SDK Wrapper
 * This module provides Firebase Web SDK initialization and exports
 * Used when Platform.OS === 'web'
 */

import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAnalytics, Analytics } from 'firebase/analytics';
import { 
  getFirestore as getFirestoreSDK, 
  Firestore,
  collection as webCollection,
  collectionGroup as webCollectionGroup,
  doc as webDoc,
  query as webQuery,
  where as webWhere,
  orderBy as webOrderBy,
  limit as webLimit,
  getDocs as webGetDocs,
  getDoc as webGetDoc,
  setDoc as webSetDoc,
  updateDoc as webUpdateDoc,
  deleteDoc as webDeleteDoc,
  onSnapshot as webOnSnapshot,
  Timestamp as webTimestamp,
  serverTimestamp as webServerTimestamp,
  deleteField as webDeleteField,
  increment as webIncrement,
  arrayUnion as webArrayUnion,
  arrayRemove as webArrayRemove,
  FieldPath as webFieldPath,
  type QuerySnapshot,
  type DocumentSnapshot,
  type DocumentReference,
  type CollectionReference,
  type Query,
} from 'firebase/firestore';
import {
  getAuth as getAuthSDK,
  Auth,
  createUserWithEmailAndPassword as webCreateUser,
  signInWithEmailAndPassword as webSignIn,
  signOut as webSignOut,
  onAuthStateChanged as webOnAuthStateChanged,
  sendPasswordResetEmail as webSendPasswordReset,
  User,
} from 'firebase/auth';
import { 
  getMessaging as getMessagingSDK, 
  Messaging, 
  getToken as getTokenSDK, 
  onMessage as onMessageSDK,
} from 'firebase/messaging';

import { firebaseConfig } from './firebase-config';

// Initialize Firebase App
let app: FirebaseApp;
let db: Firestore;
let auth: Auth;
let messaging: Messaging | null = null;
let analytics: Analytics | null = null;

if (typeof window !== 'undefined') {
  // Initialize Firebase only once
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    
    // Initialize Analytics only in production (not on localhost)
    if (firebaseConfig.measurementId && 
        window.location.hostname !== 'localhost' && 
        window.location.hostname !== '127.0.0.1') {
      try {
        analytics = getAnalytics(app);
      } catch (e) {
        console.warn('Firebase Analytics initialization failed:', e);
      }
    }
  } else {
    app = getApps()[0];
  }

  db = getFirestoreSDK(app);
  auth = getAuthSDK(app);

  // Initialize messaging only if supported (requires HTTPS in production)
  try {
    if ('serviceWorker' in navigator) {
      messaging = getMessagingSDK(app);
    }
  } catch (e) {
    console.warn('Firebase Messaging not available:', e);
  }
}

// Firestore API wrapper to match React Native Firebase API
export const getFirestore = () => db;

export const collection = (dbOrRef: Firestore | DocumentReference, ...pathSegments: string[]) => {
  if (pathSegments.length === 0) {
    throw new Error('collection() requires at least one path segment');
  }
  
  // If dbOrRef is a DocumentReference, use it as parent
  if ('id' in dbOrRef && 'path' in dbOrRef && !('get' in dbOrRef)) {
    // It's a DocumentReference, create subcollection
    const path = pathSegments.join('/');
    return webCollection(dbOrRef as DocumentReference, path);
  }
  
  // It's a Firestore instance
  const path = pathSegments.join('/');
  return webCollection(dbOrRef as Firestore, path);
};

/** Collection group query (e.g. all `offers` subcollections). Matches RN Firebase: collectionGroup(db, id). */
export const collectionGroup = (firestore: Firestore, collectionId: string) => {
  return webCollectionGroup(firestore, collectionId);
};

export const doc = (collectionOrRef: Firestore | CollectionReference | DocumentReference, ...pathSegments: string[]) => {
  let docRef: DocumentReference;
  
  // Check if first argument is Firestore instance (has _delegate or _settings property)
  const isFirestoreInstance = (arg: any): arg is Firestore => {
    return arg && typeof arg === 'object' && ('_delegate' in arg || '_settings' in arg || arg.constructor?.name === 'Firestore');
  };
  
  // If first argument is Firestore instance (db), create collection reference first
  // Pattern: doc(db, 'collection', 'docId')
  if (pathSegments.length >= 2 && isFirestoreInstance(collectionOrRef)) {
    const collectionPath = pathSegments[0];
    const docId = pathSegments[1];
    const collRef = webCollection(collectionOrRef as Firestore, collectionPath);
    docRef = webDoc(collRef, docId);
  } else if (pathSegments.length === 0) {
    // Generate a new doc ID
    docRef = webDoc(collectionOrRef as CollectionReference);
  } else {
    // If collectionOrRef is a DocumentReference, it's a subcollection
    if ('id' in collectionOrRef && 'path' in collectionOrRef && !('get' in collectionOrRef)) {
      const id = pathSegments[pathSegments.length - 1];
      docRef = webDoc(collectionOrRef as DocumentReference, id);
    } else {
      // It's a CollectionReference
      const id = pathSegments[pathSegments.length - 1];
      docRef = webDoc(collectionOrRef as CollectionReference, id);
    }
  }
  
  return addOnSnapshotToDoc(docRef);
};

export const query = (...args: any[]) => {
  const q = webQuery(...args);
  return addOnSnapshotToQuery(q);
};

export const where = (field: string, operator: any, value: any) => {
  return webWhere(field, operator, value);
};

export const orderBy = (field: string, direction: 'asc' | 'desc' = 'asc') => {
  return webOrderBy(field, direction);
};

export const limit = (n: number) => {
  return webLimit(n);
};

export const getDocs = (queryOrCollection: any): Promise<QuerySnapshot> => {
  return webGetDocs(queryOrCollection);
};

export const getDoc = (docRef: DocumentReference): Promise<DocumentSnapshot> => {
  return webGetDoc(docRef);
};

export const setDoc = (docRef: DocumentReference, data: any, options?: {merge?: boolean}) => {
  if (options?.merge) {
    return webSetDoc(docRef, data, {merge: true});
  }
  return webSetDoc(docRef, data);
};

export const updateDoc = (docRef: DocumentReference, data: any) => {
  return webUpdateDoc(docRef, data);
};

export const deleteDoc = (docRef: DocumentReference) => {
  return webDeleteDoc(docRef);
};

// onSnapshot wrapper - Firebase Web SDK uses onSnapshot as a function, not a method
// We need to add it as a method to Query and DocumentReference objects to match React Native Firebase API
export const onSnapshot = (
  queryOrDoc: Query | DocumentReference,
  onNext: (snapshot: QuerySnapshot | DocumentSnapshot) => void,
  onError?: (error: Error) => void,
) => {
  return webOnSnapshot(queryOrDoc, onNext, onError);
};

// Helper to add onSnapshot method to Query objects (to match React Native Firebase API)
const addOnSnapshotToQuery = (q: Query): Query & { onSnapshot: typeof onSnapshot } => {
  return Object.assign(q, {
    onSnapshot: (onNext: (snapshot: QuerySnapshot) => void, onError?: (error: Error) => void) => {
      return webOnSnapshot(q, onNext, onError);
    },
  });
};

// Helper to add onSnapshot method to DocumentReference objects
const addOnSnapshotToDoc = (d: DocumentReference): DocumentReference & { onSnapshot: typeof onSnapshot } => {
  return Object.assign(d, {
    onSnapshot: (onNext: (snapshot: DocumentSnapshot) => void, onError?: (error: Error) => void) => {
      return webOnSnapshot(d, onNext, onError);
    },
  });
};

export const Timestamp = {
  now: () => webTimestamp.now(),
  fromDate: (date: Date) => webTimestamp.fromDate(date),
  fromMillis: (ms: number) => webTimestamp.fromMillis(ms),
  toDate: (timestamp: any) => timestamp.toDate(),
};

// FieldValue wrapper - Firebase Web SDK exports these as functions, not methods
// FieldValue wrapper - Firebase Web SDK exports these as standalone functions
export const FieldValue = {
  serverTimestamp: () => webServerTimestamp(),
  delete: () => webDeleteField(),
  increment: (n: number) => webIncrement(n),
  arrayUnion: (...elements: any[]) => webArrayUnion(...elements),
  arrayRemove: (...elements: any[]) => webArrayRemove(...elements),
};

export const FieldPath = {
  documentId: () => webFieldPath.documentId(),
};

// Auth API wrapper
// Accept app parameter for compatibility with React Native Firebase API, but ignore it
export const getAuth = (_app?: FirebaseApp) => auth;

export const createUserWithEmailAndPassword = (authInstance: Auth, email: string, password: string) => {
  return webCreateUser(authInstance, email, password);
};

export const signInWithEmailAndPassword = (authInstance: Auth, email: string, password: string) => {
  return webSignIn(authInstance, email, password);
};

export const signOut = (authInstance: Auth) => {
  // Use the global auth instance if authInstance is not provided or invalid
  const authToUse = authInstance || auth;
  if (!authToUse) {
    console.error('[firebase-web] Auth instance not available for signOut');
    return Promise.reject(new Error('Auth instance not available'));
  }
  console.log('[firebase-web] Signing out user:', authToUse.currentUser?.uid);
  console.log('[firebase-web] Auth instance:', authToUse);
  return webSignOut(authToUse).then(() => {
    console.log('[firebase-web] Sign out successful');
    // Verify the user is actually signed out
    const currentUser = authToUse.currentUser;
    console.log('[firebase-web] Current user after signOut:', currentUser?.uid || 'null');
    return Promise.resolve();
  }).catch((error) => {
    console.error('[firebase-web] Sign out error:', error);
    return Promise.reject(error);
  });
};

export const onAuthStateChanged = (authInstance: Auth, callback: (user: User | null) => void) => {
  console.log('[firebase-web] Setting up onAuthStateChanged listener');
  return webOnAuthStateChanged(authInstance, (user) => {
    console.log('[firebase-web] Auth state changed:', user ? `User: ${user.uid}` : 'User: null (logged out)');
    callback(user);
  });
};

export const sendPasswordResetEmail = (authInstance: Auth, email: string) => {
  return webSendPasswordReset(authInstance, email);
};

export const verifyBeforeUpdateEmail = async (user: User, newEmail: string) => {
  // Firebase Web SDK doesn't have verifyBeforeUpdateEmail directly
  // This would need to be implemented via Cloud Functions or handled differently
  throw new Error('verifyBeforeUpdateEmail not implemented for web');
};

export const deleteUser = async (user: User) => {
  return user.delete();
};

export const getIdToken = async (user: User, forceRefresh: boolean = false) => {
  return user.getIdToken(forceRefresh);
};

// App API wrapper
export const getApp = () => app;

// Messaging API wrapper
export const getMessaging = () => messaging;

export const getToken = async (messagingInstance: Messaging | null) => {
  if (!messagingInstance) {
    return null;
  }
  try {
    return await getTokenSDK(messagingInstance);
  } catch (e) {
    console.warn('Failed to get FCM token:', e);
    return null;
  }
};

export const onMessage = (messagingInstance: Messaging | null, callback: (payload: any) => void) => {
  if (!messagingInstance) {
    return () => {};
  }
  return onMessageSDK(messagingInstance, callback);
};

export const getInitialNotification = async () => {
  // Web doesn't have getInitialNotification in the same way
  // This would need to be handled via service worker
  return null;
};

export const onNotificationOpenedApp = (callback: (notification: any) => void) => {
  // Web doesn't have onNotificationOpenedApp in the same way
  // This would need to be handled via service worker
  return () => {};
};

// AuthorizationStatus enum to match React Native Firebase
export const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
};

// requestPermission wrapper for Messaging
// Maps to React Native Firebase AuthorizationStatus: 0=DENIED, 1=AUTHORIZED, 2=PROVISIONAL
export const requestPermission = async (messagingInstance: Messaging | null): Promise<number> => {
  // On web, push notifications are not needed - return DENIED to skip initialization
  return AuthorizationStatus.DENIED;
};

// Additional Messaging functions that might be needed
export const subscribeToTopic = async (messagingInstance: Messaging | null, topic: string) => {
  // Web doesn't support topic subscriptions in the same way
  console.log('subscribeToTopic not supported on web');
  return Promise.resolve();
};

export const onTokenRefresh = (messagingInstance: Messaging | null, callback: (token: string) => void) => {
  // Web doesn't have onTokenRefresh in the same way
  return () => {};
};

export const registerDeviceForRemoteMessages = async (messagingInstance: Messaging | null) => {
  // Web doesn't need device registration
  return Promise.resolve();
};
