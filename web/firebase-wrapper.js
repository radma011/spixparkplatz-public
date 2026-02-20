/**
 * Platform-specific Firebase wrapper
 * Automatically uses Firebase Web SDK on web, React Native Firebase on native platforms
 * 
 * This file is used as an alias in webpack.config.js to replace @react-native-firebase/* imports
 */

// Check if we're on web platform
const isWeb = typeof window !== 'undefined' && typeof navigator !== 'undefined';

if (isWeb) {
  // Use Firebase Web SDK
  module.exports = require('./firebase-web');
} else {
  // Use React Native Firebase (for native platforms)
  module.exports = {
    // Firestore
    getFirestore: require('@react-native-firebase/firestore').getFirestore,
    collection: require('@react-native-firebase/firestore').collection,
    doc: require('@react-native-firebase/firestore').doc,
    query: require('@react-native-firebase/firestore').query,
    where: require('@react-native-firebase/firestore').where,
    orderBy: require('@react-native-firebase/firestore').orderBy,
    limit: require('@react-native-firebase/firestore').limit,
    getDocs: require('@react-native-firebase/firestore').getDocs,
    getDoc: require('@react-native-firebase/firestore').getDoc,
    setDoc: require('@react-native-firebase/firestore').setDoc,
    updateDoc: require('@react-native-firebase/firestore').updateDoc,
    deleteDoc: require('@react-native-firebase/firestore').deleteDoc,
    Timestamp: require('@react-native-firebase/firestore').Timestamp,
    FieldValue: require('@react-native-firebase/firestore').FieldValue,
    FieldPath: require('@react-native-firebase/firestore').FieldPath,
    
    // Auth
    getAuth: require('@react-native-firebase/auth').getAuth,
    createUserWithEmailAndPassword: require('@react-native-firebase/auth').createUserWithEmailAndPassword,
    signInWithEmailAndPassword: require('@react-native-firebase/auth').signInWithEmailAndPassword,
    signOut: require('@react-native-firebase/auth').signOut,
    onAuthStateChanged: require('@react-native-firebase/auth').onAuthStateChanged,
    sendPasswordResetEmail: require('@react-native-firebase/auth').sendPasswordResetEmail,
    verifyBeforeUpdateEmail: require('@react-native-firebase/auth').verifyBeforeUpdateEmail,
    deleteUser: require('@react-native-firebase/auth').deleteUser,
    getIdToken: require('@react-native-firebase/auth').getIdToken,
    
    // App
    getApp: require('@react-native-firebase/app').getApp,
    
    // Messaging
    getMessaging: require('@react-native-firebase/messaging').getMessaging,
    getInitialNotification: require('@react-native-firebase/messaging').getInitialNotification,
    onNotificationOpenedApp: require('@react-native-firebase/messaging').onNotificationOpenedApp,
    requestPermission: require('@react-native-firebase/messaging').requestPermission,
    AuthorizationStatus: require('@react-native-firebase/messaging').AuthorizationStatus,
  };
}
