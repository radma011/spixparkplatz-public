// Mock for @react-native-firebase/functions on web
console.warn('⚠️ Using mock Firebase Functions - Cloud Functions will not work on web until Firebase Web SDK is integrated');

export default () => ({
  httpsCallable: () => () => Promise.reject(new Error('Not implemented for web')),
});
