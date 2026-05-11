// Native entry : re-exporte directement la vraie impl Skia. Sur iOS/Android,
// Skia est linké en JSI au runtime, pas besoin de gating async.
// Le fichier `nine-slice-frame.web.tsx` (Metro le pick auto pour la
// plateforme web) wrappe l'impl dans un Suspense + lazy après LoadSkiaWeb,
// pour que `Skia.web.js` (qui fait `JsiSkApi(global.CanvasKit)` à l'import)
// ne s'évalue qu'après que CanvasKit-WASM soit chargé.
export { NineSliceFrame, type RepeatMode } from './nine-slice-frame-impl';
