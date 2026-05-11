// Stub web pour `react-native/Libraries/Utilities/codegenNativeComponent`.
// Cette fonction sert à déclarer des composants Fabric-compatibles côté
// React Native natif. Sur web il n'y a pas de Fabric, donc on retourne un
// no-op : un composant React qui ne render rien. Skia v2 importe ça via
// `SkiaPictureViewNativeComponent.js` (= la version non-web). On accepte
// que ce composant soit no-op sur web — le vrai rendering passe par
// `<Canvas>` qui est un composant indépendant et fonctionne via CanvasKit.
export default function codegenNativeComponent<_T>(): unknown {
  return () => null;
}
