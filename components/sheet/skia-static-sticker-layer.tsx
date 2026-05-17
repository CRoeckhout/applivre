// Variante Skia de StaticStickerLayer (read-only). Rend tous les stickers
// dans un seul <Canvas> Skia → re-rasterisation crispe à toute échelle :
//   - SVG (ImageSVG) : Skia re-rasterise à la taille finale du draw, donc
//     aucun pixel-pleed quand le pinch zoom du parent monte au-delà de 1.
//   - PNG (Image) : Skia utilise un sampling propre (mitchell par défaut)
//     qui dégrade moins vite que GPU bilinear.
//
// Le Canvas est rendu en SIBLING de l'inner CSS-transformed de
// SheetPinchZoom (via la prop `skiaOverlay`) — donc pas affecté par le
// CSS scale du parent. Le scale + translate du pinch arrivent ici comme
// shared values et sont appliqués via un <Group transform> Skia, qui
// applique la transformation NATIVEMENT pendant le draw → re-rasterisation
// crispe à chaque frame.
//
// Reproduit la fidélité visuelle de StaticStickerLayer :
//   - même résolution catalog (applyTokens)
//   - même STICKER_NATURAL_WIDTH
//   - même formule de transform par sticker (translate au centre + scale + rotate)
// Si le rendu d'édition (components/sticker.tsx) évolue, dupliquer ici.

import { useThemeColors } from '@/hooks/use-theme-colors';
import { applyTokens } from '@/lib/decorations/tokens';
import {
  STICKER_NATURAL_WIDTH,
  type StickerDef,
} from '@/lib/stickers/catalog';
import { usePreferences } from '@/store/preferences';
import { useAllStickers } from '@/store/sticker-catalog';
import type { PlacedSticker } from '@/types/book';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  ImageSVG,
  Skia,
  type SkSVG,
  useImage,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  type SharedValue,
  useDerivedValue,
} from 'react-native-reanimated';

type Props = {
  stickers: PlacedSticker[];
  // Dim de l'outer (zone visible = naturalDim × fitScale). Le Canvas est
  // ancré dessus.
  outerWidth: number;
  outerHeight: number;
  // Dim de la fiche en layout-natif (= référence pour les coords stickers).
  naturalWidth: number;
  naturalHeight: number;
  // Shared values du pinch fournies par SheetPinchZoom : appliquées via
  // <Group transform> Skia → re-rasterisation à toute échelle.
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  fitScale: number;
  // Ids à ne PAS rendre — pattern hybride éditeur où le sticker sélectionné
  // reste rendu en JSX (drag live + ring). Skia rend tous les autres.
  skipIds?: string[];
  // Offset Y appliqué AUX coords natives des stickers AVANT le scale. Sert
  // à compenser le marginTop éventuel du wrapper de la fiche : le Canvas
  // Skia couvre toute la zone de SheetPinchZoom (inner inclus marginTop)
  // alors que les stickers JSX sont positionnés relativement au SheetSurface
  // (= sous le marginTop). Sans offset, les stickers Skia apparaissent
  // marginTop px plus haut que leurs équivalents JSX.
  yOffset?: number;
};

