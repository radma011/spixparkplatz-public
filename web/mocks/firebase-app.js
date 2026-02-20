// Mock for @react-native-firebase/app on web
// TODO: Replace with actual Firebase Web SDK integration
console.warn('⚠️ Using mock Firebase App - Firebase features will not work on web until Firebase Web SDK is integrated');

const mockApp = {
  options: {
    projectId: 'parkplatz-38fe3',
    apiKey: 'mock-api-key',
    authDomain: 'parkplatz-38fe3.firebaseapp.com',
    databaseURL: 'https://parkplatz-38fe3-default-rtdb.firebaseio.com',
    storageBucket: 'parkplatz-38fe3.firebasestorage.app',
  },
  name: '[DEFAULT]',
};

export const getApp = () => mockApp;

export default {
  getApp,
};
