// Mock for @react-native-firebase/messaging on web
console.warn('⚠️ Using mock Firebase Messaging - Push notifications will not work on web until Firebase Web SDK is integrated');

export const getMessaging = () => ({
  getToken: () => Promise.resolve(null),
  requestPermission: () => Promise.resolve(1),
  onMessage: () => () => {},
  setBackgroundMessageHandler: () => {},
});

export const getInitialNotification = () => Promise.resolve(null);
export const onNotificationOpenedApp = () => () => {};

export default {
  getMessaging,
  getInitialNotification,
  onNotificationOpenedApp,
};
