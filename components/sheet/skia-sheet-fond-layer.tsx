// Variante Skia de FondLayer pour la fiche read-only. Rend le fond image
// dans un <Canvas> Skia → re-rasterisation crispe à toute échelle (SVG
// re-rendered au pixel near, PNG avec sampling propre vs CSS bilinear).
//
// Posé en SIBLING UNDER de l'inner CSS-transformed via la prop
// `skiaUnderlay` de SheetPinchZoom → pas affecté par le CSS scale du
// parent, applique sa propre transform via <Group> Skia.
//
// Couvre la zone NATURELLE complète de la fiche (0,0,naturalW,naturalH)
// en coords pré-transform → après le Group transform (fitScale × scale),
// le fond couvre exactement la zone visible de la fiche au scale=1, et
// déborde proportionnellement au zoom.
//
// Reproduit la résolution de FondLayer JSX :
//   - catalog lookup via useAllFonds
//   - applyTokens (theme + prefs + per-instance overrides)
//   - support cover (preserveAspectRatio slice via patch SVG) ET tile
//
// Trade-off assumé v1 : pas de clipping aux bornes de la fiche (corners
// rounded en perso mode ou bgInsets en catalog mode). Le caller doit
// passer un bgColor ou positionner derrière un cadre qui mask les bords.
// Pour CardFrame, le fond reste rendu en JSX interne via CardFrame (cf.
// commentaire dans sheet/view/[id].tsx).

import { useThemeColors } from '@/hooks/use-theme-colors';
import { applyTokens } from '@/lib/decorations/tokens';
import { type FondDef } from '@/lib/fonds/catalog';
import { useSkiaCachedUri } from '@/lib/skia-image-cache';
import { useAllFonds } from '@/store/fond-catalog';
import { usePreferences } from '@/store/preferences';
import {
  Canvas,
  Group,
  Image as SkiaImage,
  ImageSVG,
  rect,
  rrect,
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
  bgColor: string;
  fondId?: string;
  colorOverrides?: Record<string, string>;
  opacity?: number;
  // Dim de l'outer (= zone visible = naturalDim × fitScale). Le Canvas
  // est sized dessus.
  outerWidth: number;
  outerHeight: number;
  // Dim de la fiche en layout-natif (= référence pour les coords fond).
  naturalWidth: number;
  naturalHeight: number;
  // Shared values du pinch fournies par SheetPinchZoom.
  scale: SharedValue<number>;
  translateX: SharedValue<number>;
  translateY: SharedValue<number>;
  fitScale: number;
  // Cf. SkiaStaticStickerLayer : compense le marginTop du wrapper JSX
  // pour aligner le repère natif Skia avec celui du SheetSurface.
  yOffset?: number;
  // Radius en dp pour le clipping du fond Skia aux coins arrondis du
  // SheetSurface JSX. Sans ce clip, l'image fond dépasserait des coins
  // arrondis et créerait des bords carrés visibles aux 4 coins. Provient
  // de `appearance.frame.radius` côté caller (mode perso uniquement).
  borderRadius?: number;
};

