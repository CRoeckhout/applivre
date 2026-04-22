const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Zustand v5 ships an ESM middleware that uses import.meta.env, ce que le
// bundler web de Metro ne sait pas gérer. On force la résolution vers les
// entrypoints CJS (présents à la racine du package) pour toutes les plateformes.
const ZUSTAND_CJS_ENTRIES = new Set([
  'zustand',
  'zustand/middleware',
  'zustand/shallow',
  'zustand/traditional',
  'zustand/vanilla',
  'zustand/react',
]);

const originalResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (ZUSTAND_CJS_ENTRIES.has(moduleName)) {
    const sub = moduleName === 'zustand' ? 'index' : moduleName.slice('zustand/'.length);
    return {
      filePath: path.join(__dirname, 'node_modules', 'zustand', `${sub}.js`),
      type: 'sourceFile',
    };
  }
  if (originalResolve) return originalResolve(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './global.css' });
