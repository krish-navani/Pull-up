module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Note: react-native-reanimated/plugin is auto-added by babel-preset-expo
    // when react-native-reanimated is installed. No need to add it manually.
  };
};