export function SkiaSheetFondLayer({
  bgColor,
  fondId,
  colorOverrides,
  opacity,
  outerWidth,
  outerHeight,
  naturalWidth,
  naturalHeight,
  scale,
  translateX,
  translateY,
  fitScale,
  yOffset = 0,
  borderRadius = 0,
}: Props) {
  const allFonds = useAllFonds();
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const theme = useThemeColors();

  const def: FondDef | undefined = useMemo(() => {
    if (!fondId || fondId === 'none') return undefined;
    return allFonds.find((f) => f.id === fondId);
  }, [fondId, allFonds]);

  const themedSvgXml = useMemo(() => {
    if (!def?.svgXml) return undefined;
    return applyTokens(
      def.svgXml,
      def.tokens,
      { colorPrimary, colorSecondary, colorBg },
      theme,
      colorOverrides,
    );
  }, [
    def?.svgXml,
    def?.tokens,
    colorPrimary,
    colorSecondary,
    colorBg,
    theme,
    colorOverrides,
  ]);

  const hasImage = !!(def && (def.source || def.svgXml));

  // Patch preserveAspectRatio="xMidYMid slice" en mode cover (= crop
  // center). Aligné sur FondLayer JSX.
  const svgXmlForCover = useMemo(() => {
    if (!def?.svgXml || (def.repeat ?? 'cover') !== 'cover') {
      return themedSvgXml ?? def?.svgXml;
    }
    const xml = themedSvgXml ?? def.svgXml;
    return ensureSvgPreserveAspect(xml, 'xMidYMid slice');
  }, [def?.svgXml, def?.repeat, themedSvgXml]);

  const skSvg = useMemo<SkSVG | null>(() => {
    if (!svgXmlForCover) return null;
    return Skia.SVG.MakeFromString(svgXmlForCover);
  }, [svgXmlForCover]);

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
  // Skia n'utilise pas le cache d'expo-image → on résout l'URL distante vers un
  // file:// local pour que le fond reste rendable hors ligne.
  const pngCachedUri = useSkiaCachedUri(typeof pngSource === 'string' ? pngSource : null);
  const skImage = useImage(typeof pngSource === 'number' ? pngSource : pngCachedUri);

  // Transform global : scale.value est DÉJÀ clampé à [fitScale, maxScale]
  // par SheetPinchZoom (idle → scale.value = fitScale). Multiplier par
  // fitScale ici donnerait fitScale² → fond trop petit vs JSX qui applique
  // juste scale.value en CSS. Cf. même note dans skia-static-sticker-layer.
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

  const imageOpacity = hasImage && typeof opacity === 'number' ? opacity : 1;
  const repeat = def?.repeat ?? 'cover';
  const iw = def?.imageSize?.width ?? 0;
  const ih = def?.imageSize?.height ?? 0;

  // Hauteur du sheet effective (sans le marginTop du wrapper). Le Skia
  // Canvas couvre toute l'aire de SheetPinchZoom (= sheet + marginTop)
  // pour rester aligné avec la mesure interne du pinch, mais le rendu
  // du fond doit se restreindre à l'aire du sheet uniquement, sinon
  // bgColor (et l'image) déborde au-dessus avec des coins nets.
  const sheetHeight = Math.max(0, naturalHeight - yOffset);

  // Clip rounded rect appliqué au Group qui rend les images. Sans ça, le
  // fond Skia déborde des coins arrondis du SheetSurface JSX (qui a un
  // overflow:hidden CSS, mais la Skia sibling n'est pas dans son contexte
  // de clipping). Le clip est en NATURAL coords (avant le scale du Group
  // parent) → Skia recompose RoundedRect au pixel près à chaque scale,
  // donc reste crisp à toute échelle.
  const clipRRect = useMemo(
    () =>
      rrect(
        rect(0, 0, naturalWidth, sheetHeight),
        Math.max(0, borderRadius),
        Math.max(0, borderRadius),
      ),
    [naturalWidth, sheetHeight, borderRadius],
  );

  // En tile mode, on calcule la grille de répétition à coords natural-fiche
  // (bornée au sheet, pas au Canvas).
  const tiles = useMemo(() => {
    if (repeat !== 'tile' || iw <= 0 || ih <= 0) return [];
    const nx = Math.max(1, Math.ceil(naturalWidth / iw));
    const ny = Math.max(1, Math.ceil(sheetHeight / ih));
    const out: { x: number; y: number }[] = [];
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        out.push({ x: i * iw, y: j * ih });
      }
    }
    return out;
  }, [repeat, iw, ih, naturalWidth, sheetHeight]);

  // Skip complet le rendu Canvas quand il n'y a aucune image à dessiner —
  // la JSX SheetSurface gère bgColor + coins arrondis seule. Évite un
  // Canvas Skia vide qui pourrait poser un artefact d'antialiasing sur
  // les contours rounded du sheet.
  if (!hasImage) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas style={{ width: outerWidth, height: outerHeight }}>
        <Group transform={groupTransform} opacity={imageOpacity} clip={clipRRect}>
          {/* Pas de bgColor rendu côté Skia : la JSX SheetSurface peint
              déjà bgColor avec les coins arrondis. Si on rendait un Rect
              Skia ici (carré), il déborderait des coins arrondis JSX et
              créerait un halo visible aux 4 coins. Skia ne rend QUE le
              fond image. Si pas d'image (`!hasImage`), Skia ne rend rien
              → JSX gère bgColor seul (cas avec ou sans `disableFond`).
              Le `clip` sur le Group restreint le rendu image aux coins
              arrondis (cf. clipRRect ci-dessus). */}
          {hasImage && repeat === 'cover' ? (
            skSvg ? (
              <ImageSVG
                svg={skSvg}
                x={0}
                y={0}
                width={naturalWidth}
                height={sheetHeight}
              />
            ) : skImage ? (
              <SkiaImage
                image={skImage}
                x={0}
                y={0}
                width={naturalWidth}
                height={sheetHeight}
                fit="cover"
              />
            ) : null
          ) : null}
          {hasImage && repeat === 'tile' && iw > 0 && ih > 0
            ? tiles.map((t) =>
                skSvg ? (
                  <ImageSVG
                    key={`${t.x}-${t.y}`}
                    svg={skSvg}
                    x={t.x}
                    y={t.y}
                    width={iw}
                    height={ih}
                  />
                ) : skImage ? (
                  <SkiaImage
                    key={`${t.x}-${t.y}`}
                    image={skImage}
                    x={t.x}
                    y={t.y}
                    width={iw}
                    height={ih}
                    fit="fill"
                  />
                ) : null,
              )
            : null}
        </Group>
      </Canvas>
    </View>
  );
}

// Force / ajoute preserveAspectRatio sur la balise <svg> racine.
// Copié de fond-layer.tsx (même utilité). Garder en sync.
function ensureSvgPreserveAspect(xml: string, value: string): string {
  return xml.replace(/<svg\b([^>]*)>/i, (_match, attrs: string) => {
    if (/preserveAspectRatio\s*=/.test(attrs)) {
      return `<svg${attrs.replace(
        /preserveAspectRatio\s*=\s*"[^"]*"/i,
        `preserveAspectRatio="${value}"`,
      )}>`;
    }
    return `<svg${attrs} preserveAspectRatio="${value}">`;
  });
}
