import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

// Charge CanvasKit-WASM AVANT d'importer App. Important : `Skia.web.js`
// dans @shopify/react-native-skia fait `export const Skia = JsiSkApi(
// global.CanvasKit)` à l'import time. Si on importe App statiquement, les
// transitive modules (SkiaBorderPreview → Skia → Skia.web.js) évaluent
// avant que LoadSkiaWeb pose `global.CanvasKit` → Skia se retrouve mal
// initialisé et `Skia.XYWHRect` est undefined.
//
// Solution : import dynamique de App après LoadSkiaWeb. Comme ça l'évaluation
// des modules Skia se fait après que CanvasKit soit en place.
async function bootstrap() {
  try {
    await LoadSkiaWeb({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.40.0/bin/full/${file}`,
    });
  } catch (err) {
    console.warn('[skia-web] CanvasKit failed to load', err);
  }
  const { App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void bootstrap();
