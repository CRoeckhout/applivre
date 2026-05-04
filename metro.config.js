const path = require('path');

// EAS Android build invokes Metro from android/ — force cwd back to project root
// so internal resolvers that read process.cwd() (autolinking, expo-config) find
// the right package.json instead of android/package.json.
process.chdir(__dirname);

const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// Monorepo : Metro doit watcher les packages workspace pour HMR + résolution.
// Avec pnpm hoisted, @grimolia/social est symlink dans node_modules ; on
// ajoute le dossier source pour que les changements dedans déclenchent un
// rebuild et que Metro résolve correctement les imports relatifs du package.
config.watchFolders = [
  ...(Array.isArray(config.watchFolders) ? config.watchFolders : []),
  path.resolve(__dirname, 'packages'),
];

// Le dossier `admin/` est une web-app Vite indépendante (backoffice local).
// On exclut sa node_modules et ses sources du bundle Metro pour éviter que
// l'autolinking ne tente d'importer des deps web côté natif.
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const adminPath = path.resolve(__dirname, 'admin');
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList) ? config.resolver.blockList : []),
  new RegExp(`^${escapeRegex(adminPath)}/.*$`),
];

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

module.exports = withNativeWind(config, {
  input: path.resolve(__dirname, 'global.css'),
  configPath: path.resolve(__dirname, 'tailwind.config.js'),
});
