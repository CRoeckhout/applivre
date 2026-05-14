import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JSON_PATH = path.resolve(dirname, '../app.json');

// Source de vérité de la version de l'app mobile : `app.json` à la racine
// du repo, lu au build (et au démarrage du dev server). Injecté via
// `define` comme constante `__APP_VERSION__` pour pré-remplir le form
// "Quoi de neuf" dans le BO. À chaque redéploiement de l'admin (push sur
// main), la valeur reflète la version commitée dans le repo.
const appJson = JSON.parse(readFileSync(APP_JSON_PATH, 'utf-8')) as {
  expo?: { version?: string };
};
const APP_VERSION = appJson.expo?.version ?? '0.0.0';

// Plugin : surveille `app.json` (hors du root admin) et redémarre le dev
// server quand il change. Sans ça, un bump de `expo.version` reste invisible
// dans le BO tant qu'on ne relance pas Vite manuellement, car `define`
// fige la valeur au démarrage. Inactif en prod (`apply: 'serve'`).
function watchAppVersion(): Plugin {
  return {
    name: 'watch-app-version',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(APP_JSON_PATH);
      server.watcher.on('change', (file) => {
        if (path.resolve(file) === APP_JSON_PATH) {
          server.config.logger.info(
            '[watch-app-version] app.json changed, restarting…',
            { timestamp: true },
          );
          void server.restart();
        }
      });
    },
  };
}

// react-native-web : @shopify/react-native-skia est conçu pour React Native.
// Pour le faire tourner dans Vite (web pur), on alias `react-native` (bare
// specifier seul, via regex) vers `react-native-web`. Les sous-chemins
// internes (`react-native/Libraries/...`) sont stubés vers des no-op : ils
// pointent vers du code Fabric/codegen qui n'existe pas en web.
//
// `extensions` ajoute `.web.tsx`/`.web.ts`/`.web.js` pour que Vite suive la
// même résolution que Metro : un fichier `.web.js` est préféré au `.js`.
// Skia v2 et RN-Web s'appuient sur cette convention.
export default defineConfig({
  plugins: [react(), watchAppVersion()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  resolve: {
    alias: [
      // Chemins internes RN : stubs no-op (Fabric, codegen — non-web).
      // Order matters : longs paths avant le bare specifier.
      {
        find: /^react-native\/Libraries\/Utilities\/codegenNativeComponent$/,
        replacement: path.resolve(dirname, 'src/stubs/codegen-native-component.ts'),
      },
      {
        find: /^react-native\/Libraries\/Renderer\/shims\/ReactFabric$/,
        replacement: path.resolve(dirname, 'src/stubs/react-fabric.ts'),
      },
      // Bare specifier exact : react-native → react-native-web. Le `$` evite
      // de matcher les sous-chemins (qui sont gérés ci-dessus ou dropés).
      { find: /^react-native$/, replacement: 'react-native-web' },
    ],
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.jsx',
      '.web.js',
      '.tsx',
      '.ts',
      '.jsx',
      '.js',
    ],
  },
  define: {
    // Les libs RN check `__DEV__` parfois ; en web Vite ne le set pas.
    __DEV__: 'import.meta.env.DEV',
    // process.env utilisé par RN-Web côté logging.
    'process.env.NODE_ENV': JSON.stringify(
      process.env.NODE_ENV ?? 'development',
    ),
    // RN/Skia référencent `global` qui est un Node.js builtin, indisponible
    // dans le browser. On l'alias sur `globalThis` (= `window` en web).
    global: 'globalThis',
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  optimizeDeps: {
    include: [
      '@shopify/react-native-skia',
      'react-native-web',
      'canvaskit-wasm',
    ],
    esbuildOptions: {
      // Esbuild pre-bundle utilise sa propre résolution. On lui apprend les
      // extensions `.web.*` pour qu'il pick les bons fichiers Skia.
      resolveExtensions: [
        '.web.tsx',
        '.web.ts',
        '.web.jsx',
        '.web.js',
        '.tsx',
        '.ts',
        '.jsx',
        '.js',
        '.mjs',
        '.cjs',
      ],
    },
  },
});
