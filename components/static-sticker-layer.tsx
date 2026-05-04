// Variante statique de StickerLayer pour la fiche read-only. Aucune gesture,
// aucun reanimated shared value, aucun toolbar. Reproduit la fidélité visuelle
// du rendu d'origine en réutilisant exactement le même pipeline de résolution
// (catalog + applyTokens + STICKER_NATURAL_WIDTH + transform au centre).
//
// À garder synchronisé avec components/sticker.tsx :
//   - même naturalWidth × aspectRatio
//   - même formule de transform (translate au centre + scale + rotate)
//   - même résolution des tokens (svgXml ou source PNG)
// Si le rendu d'édition évolue, dupliquer ici.

import { useThemeColors } from "@/hooks/use-theme-colors";
import { applyTokens } from "@/lib/decorations/tokens";
import {
  STICKER_NATURAL_WIDTH,
  type StickerDef,
} from "@/lib/stickers/catalog";
import { usePreferences } from "@/store/preferences";
import { useAllStickers } from "@/store/sticker-catalog";
import type { PlacedSticker } from "@/types/book";
import { Image } from "expo-image";
import { useMemo, useState } from "react";
import {
  type LayoutChangeEvent,
  StyleSheet,
  View,
} from "react-native";
import { SvgXml } from "react-native-svg";

type LayerProps = {
  stickers: PlacedSticker[];
};

// Sibling de SheetSurface dans un wrapper position:relative ; bornes alignées
// sur la SheetSurface (les deux occupent la même cellule).
export function StaticStickerLayer({ stickers }: LayerProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.w || height !== size.h) setSize({ w: width, h: height });
  };
  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={StyleSheet.absoluteFill}
    >
      {size.w > 0 && size.h > 0
        ? stickers.map((p) => (
            <StaticSticker
              key={p.id}
              placement={p}
              layerWidth={size.w}
              layerHeight={size.h}
            />
          ))
        : null}
    </View>
  );
}

function StaticSticker({
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

  const naturalWidth = STICKER_NATURAL_WIDTH;
  const aspectRatio = def ? def.imageSize.height / def.imageSize.width : 1;
  const naturalHeight = naturalWidth * aspectRatio;

  if (!def) return null;

  const cx = placement.x * layerWidth;
  const cy = placement.y * layerHeight;

  return (
    <View
      style={[
        styles.sticker,
        { width: naturalWidth, height: naturalHeight },
        {
          transform: [
            { translateX: cx - naturalWidth / 2 },
            { translateY: cy - naturalHeight / 2 },
            { scale: placement.scale },
            { rotate: `${placement.rotation}rad` },
          ],
        },
      ]}
    >
      {def.svgXml ? (
        <SvgXml
          xml={themedSvgXml ?? def.svgXml}
          width="100%"
          height="100%"
        />
      ) : def.source ? (
        <Image
          source={def.source}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sticker: {
    position: "absolute",
    left: 0,
    top: 0,
  },
});
