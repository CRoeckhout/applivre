import { CardFrameProvider } from '@/components/card-frame-context';
import { FondLayer } from '@/components/fond-layer';
import { NineSliceFrame } from '@/components/nine-slice-frame';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { BORDERS, type BorderDef } from '@/lib/borders/catalog';
import { applyTokens } from '@/lib/decorations/tokens';
import { useBorderCatalog } from '@/store/border-catalog';
import { usePreferences } from '@/store/preferences';
import { ReactNode, useMemo } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

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
  style,
}: Props) {
  const fromPrefs = usePreferences((s) => s.borderId);
  const fondFromPrefs = usePreferences((s) => s.fondId);
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const remote = useBorderCatalog((s) => s.remote);
  const theme = useThemeColors();

  const id = borderId ?? fromPrefs;
  const def: BorderDef | undefined = [...BORDERS, ...remote].find((b) => b.id === id);
  const effectiveFondId = fondId ?? fondFromPrefs;
  const bgColor = innerBackgroundColor ?? theme.paperWarm;
  const hasFond = !!effectiveFondId && effectiveFondId !== 'none';

  // Pour les cadres SVG : tokens DB = map `prefKey → sentinelHex`. Le SVG
  // contient les hex sentinelles literal (export Illustrator brut). Au
  // runtime on remplace chaque sentinel par la valeur courante du userPref
  // (colorPrimary / colorSecondary / colorBg). Mémoize sur les inputs
  // utiles uniquement.
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
    // un sibling — le wrapper doit clipper. On signale `inFrame=true` aux
    // cards pour qu'elles neutralisent leur bg-paper-warm hardcodé (sinon
    // il masquerait le fond) ; padding=0 car pas de cadre qui dicte.
    const fondCtx = { inFrame: true, padding: 0 };
    return (
      <View style={[{ overflow: 'hidden' }, style]}>
        <FondLayer
          bgColor={bgColor}
          fondId={effectiveFondId}
          colorOverrides={fondColorOverrides}
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
      fillCenter={false}
      innerBackgroundColor={hasFond ? undefined : bgColor}
      innerBackground={
        hasFond ? (
          <FondLayer
            bgColor={bgColor}
            fondId={effectiveFondId}
            colorOverrides={fondColorOverrides}
          />
        ) : undefined
      }
      style={style}>
      <CardFrameProvider value={ctx}>{children}</CardFrameProvider>
    </NineSliceFrame>
  );
}
