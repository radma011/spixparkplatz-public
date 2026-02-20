// Mock for @react-native-firebase/auth on web
console.warn('⚠️ Using mock Firebase Auth - Authentication will not work on web until Firebase Web SDK is integrated');

const mockAuth = {
  currentUser: null,
  signInWithEmailAndPassword: (email, password) => Promise.reject(new Error('Not implemented for web')),
  createUserWithEmailAndPassword: (email, password) => Promise.reject(new Error('Not implemented for web')),
  signOut: () => Promise.resolve(),
  onAuthStateChanged: (callback) => {
    callback(null);
    return () => {}; // Return unsubscribe function
  },
  sendPasswordResetEmail: (email) => Promise.reject(new Error('Not implemented for web')),
  verifyBeforeUpdateEmail: (email) => Promise.reject(new Error('Not implemented for web')),
};

// Export functions matching React Native Firebase API
export const getAuth = () => mockAuth;

export const createUserWithEmailAndPassword = (auth, email, password) => {
  return Promise.reject(new Error('Not implemented for web'));
};

export const signInWithEmailAndPassword = (auth, email, password) => {
  return Promise.reject(new Error('Not implemented for web'));
};

export const signOut = (auth) => {
  return Promise.resolve();
};

export const onAuthStateChanged = (auth, callback) => {
  callback(null);
  return () => {}; // Return unsubscribe function
};

export const sendPasswordResetEmail = (auth, email) => {
  return Promise.reject(new Error('Not implemented for web'));
};

export const verifyBeforeUpdateEmail = (auth, email) => {
  return Promise.reject(new Error('Not implemented for web'));
};

export const deleteUser = (user) => {
  return Promise.reject(new Error('Not implemented for web'));
};

export const getIdToken = (user, forceRefresh = false) => {
  return Promise.reject(new Error('Not implemented for web'));
};

// Default export
export default () => mockAuth;
