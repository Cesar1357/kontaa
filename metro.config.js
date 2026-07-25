const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Prefer CommonJS-friendly conditions first to avoid tslib import condition
// resolving to modules/index.js under Expo web/server bundling.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  'require',
  'react-native',
  'development',
];

const ALIASES = {
  tslib: require.resolve('tslib/tslib.es6.js'),
  'tslib/modules/index.js': require.resolve('tslib/tslib.es6.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  return context.resolveRequest(
    context,
    ALIASES[moduleName] ?? moduleName,
    platform
  );
};

// Ignore transient native build outputs under node_modules that can be created
// and deleted while Metro is watching (common on Windows without Watchman).
config.resolver.blockList = [
  /node_modules[\\/]expo-modules-autolinking[\\/]android[\\/]expo-gradle-plugin[\\/].*[\\/]build[\\/].*/,
  /node_modules[\\/].*[\\/]android[\\/]build[\\/].*/,
];

module.exports = config;
