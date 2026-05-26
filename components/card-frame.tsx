import { CardFrameProvider } from '@/components/card-frame-context';
import { FondLayer } from '@/components/fond-layer';
import { NineSliceFrame } from '@/components/nine-slice-frame';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { BorderDef } from '@/lib/borders/catalog';
import { applyTokens } from '@/lib/decorations/tokens';
import { useAllBorders } from '@/store/border-catalog';
import { usePreferences } from '@/store/preferences';
import { ReactNode, useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

// Border radius des cards de la home (= `rounded-3xl` Tailwind, soit 1.5rem
// = 24px). Appliqué au wrapper en mode fond-only pour que la couche image
// soit clippée à la même forme que `bg-paper-warm` aurait dessinée.
const FOND_ONLY_WRAPPER: ViewStyle = { borderRadius: 24, overflow: 'hidden' };

type Props = {
  children: ReactNode;
  // Override le borderId courant (utile pour previews dans la perso).
  borderId?: string;
  // Couleur de fond rendue derrière le cadre. Default = theme.paperWarm
  // (utilisé par les cards de la home). Les fiches de lecture passent
  // `appearance.bgColor` pour matcher la couleur de la fiche.
  innerBackgroundColor?: string;
  // Color overrides à appliquer à la résolution des tokens SVG (priorité
  // sur userPrefs et theme). Permet une override per-instance.
  colorOverrides?: Record<string, string>;
  // Override le fondId courant (preferences.fondId par défaut). 'none' /
  // absent ⇒ pas de fond image, seul `innerBackgroundColor` est rendu.
  fondId?: string;
  // Color overrides per-instance pour les SVG du fond (mêmes règles que
  // `colorOverrides`). Indépendant des overrides cadre.
  fondColorOverrides?: Record<string, string>;
  // Opacité 0..1 de la couche image fond. `undefined` ⇒ 1 (opaque).
  fondOpacity?: number;
  style?: StyleProp<ViewStyle>;
};

// Wrapper conditionnel : applique le NineSliceFrame correspondant au borderId
// (depuis prefs user ou override). Passthrough si 'none' / inconnu / non
// dispo dans le catalog du user (default-pour-tous ou unlocked).
export function CardFrame({
  children,
  borderId,
  innerBackgroundColor,
  colorOverrides,
  fondId,
  fondColorOverrides,
  fondOpacity,
  style,
}: Props) {
  const fromPrefs = usePreferences((s) => s.borderId);
  const fondFromPrefs = usePreferences((s) => s.fondId);
  const fondOpacityFromPrefs = usePreferences((s) => s.fondOpacity);
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const allBorders = useAllBorders();
  const theme = useThemeColors();

  const id = borderId ?? fromPrefs;
  const def: BorderDef | undefined = allBorders.find((b) => b.id === id);
  const effectiveFondId = fondId ?? fondFromPrefs;
  // L'opacité du fond suit la même logique de fallback que `fondId` : si le
  // caller n'en passe pas, on hérite de la préférence globale du thème.
  const effectiveFondOpacity = fondOpacity ?? fondOpacityFromPrefs;
  const bgColor = innerBackgroundColor ?? theme.paperWarm;
  const hasFond = !!effectiveFondId && effectiveFondId !== 'none';
  const isSvgCadre = !!def?.svgXml;

  // Pour les cadres SVG : tokens DB = map `prefKey → sentinelHex`. Le SVG
  // contient les hex sentinelles literal (export Illustrator brut). Au
  // runtime on remplace chaque sentinel par la valeur courante du userPref
  // (colorPrimary / colorSecondary / colorBg). Mémoize sur les inputs
  // utiles uniquement. Aucune réécriture des tokens "fond" : le SVG peut
  // utiliser `paper` pour les zones qui doivent blender avec l'extérieur
  // (page bg) ; la couleur du contenu intérieur est posée séparément via
  // `backgroundColor` sur la View wrapper du NineSliceFrame.
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

  // Pas de cadre catalog → soit un fond seul (View overflow:hidden + FondLayer
  // + children), soit passthrough complet si pas de fond non plus.
  if (!def || (!def.source && !def.svgXml) || !def.imageSize || !def.slice) {
    if (!hasFond) return <>{children}</>;
    // FondLayer remplit le wrapper (absolute fill). Children par-dessus via
    // un sibling — le wrapper clippe via `overflow:hidden` + `borderRadius`
    // pour matcher la forme arrondie de la card. On signale `inFrame=true`
    // aux cards pour qu'elles neutralisent leur background hardcodé (sinon
    // il masquerait le fond) ; `padding=undefined` ⇒ elles conservent leur
    // padding CSS natif, ce qui aligne le fond image sur la même zone que
    // celle qu'occupait le `bg-paper-warm`.
    const fondCtx = { inFrame: true, padding: undefined };
    return (
      <View style={[FOND_ONLY_WRAPPER, style]}>
        <FondLayer
          bgColor={bgColor}
          fondId={effectiveFondId}
          colorOverrides={fondColorOverrides}
          opacity={effectiveFondOpacity}
        />
        <CardFrameProvider value={fondCtx}>{children}</CardFrameProvider>
      </View>
    );
  }

  // Cadre actif : on signale aux cards via context qu'elles doivent
  // neutraliser leur padding hardcodé. La valeur appliquée est définie
  // par le cadre lui-même (`def.cardPadding`) ou 0 par default.
  const ctx = { inFrame: true, padding: def.cardPadding ?? 0 };

  return (
    <NineSliceFrame
      source={def.source}
      svgXml={themedSvgXml}
      imageSize={def.imageSize}
      slice={def.slice}
      padding={def.padding}
      bgInsets={def.bgInsets}
      repeat={def.repeat}
      sliceExtras={def.sliceExtras}
      fillCenter={false}
      // Sans fond image : `bgColor` peint dans la zone `bgInsets` du cadre
      // (= la zone "intérieure" définie par l'admin). Au-delà de bgInsets,
      // pas de peinture — toute zone naturellement transparente du SVG/PNG
      // laisse passer le parent (page bg). Les paths SVG mappés sur `paper`
      // peignent par-dessus pour les cadres qui veulent simuler la couleur
      // de la page autour du tracé.
      // AVEC fond image : on pose quand même un backing `theme.paper` (=
      // couleur du bord du cadre / de la page) derrière le fond. Il remplit le
      // liseré de 1px que l'inset du fond laisse au bord bas/droit (cf.
      // NineSliceFrame), donc le bord ne révèle ni le fond ni la couche encore
      // en dessous (bgColor du pinch-zoom…). Invisible : les zones transparentes
      // du fond montraient déjà la page (= theme.paper).
      innerBackgroundColor={hasFond ? theme.paper : bgColor}
      innerBackground={
        hasFond ? (
          <FondLayer
            bgColor={bgColor}
            fondId={effectiveFondId}
            colorOverrides={fondColorOverrides}
            opacity={effectiveFondOpacity}
          />
        ) : undefined
      }
      // Étendue de la couche de fond (couleur ou image) :
      //  - PNG (`'insets'`) : bornée par bgInsets. Les coins arrondis
      //    alpha-transparents du PNG ne se font pas envahir par la couleur
      //    intérieure ou par le fond image.
      //  - SVG (`'full'`) : couvre toute la box du cadre. Le SVG gère
      //    lui-même son extérieur (paths mappés sur `paper` pour blender
      //    avec la page), donc le fond peut s'étendre derrière sans
      //    déborder visuellement — les paths SVG opaques le masquent où
      //    nécessaire. Les zones naturellement transparentes du SVG (typt.
      //    l'intérieur du cadre) laissent le fond apparaître.
      innerBackgroundCover={isSvgCadre ? 'full' : 'insets'}
      style={style}>
      <CardFrameProvider value={ctx}>{children}</CardFrameProvider>
    </NineSliceFrame>
  );
}
