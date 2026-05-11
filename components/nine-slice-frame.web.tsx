import { lazy, Suspense, type ReactNode } from 'react';
import {
  ImageSourcePropType,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import type { BorderSliceExtras } from '@/lib/borders/catalog';

type Insets = { top: number; right: number; bottom: number; left: number };

export type RepeatMode = 'stretch' | 'round';

type Props = {
  source?: ImageSourcePropType;
  svgXml?: string;
  imageSize: { width: number; height: number };
  slice: Insets;
  padding?: Insets;
  fillCenter?: boolean;
  innerBackgroundColor?: string;
  innerBackground?: ReactNode;
  innerBackgroundCover?: 'insets' | 'full';
  bgInsets?: Insets;
  repeat?: RepeatMode;
  sliceExtras?: BorderSliceExtras;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

// Web entry : on ne peut PAS importer statiquement `nine-slice-frame-impl.tsx`
// car ce module fait `import { Skia } from '@shopify/react-native-skia'` →
// `Skia.web.js` évalué à l'import time → `JsiSkApi(global.CanvasKit)` →
// global.CanvasKit pas encore set par LoadSkiaWeb → Skia mal initialisé.
//
// Solution : on lazy-load la vraie impl APRÈS LoadSkiaWeb. Une fois
// CanvasKit posé sur globalThis, on dynamic-import l'impl, et son module
// Skia.web.js s'évalue avec global.CanvasKit défini → tout fonctionne.
//
// Le résultat : un Suspense fallback (vide) le temps du load initial. Tous
// les NineSliceFrame du screen attendent le même promise, donc une seule
// init globale même avec 4+ instances.
const SkiaImpl = lazy(async () => {
  // Charge CanvasKit-WASM si pas déjà fait. globalThis.CanvasKit posé par
  // LoadSkiaWeb sert de sentinel pour skip le re-load.
  if (
    typeof globalThis !== 'undefined' &&
    !(globalThis as { CanvasKit?: unknown }).CanvasKit
  ) {
    const mod = await import('@shopify/react-native-skia/lib/module/web');
    await mod.LoadSkiaWeb({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/canvaskit-wasm@0.40.0/bin/full/${file}`,
    });
  }
  const impl = await import('./nine-slice-frame-impl');
  return { default: impl.NineSliceFrame };
});

export function NineSliceFrame(props: Props) {
  return (
    <Suspense
      fallback={
        // Fallback minimal : juste un View transparent qui occupe la zone.
        // Évite un layout shift visible quand l'impl Skia s'attache.
        <View style={props.style} />
      }>
      <SkiaImpl {...props} />
    </Suspense>
  );
}
