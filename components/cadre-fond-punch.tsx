// « Trou par forme » pour les cadres SVG quand le fond remplit l'app.
//
// Problème résolu : un cadre SVG masque son extérieur (hors bordure) avec un
// path rempli de la couleur de page (token de fond, ex. `paper`). Sur un fond
// d'app UNI ça se fond ; sur un fond IMAGE, non. On veut donc que l'extérieur
// du cadre devienne un VRAI trou transparent, à travers lequel on voit le fond
// de l'app peint à la racine (fixe) — l'alignement au scroll est gratuit.
//
// Ce composant n'est qu'un ORCHESTRATEUR : il résout le fond (→ nodes Skia) et
// dérive deux variantes du SVG du cadre par simples overrides de tokens, puis
// délègue le rendu à NineSliceFrame en mode "punch". C'est NineSliceFrame qui
// découpe/répète (round/fixed/stretch) bordure ET effaceur via la MÊME grille
// de cells, et compose : fond (base) → dstOut(effaceur) → bordure.
//
//   - effaceur : tokens de fond → noir opaque, traits → none (zone à percer) ;
//   - bordure  : tokens de fond → none (trou), traits résolus normalement.

import { useAppFondActive } from '@/components/app-fond-background';
import { CardFrameProvider } from '@/components/card-frame-context';
import { NineSliceFrame } from '@/components/nine-slice-frame';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { BorderDef } from '@/lib/borders/catalog';
import { applyTokens } from '@/lib/decorations/tokens';
import { type FondDef } from '@/lib/fonds/catalog';
import { useSkiaCachedUri } from '@/lib/skia-image-cache';
import { useAllBorders } from '@/store/border-catalog';
import { useAllFonds } from '@/store/fond-catalog';
import { usePreferences } from '@/store/preferences';
import {
  Group,
  Image as SkiaImage,
  ImageSVG,
  Skia,
  type SkSVG,
  useImage,
} from '@shopify/react-native-skia';
import { type ReactNode, useCallback, useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

// Tokens dont le sentinel représente la couleur de page (= le path de masque).
// Dans l'effaceur ils deviennent opaques (zone à percer) ; dans la bordure ils
// deviennent `none` (le masque disparaît → trou). Tout autre token est un trait
// du cadre à conserver (colorPrimary, colorSecondary, ink…).
const MASK_TOKEN_KEYS = ['paper', 'paperWarm', 'paperShade', 'colorBg'];

export function cadreHasMaskToken(cadre: BorderDef | undefined): boolean {
  if (!cadre?.svgXml || !cadre.tokens) return false;
  return Object.keys(cadre.tokens).some((k) => MASK_TOKEN_KEYS.includes(k));
}

// Renvoie un prédicat `(borderId) => bool` : vrai quand le cadre identifié est
// un cadre SVG à masque ET que le fond remplit l'app → le mode punch s'applique
// (l'extérieur du cadre est percé). Utile aux écrans qui posent un backing
// opaque derrière une fiche (ex. liste de fiches) : ils doivent rendre ce
// backing transparent pour ne pas reboucher le trou. Le hook se lit une fois,
// le prédicat s'utilise en boucle (pas de hook par item).
export function useCadrePunch(): (borderId: string | undefined) => boolean {
  const appFond = useAppFondActive();
  const allBorders = useAllBorders();
  return useCallback(
    (borderId: string | undefined) => {
      if (!appFond || !borderId) return false;
      return cadreHasMaskToken(allBorders.find((b) => b.id === borderId));
    },
    [appFond, allBorders],
  );
}

type Props = {
  cadre: BorderDef;
  cadreColorOverrides?: Record<string, string>;
  bgColor: string;
  fondId?: string;
  fondColorOverrides?: Record<string, string>;
  fondOpacity?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

export function CadreFondPunch({
  cadre,
  cadreColorOverrides,
  bgColor,
  fondId,
  fondColorOverrides,
  fondOpacity,
  style,
  children,
}: Props) {
  const allFonds = useAllFonds();
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const theme = useThemeColors();
  const prefs = { colorPrimary, colorSecondary, colorBg };

  // SVG bordure : masque → none (trou), traits résolus normalement. Pas de
  // patch preserveAspectRatio : NineSliceFrame scale via les transforms de cells.
  const borderSvgXml = useMemo(() => {
    if (!cadre.svgXml) return undefined;
    const overrides: Record<string, string> = { ...cadreColorOverrides };
    for (const key of Object.keys(cadre.tokens ?? {})) {
      if (MASK_TOKEN_KEYS.includes(key)) overrides[key] = 'none';
    }
    return applyTokens(cadre.svgXml, cadre.tokens, prefs, theme, overrides);
  }, [cadre.svgXml, cadre.tokens, cadreColorOverrides, colorPrimary, colorSecondary, colorBg, theme]);

  // SVG effaceur : masque → noir opaque (zone à percer), traits → none.
  const eraserSvgXml = useMemo(() => {
    if (!cadre.svgXml) return undefined;
    const overrides: Record<string, string> = {};
    for (const key of Object.keys(cadre.tokens ?? {})) {
      overrides[key] = MASK_TOKEN_KEYS.includes(key) ? '#000000' : 'none';
    }
    return applyTokens(cadre.svgXml, cadre.tokens, prefs, theme, overrides);
  }, [cadre.svgXml, cadre.tokens, colorPrimary, colorSecondary, colorBg, theme]);

  // ─── Fond (réutilise la résolution de SkiaSheetFondLayer) ───────────────
  const fondDef: FondDef | undefined = useMemo(() => {
    if (!fondId || fondId === 'none') return undefined;
    return allFonds.find((f) => f.id === fondId);
  }, [fondId, allFonds]);

  const fondSvgXml = useMemo(() => {
    if (!fondDef?.svgXml) return undefined;
    const themed = applyTokens(fondDef.svgXml, fondDef.tokens, prefs, theme, fondColorOverrides);
    return (fondDef.repeat ?? 'cover') === 'cover'
      ? ensureSvgPreserveAspect(themed, 'xMidYMid slice')
      : themed;
  }, [fondDef?.svgXml, fondDef?.tokens, fondDef?.repeat, colorPrimary, colorSecondary, colorBg, theme, fondColorOverrides]);

  const fondSkSvg = useMemo<SkSVG | null>(
    () => (fondSvgXml ? Skia.SVG.MakeFromString(fondSvgXml) : null),
    [fondSvgXml],
  );

  const fondPngSource = useMemo<string | number | null>(() => {
    if (fondDef?.svgXml) return null;
    const src = fondDef?.source;
    if (!src) return null;
    if (typeof src === 'number') return src;
    if (typeof src === 'object' && 'uri' in src && typeof src.uri === 'string') return src.uri;
    return null;
  }, [fondDef?.source, fondDef?.svgXml]);
  const fondPngCachedUri = useSkiaCachedUri(
    typeof fondPngSource === 'string' ? fondPngSource : null,
  );
  const fondSkImage = useImage(
    typeof fondPngSource === 'number' ? fondPngSource : fondPngCachedUri,
  );

  const hasFondImage = !!(fondDef && (fondDef.source || fondDef.svgXml));
  const imageOpacity = hasFondImage && typeof fondOpacity === 'number' ? fondOpacity : 1;
  const repeat = fondDef?.repeat ?? 'cover';
  const iw = fondDef?.imageSize?.width ?? 0;
  const ih = fondDef?.imageSize?.height ?? 0;

  // Nodes Skia du fond, rendus DANS le canvas de NineSliceFrame (base percée).
  const renderFond = useMemo(
    () =>
      (w: number, h: number): ReactNode => {
        if (!hasFondImage) return null;
        if (repeat === 'cover') {
          return (
            <Group opacity={imageOpacity}>
              {fondSkSvg ? (
                <ImageSVG svg={fondSkSvg} x={0} y={0} width={w} height={h} />
              ) : fondSkImage ? (
                <SkiaImage image={fondSkImage} x={0} y={0} width={w} height={h} fit="cover" />
              ) : null}
            </Group>
          );
        }
        if (iw <= 0 || ih <= 0) return null;
        const nx = Math.max(1, Math.ceil(w / iw));
        const ny = Math.max(1, Math.ceil(h / ih));
        const tiles: ReactNode[] = [];
        for (let j = 0; j < ny; j += 1) {
          for (let i = 0; i < nx; i += 1) {
            const x = i * iw;
            const y = j * ih;
            tiles.push(
              fondSkSvg ? (
                <ImageSVG key={`${x}-${y}`} svg={fondSkSvg} x={x} y={y} width={iw} height={ih} />
              ) : fondSkImage ? (
                <SkiaImage key={`${x}-${y}`} image={fondSkImage} x={x} y={y} width={iw} height={ih} fit="fill" />
              ) : null,
            );
          }
        }
        return <Group opacity={imageOpacity}>{tiles}</Group>;
      },
    [hasFondImage, repeat, imageOpacity, fondSkSvg, fondSkImage, iw, ih],
  );

  const ctx = useMemo(
    () => ({ inFrame: true, padding: cadre.cardPadding ?? 0 }),
    [cadre.cardPadding],
  );

  return (
    <NineSliceFrame
      svgXml={borderSvgXml}
      eraserSvgXml={eraserSvgXml}
      renderFond={renderFond}
      punchBgColor={bgColor}
      imageSize={cadre.imageSize!}
      slice={cadre.slice!}
      padding={cadre.padding}
      bgInsets={cadre.bgInsets}
      repeat={cadre.repeat}
      sliceExtras={cadre.sliceExtras}
      fillCenter={false}
      style={style}>
      <CardFrameProvider value={ctx}>{children}</CardFrameProvider>
    </NineSliceFrame>
  );
}

// Force / ajoute preserveAspectRatio sur la balise <svg> racine (copié de
// skia-sheet-fond-layer.tsx — garder en sync).
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
