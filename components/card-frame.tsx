import { CardFrameProvider } from '@/components/card-frame-context';
import { NineSliceFrame } from '@/components/nine-slice-frame';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { BORDERS, type BorderDef } from '@/lib/borders/catalog';
import { applyBorderTokens } from '@/lib/borders/tokens';
import { useBorderCatalog } from '@/store/border-catalog';
import { usePreferences } from '@/store/preferences';
import { ReactNode, useMemo } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

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
  style,
}: Props) {
  const fromPrefs = usePreferences((s) => s.borderId);
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const remote = useBorderCatalog((s) => s.remote);
  const theme = useThemeColors();

  const id = borderId ?? fromPrefs;
  const def: BorderDef | undefined = [...BORDERS, ...remote].find((b) => b.id === id);

  // Pour les cadres SVG : tokens DB = map `prefKey → sentinelHex`. Le SVG
  // contient les hex sentinelles literal (export Illustrator brut). Au
  // runtime on remplace chaque sentinel par la valeur courante du userPref
  // (colorPrimary / colorSecondary / colorBg). Mémoize sur les inputs
  // utiles uniquement.
  const themedSvgXml = useMemo(() => {
    if (!def?.svgXml) return undefined;
    return applyBorderTokens(
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

  if (!def || (!def.source && !def.svgXml) || !def.imageSize || !def.slice) {
    return <>{children}</>;
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
      innerBackgroundColor={innerBackgroundColor ?? theme.paperWarm}
      style={style}>
      <CardFrameProvider value={ctx}>{children}</CardFrameProvider>
    </NineSliceFrame>
  );
}
