import { useThemeColors } from '@/hooks/use-theme-colors';
import { applyTokens } from '@/lib/decorations/tokens';
import { type FondDef } from '@/lib/fonds/catalog';
import { useAllFonds } from '@/store/fond-catalog';
import { usePreferences } from '@/store/preferences';
import { Image } from 'expo-image';
import { type ReactNode, useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { SvgXml } from 'react-native-svg';

type Props = {
  // Couleur de fond solide. Rendue uniquement en fallback quand l'image du
  // fond ne peut pas être affichée (def absent du catalog, source/svgXml
  // manquants). Dès qu'une image est rendue, `bgColor` est ignorée — la
  // surface est exclusivement définie par le fond.
  bgColor: string;
  // Optionnel : id d'un fond du catalog à rendre. Si absent / 'none' / non
  // dispo (ex. catalog pas encore chargé), seul `bgColor` est dessiné.
  fondId?: string;
  // Color overrides per-instance pour SVG (priorité sur prefs et theme).
  colorOverrides?: Record<string, string>;
  // Opacité 0..1 appliquée à toute la couche image. Quand < 1, le contenu
  // sous-jacent (typt. `bgColor` de la fiche peint dans bgInsets/cover par
  // le NineSliceFrame) transparaît proportionnellement. Pas appliqué au
  // fallback `bgColor` de cette View — l'opacité ne sert que l'image.
  opacity?: number;
};

// Layer absolu rempli sur tout le parent. Conçu pour être posé derrière le
// contenu d'une card/fiche/bingo via `position: absolute`, `inset: 0`. Le
// parent doit avoir `overflow: 'hidden'` pour clipper.
//
// Politique de rendu : si une image de fond est dispo, la surface est
// entièrement déterminée par cette image (pas de bgColor en dessous — les
// pixels transparents de l'image laissent voir le parent). bgColor n'est
// utilisée qu'en fallback (catalog pas chargé / fondId orphelin).
export function FondLayer({ bgColor, fondId, colorOverrides, opacity }: Props) {
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

  // L'opacité ne s'applique qu'à la couche image — sinon baisser l'opacité
  // d'un fond "Aucun" (juste un bgColor) ferait disparaître le bg de la
  // card, ce qui n'a aucun sens UI.
  const imageOpacity = hasImage && typeof opacity === 'number' ? opacity : undefined;

  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        // Fallback bgColor uniquement si pas d'image — sinon l'image est la
        // surface de référence et bgColor doit être ignorée (cf. politique).
        hasImage ? null : { backgroundColor: bgColor },
        imageOpacity !== undefined ? { opacity: imageOpacity } : null,
      ]}>
      {hasImage ? <FondImage def={def!} themedSvgXml={themedSvgXml} /> : null}
    </View>
  );
}

// Rend la source du fond selon son repeat mode. `cover` = expo-image
// contentFit cover (crop center, pas de déformation). `tile` = mosaïque
// avec count entier sur chaque axe pour rentrer pile.
function FondImage({
  def,
  themedSvgXml,
}: {
  def: FondDef;
  themedSvgXml?: string;
}) {
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };

  const repeat = def.repeat ?? 'cover';

  if (repeat === 'cover') {
    if (def.svgXml) {
      // SVG cover : preserveAspectRatio xMidYMid slice = crop center.
      // SvgXml ne propage pas la prop directement → on patch le markup pour
      // garantir slice (ne casse pas si déjà présent).
      const xml = themedSvgXml ?? def.svgXml;
      const patched = ensureSvgPreserveAspect(xml, 'xMidYMid slice');
      return (
        <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
          <SvgXml xml={patched} width="100%" height="100%" />
        </View>
      );
    }
    if (def.source) {
      return (
        <Image
          source={def.source}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
      );
    }
    return null;
  }

  // Tile : on rend la source à sa taille native (iw × ih) et on répète sur
  // chaque axe assez de tiles pour couvrir la surface. Le `overflow:hidden`
  // du parent clippe les tiles partiels au bord. La source n'est jamais
  // étirée — sémantique alignée sur CSS `background-repeat: repeat`.
  // Si la surface est plus petite qu'un tile (ex: barre fine + source carrée
  // 500×500), un seul tile partiel est rendu, sans déformation.
  const iw = def.imageSize?.width ?? 0;
  const ih = def.imageSize?.height ?? 0;
  if (size.w <= 0 || size.h <= 0 || iw <= 0 || ih <= 0) {
    return <View style={StyleSheet.absoluteFill} onLayout={onLayout} />;
  }

  const nx = Math.max(1, Math.ceil(size.w / iw));
  const ny = Math.max(1, Math.ceil(size.h / ih));

  const tiles: ReactNode[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      tiles.push(
        <View
          key={`${j}-${i}`}
          style={{
            position: 'absolute',
            left: i * iw,
            top: j * ih,
            width: iw,
            height: ih,
            overflow: 'hidden',
          }}>
          {def.svgXml ? (
            // viewBox SVG = iw × ih ; container = iw × ih → l'AR matche, le
            // default `xMidYMid meet` rend à taille native sans déformation.
            <SvgXml
              xml={themedSvgXml ?? def.svgXml}
              width={iw}
              height={ih}
            />
          ) : def.source ? (
            // Le container fait exactement iw × ih, donc `contentFit='fill'`
            // équivaut à un rendu natif (pas de scaling effectif).
            <Image
              source={def.source}
              contentFit="fill"
              style={StyleSheet.absoluteFill}
            />
          ) : null}
        </View>,
      );
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {tiles}
    </View>
  );
}

// Force / ajoute l'attribut preserveAspectRatio sur la balise <svg> racine.
// Nécessaire car `<SvgXml>` ne propage pas une prop équivalente : la valeur
// est lue depuis le markup.
function ensureSvgPreserveAspect(xml: string, value: string): string {
  return xml.replace(
    /<svg\b([^>]*)>/i,
    (_match, attrs: string) => {
      if (/preserveAspectRatio\s*=/.test(attrs)) {
        return `<svg${attrs.replace(
          /preserveAspectRatio\s*=\s*"[^"]*"/i,
          `preserveAspectRatio="${value}"`,
        )}>`;
      }
      return `<svg${attrs} preserveAspectRatio="${value}">`;
    },
  );
}