export function SkiaStaticStickerLayer({
  stickers,
  outerWidth,
  outerHeight,
  naturalWidth,
  naturalHeight,
  scale,
  translateX,
  translateY,
  fitScale,
  skipIds,
  yOffset = 0,
}: Props) {
  const visibleStickers = skipIds && skipIds.length > 0
    ? stickers.filter((s) => !skipIds.includes(s.id))
    : stickers;
  // Transform appliquée à TOUT le contenu du Canvas.
  // `scale.value` côté SheetPinchZoom est DÉJÀ clampé à [fitScale, maxScale]
  // (l'useEffect de re-sync force scale.value = fitScale à l'idle). On
  // applique donc scale.value tel quel — multiplier par fitScale ici
  // donnerait fitScale² au repos → contenu trop petit (mismatch vs JSX
  // qui applique juste scale.value via CSS transform inner).
  // Le Canvas est sized à outerDim = naturalDim × fitScale, donc une
  // coord natural cx mappée à cx × scale.value (= cx × fitScale à l'idle)
  // tombe pile au bon endroit visuellement.
  // Transform array : appliquée droite-à-gauche en matrix-sense, donc le
  // translateY(yOffset) à la fin est appliqué en PREMIER aux coords locales,
  // puis scale, puis translates pinch. Effet : yOffset est en coords natives
  // (avant scale), donc se retrouve visuellement à yOffset × scale.value px.
  const groupTransform = useDerivedValue(
    () => {
      const tx = translateX.value;
      const ty = translateY.value;
      const s = scale.value;
      if (yOffset === 0) {
        return [
          { translateX: tx },
          { translateY: ty },
          { scale: s },
        ];
      }
      return [
        { translateX: tx },
        { translateY: ty },
        { scale: s },
        { translateY: yOffset },
      ];
    },
    [translateX, translateY, scale, yOffset],
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={{ width: outerWidth, height: outerHeight }}>
        <Group transform={groupTransform}>
          {visibleStickers.map((p) => (
            <SkiaStickerNode
              key={p.id}
              placement={p}
              layerWidth={naturalWidth}
              layerHeight={naturalHeight}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}

function SkiaStickerNode({
  placement,
  layerWidth,
  layerHeight,
}: {
  placement: PlacedSticker;
  layerWidth: number;
  layerHeight: number;
}) {
  const allStickers = useAllStickers();
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const theme = useThemeColors();

  const def: StickerDef | undefined = useMemo(
    () => allStickers.find((s) => s.id === placement.stickerId),
    [allStickers, placement.stickerId],
  );

  const themedSvgXml = useMemo(() => {
    if (!def?.svgXml) return undefined;
    return applyTokens(
      def.svgXml,
      def.tokens,
      { colorPrimary, colorSecondary, colorBg },
      theme,
      placement.colorOverrides,
    );
  }, [
    def?.svgXml,
    def?.tokens,
    colorPrimary,
    colorSecondary,
    colorBg,
    theme,
    placement.colorOverrides,
  ]);

  const skSvg = useMemo<SkSVG | null>(() => {
    const xml = themedSvgXml ?? def?.svgXml;
    if (!xml) return null;
    return Skia.SVG.MakeFromString(xml);
  }, [themedSvgXml, def?.svgXml]);

  const pngSource = useMemo<string | number | null>(() => {
    if (def?.svgXml) return null;
    const src = def?.source;
    if (!src) return null;
    if (typeof src === 'number') return src;
    if (typeof src === 'object' && 'uri' in src && typeof src.uri === 'string') {
      return src.uri;
    }
    return null;
  }, [def?.source, def?.svgXml]);
  const skImage = useImage(pngSource);

  if (!def) return null;

  const naturalSticker = STICKER_NATURAL_WIDTH;
  const aspectRatio = def.imageSize.height / def.imageSize.width;
  const naturalStickerH = naturalSticker * aspectRatio;

  // Mêmes formules que StaticStickerLayer JSX :
  //   x : fraction de la largeur layer (toujours).
  //   y : dp absolu depuis le top (format moderne) ou fraction (legacy, y<=1).
  const cx = placement.x * layerWidth;
  const cy = placement.y <= 1 ? placement.y * layerHeight : placement.y;

  // Skia transform appliqué localement au sticker (en natural coords ;
  // le Group parent applique le fitScale × scale du pinch par-dessus).
  const stickerTransform = [
    { translateX: cx },
    { translateY: cy },
    { rotate: placement.rotation },
    { scale: placement.scale },
    { translateX: -naturalSticker / 2 },
    { translateY: -naturalStickerH / 2 },
  ];

  return (
    <Group transform={stickerTransform}>
      {skSvg ? (
        <ImageSVG
          svg={skSvg}
          x={0}
          y={0}
          width={naturalSticker}
          height={naturalStickerH}
        />
      ) : skImage ? (
        <SkiaImage
          image={skImage}
          x={0}
          y={0}
          width={naturalSticker}
          height={naturalStickerH}
          fit="contain"
        />
      ) : null}
    </Group>
  );
}
