import { CardFrame } from '@/components/card-frame';
import { useCardFrame } from '@/components/card-frame-context';
import { FondLayer } from '@/components/fond-layer';
import { PERSO_BORDER_ID } from '@/lib/borders/catalog';
import { outerCardStyle } from '@/lib/sheet-appearance';
import { usePreferences } from '@/store/preferences';
import type { SheetAppearance } from '@/types/book';
import { type ReactNode, useMemo } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

type Props = {
  appearance: SheetAppearance;
  // Padding interne en mode Perso (legacy CSS). En mode catalog, ignoré :
  // c'est `def.cardPadding` qui pilote l'espacement.
  padding?: number;
  // Surcharges de tokens injectées par le parent selon le contexte de rendu.
  // Par défaut un cadre SVG résout ses tokens vers le thème user courant (via
  // applyTokens : userPref puis slots de thème) — c'est ce que promet l'éditeur
  // de cadre (« le cadre utilise les couleurs du thème »). Ainsi le token
  // `paper` épouse `theme.paper` = le fond de page `bg-paper`, et la matière
  // autour du tracé se fond dans son entourage. Un parent dont le wrapper n'est
  // PAS `theme.paper` (preview en modal, card sur surface paperWarm…) passe ici
  // un remap des tokens de fond vers sa propre couleur (cf.
  // makeFondTokenOverrides). Ordre de précédence (du plus faible au plus fort) :
  // cascade thème → tokenOverrides parent → frame.colorOverrides sauvés. Une
  // override explicite de l'utilisateur reste souveraine.
  tokenOverrides?: Record<string, string>;
  // Style additionnel sur le wrapper externe (margin, shadow, animation…).
  style?: StyleProp<ViewStyle>;
  // Désactive le rendu interne du FondLayer (mode Perso uniquement). Sert
  // au caller qui rend lui-même le fond via une couche externe (typt. un
  // SkiaSheetFondLayer en skiaUnderlay de SheetPinchZoom) — évite le
  // double-rendu pixelizé+crisp superposé. Le wrapper conserve son
  // `overflow: 'hidden'` et son `backgroundColor: undefined` car le fond
  // externe gère la peinture, mais on omet la <FondLayer> JSX.
  // Mode catalog (CardFrame) : ignoré, le fond y reste géré en interne par
  // CardFrame (porter le suppress là-bas est un chantier séparé).
  disableFond?: boolean;
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
export function SheetSurface({
  appearance,
  padding = 20,
  tokenOverrides,
  style,
  disableFond = false,
  children,
}: Props) {
  const { frame, fond, bgColor } = appearance;
  const isPerso = !frame.borderId || frame.borderId === PERSO_BORDER_ID;
  // `fond.fondId` peut être :
  //  - un id concret (ex. 'flowers') : ce fond.
  //  - 'none' : explicitement aucun fond.
  //  - undefined : non défini → on hérite du fond du thème user (prefs.fondId)
  //    pour préserver la rétro-compat des fiches/bingos pré-feature et matcher
  //    le comportement de `CardFrame`. Le customizer écrit toujours une valeur
  //    concrète (snapshot de prefs au clic du tile "Theme") pour que les
  //    futurs changements de thème n'affectent pas la fiche.
  const themeFondId = usePreferences((s) => s.fondId);
  const themeFondOpacity = usePreferences((s) => s.fondOpacity);
  const explicitFondId = fond?.fondId;
  const fondId = explicitFondId ?? themeFondId;
  const hasFond = !!fondId && fondId !== 'none';
  // Sémantique de l'opacité (alignée avec la valeur affichée par le slider
  // du customizer) :
  //  - `fond.opacity` posé → valeur littérale (l'utilisateur a draggé, indép.
  //    du thème) ;
  //  - `fond.opacity` absent + tile "Theme" actif (pas de fondId explicite OU
  //    fondId == themeFondId) → on suit l'opacité courante du thème (lazy
  //    inherit, comme on suit déjà son fondId par fallback) ;
  //  - `fond.opacity` absent + fondId explicite ≠ thème → 1.0 (default propre
  //    pour un fond choisi spécifiquement, sans réglage d'opacité).
  const isThemeActive = !explicitFondId || explicitFondId === themeFondId;
  const effectiveFondOpacity =
    fond?.opacity ?? (isThemeActive ? themeFondOpacity : 1);

  // Surcharges de tokens du cadre SVG. On NE mappe PAS les couleurs snapshotées
  // de l'appearance ici : le cadre doit résoudre ses tokens vers le thème user
  // courant (cf. applyTokens → userPref puis slots de thème), comme le promet
  // l'éditeur de cadre. C'est ce qui permet au token `paper` du cadre d'épouser
  // `theme.paper` (= le fond de page `bg-paper`) et donc à la matière autour du
  // tracé de se fondre dans la page, au lieu d'afficher un liseré à la `bgColor`
  // figée de la fiche. Ne priment que : le remap de contexte `tokenOverrides`
  // (parent dont le wrapper diffère de `theme.paper`) puis les
  // `frame.colorOverrides` explicites sauvés par l'utilisateur.
  const mergedOverrides = useMemo(
    () => ({
      ...(tokenOverrides ?? {}),
      ...(frame.colorOverrides ?? {}),
    }),
    [tokenOverrides, frame.colorOverrides],
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
        {!disableFond ? (
          <FondLayer
            bgColor={bgColor}
            fondId={fondId}
            colorOverrides={fond?.colorOverrides}
            opacity={effectiveFondOpacity}
          />
        ) : null}
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
  //     `applyTokens` qui le remplace au render par la couleur de thème
  //     correspondante (ou un override de contexte / explicite).
  return (
    <CardFrame
      borderId={frame.borderId}
      innerBackgroundColor={bgColor}
      colorOverrides={mergedOverrides}
      fondId={fondId}
      fondColorOverrides={fond?.colorOverrides}
      fondOpacity={effectiveFondOpacity}
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
