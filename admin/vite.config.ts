import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const dirname = path.dirname(fileURLToPath(import.meta.url));

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
  plugins: [react()],
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
