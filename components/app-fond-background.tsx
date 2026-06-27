import { FondLayer } from "@/components/fond-layer";
import { useThemeColors } from "@/hooks/use-theme-colors";
import { hexWithAlpha } from "@/lib/sheet-appearance";
import { hexToRgb, relativeLuminance } from "@/lib/theme/colors";
import { useAllFonds } from "@/store/fond-catalog";
import { usePreferences } from "@/store/preferences";
import { BlurView } from "expo-blur";
import { type ReactNode } from "react";
import { type StyleProp, StyleSheet, View, type ViewStyle } from "react-native";

// Le fond de l'APP (`appFondId`, indépendant du fond des cards `fondId`)
// remplit le fond derrière TOUS les écrans. Ce hook dit s'il est actif ET
// visible (un vrai fond image est sélectionné — pour 'none' ou un id sans
// visuel il n'y a rien à peindre, on reste sur le `colorBg` uni habituel).
export function useAppFondActive(): boolean {
  const appFondId = usePreferences((s) => s.appFondId);
  const allFonds = useAllFonds();
  if (!appFondId || appFondId === "none") return false;
  const def = allFonds.find((f) => f.id === appFondId);
  return !!(def && (def.source || def.svgXml));
}

// Classe de fond à poser sur la racine plein écran d'un écran. En temps
// normal `'bg-paper'` (couleur de page opaque) ; quand le fond remplit l'app,
// chaîne vide → la racine devient transparente et laisse voir
// `<AppFondBackground />` monté à la racine. À utiliser UNIQUEMENT sur les
// conteneurs plein écran, jamais sur les petits éléments `bg-paper` (cards,
// modales, pastilles…), qui doivent rester opaques.
export function usePaperScreenClass(): string {
  return useAppFondActive() ? "" : "bg-paper";
}

// Couche fond plein écran, montée une seule fois à la racine (cf.
// app/_layout.tsx), derrière toute la pile de navigation. Ne rend rien quand
// le mode n'est pas actif. Quand actif, les racines d'écran rendent leur fond
// `bg-paper` transparent (cf. usePaperScreenClass) pour laisser voir cette
// couche.
//
// On peint d'abord `colorBg` en base (le FondLayer image ne peint pas de
// couleur sous une image — ses pixels transparents laisseraient voir le vide
// derrière la pile), puis le fond image par-dessus.
export function AppFondBackground() {
  const active = useAppFondActive();
  const appFondId = usePreferences((s) => s.appFondId);
  const appFondOpacity = usePreferences((s) => s.appFondOpacity);
  const colorBg = usePreferences((s) => s.colorBg);

  if (!active) return null;

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundColor: colorBg }]}
    >
      <FondLayer
        bgColor={colorBg}
        fondId={appFondId}
        opacity={appFondOpacity}
      />
    </View>
  );
}

// Panel de lisibilité : sur un fond d'app, du contenu posé directement sur
// l'image devient illisible. On lui pose alors un panel en VERRE DÉPOLI
// (BlurView + teinte `paper` semi-transparente, arrondi) → le fond transparaît
// flouté derrière, le texte reste lisible. Sans fond d'app, c'est un simple
// `<View>` passthrough → layout d'origine inchangé.
//
// `className`/`style` s'appliquent TOUJOURS au conteneur externe (layout de
// base — ex. `mt-4 px-4` fournit la marge latérale qui laisse voir le fond
// autour du panel). `panelStyle` surcharge l'apparence du panel (radius…).
export function FondPanel({
  children,
  className,
  style,
  panelStyle,
}: {
  children: ReactNode;
  className?: string;
  style?: StyleProp<ViewStyle>;
  panelStyle?: StyleProp<ViewStyle>;
}) {
  const active = useAppFondActive();
  const theme = useThemeColors();

  if (!active) {
    return (
      <View className={className} style={style}>
        {children}
      </View>
    );
  }

  // Teinte du blur dérivée de la luminance du `paper` (sombre sur thème sombre).
  const paperRgb = hexToRgb(theme.paper);
  const tint = paperRgb && relativeLuminance(paperRgb) < 0.4 ? "dark" : "light";

  return (
    <View className={className} style={style}>
      <BlurView
        intensity={32}
        tint={tint}
        experimentalBlurMethod="dimezisBlurView"
        style={[{ borderRadius: 16, overflow: "hidden" }, panelStyle]}
      >
        {/* Teinte `paper` semi-transparente par-dessus le flou : donne la
            couleur de page et le contraste nécessaire à la lisibilité. */}
        <View
          style={{
            backgroundColor: hexWithAlpha(theme.paper, 0.55),
            padding: 16,
          }}
        >
          {children}
        </View>
      </BlurView>
    </View>
  );
}
