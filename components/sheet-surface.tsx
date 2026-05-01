import { CardFrame } from '@/components/card-frame';
import { useCardFrame } from '@/components/card-frame-context';
import { FondLayer } from '@/components/fond-layer';
import { PERSO_BORDER_ID } from '@/lib/borders/catalog';
import { outerCardStyle } from '@/lib/sheet-appearance';
import type { SheetAppearance } from '@/types/book';
import { type ReactNode, useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

type Props = {
  appearance: SheetAppearance;
  // Padding interne en mode Perso (legacy CSS). En mode catalog, ignoré :
  // c'est `def.cardPadding` qui pilote l'espacement.
  padding?: number;
  // Style additionnel sur le wrapper externe (margin, shadow, animation…).
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

// Wrapper du contenu d'une fiche de lecture. Décide entre :
// - rendu CSS legacy (border solid/dashed/dotted/double + radius + width +
//   color modulables) quand `frame.borderId` vaut `PERSO_BORDER_ID` ou est
//   absent ;
// - rendu via CardFrame (cadre PNG ou SVG du catalog server) sinon — les
//   couleurs SVG sont surchargeables per-fiche via `frame.colorOverrides`.
//
// Un fond image (`appearance.fond`) est rendu en couche absolue derrière
// le contenu, dans la zone bgInsets quand un cadre catalog est actif.
export function SheetSurface({ appearance, padding = 20, style, children }: Props) {
  const { frame, fond, bgColor, textColor, mutedColor, accentColor } = appearance;
  const isPerso = !frame.borderId || frame.borderId === PERSO_BORDER_ID;
  const fondId = fond?.fondId;
  const hasFond = !!fondId && fondId !== 'none';

  // Mappe les 4 couleurs snapshotées de l'appearance sur les noms de tokens
  // les plus communs côté cadres (slots de theme + names de userPref). Ainsi
  // un cadre SVG dont les tokens référencent `paperWarm`, `ink`, `accent`,
  // `colorBg`, etc. utilise la couleur figée de la fiche au lieu du thème
  // user courant. Les `frame.colorOverrides` explicites passent par-dessus.
  const appearanceOverrides = useMemo<Record<string, string>>(
    () => ({
      // Bg variants
      paper: bgColor,
      paperWarm: bgColor,
      paperShade: bgColor,
      bgColor,
      colorBg: bgColor,
      // Text / ink variants
      ink: textColor,
      inkSoft: textColor,
      inkMuted: mutedColor,
      textColor,
      mutedColor,
      // Accent variants
      accent: accentColor,
      accentDeep: accentColor,
      accentPale: accentColor,
      accentColor,
      colorPrimary: accentColor,
    }),
    [bgColor, textColor, mutedColor, accentColor],
  );

  const mergedOverrides = useMemo(
    () => ({ ...appearanceOverrides, ...(frame.colorOverrides ?? {}) }),
    [appearanceOverrides, frame.colorOverrides],
  );

  if (isPerso) {
    // Mode perso : on garde le style CSS legacy (border + radius) sur le
    // wrapper. Le `backgroundColor: bgColor` issu d'`outerCardStyle` est
    // désactivé quand un fond image est actif — la surface est alors
    // entièrement définie par le fond. `overflow:hidden` est requis pour
    // clipper le fond au radius.
    const baseStyle = outerCardStyle(appearance, padding);
    if (!hasFond) {
      return <View style={[baseStyle, style]}>{children}</View>;
    }
    return (
      <View
        style={[baseStyle, { backgroundColor: undefined, overflow: 'hidden' }, style]}>
        <FondLayer
          bgColor={bgColor}
          fondId={fondId}
          colorOverrides={fond?.colorOverrides}
        />
        {children}
      </View>
    );
  }

  // Pas de `backgroundColor` sur le wrapper externe : toute zone transparente
  // du cadre (y compris la marge externe entre le contour dessiné et le bord
  // du rectangle alloué) afficherait sinon la couleur snapshotée et déborderait
  // du contour visible. Le fond visible derrière le cadre vient de :
  //  1. L'inner bg View bornée par `bgInsets` (couvre la zone intérieure
  //     transparente entre l'encre extérieure du cadre et le contenu).
  //  2. Pour les SVG : un path/rect de fond DANS le SVG lui-même, peint avec
  //     un hex sentinel mappé à `colorBg`/`paperWarm` via les tokens — c'est
  //     `applyBorderTokens` (avec `appearanceOverrides`) qui remplace au render.
  return (
    <CardFrame
      borderId={frame.borderId}
      innerBackgroundColor={bgColor}
      colorOverrides={mergedOverrides}
      fondId={fondId}
      fondColorOverrides={fond?.colorOverrides}
      style={style}>
      <FramedSheetContent>{children}</FramedSheetContent>
    </CardFrame>
  );
}

// Wrapper interne qui lit le `card_padding` du cadre via CardFrameContext
// et l'applique en padding aux children (le contenu de la fiche). Les
// composants cards de la home consomment ce contexte eux-mêmes ; pour les
// fiches le contenu est inline (pas un composant card), donc on applique
// le padding ici à la racine du contenu plutôt que sur chaque section.
function FramedSheetContent({ children }: { children: ReactNode }) {
  const { padding } = useCardFrame();
  return <View style={{ padding }}>{children}</View>;
}
