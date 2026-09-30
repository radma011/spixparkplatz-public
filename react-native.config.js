module.exports = {
  assets: ['./node_modules/react-native-vector-icons/Fonts'],
  // Expo is only used for EAS Build / Metro config — do not autolink native Expo modules.
  dependencies: {
    expo: {
      platforms: {
        android: null,
        ios: null,
        macos: null,
      },
    },
  },
};
