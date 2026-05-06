// Petit chip "Premium" affiché à côté du username dans les zones d'identité
// publique (UserCard rich, FeedItemHeader). Cosmétique — la source de vérité
// est `profiles.is_premium`, exposée publiquement via get_public_profiles.
//
// Couleurs gold-on-paper hardcodées (hors thème user) — le chip doit garder
// son aspect "label premium" reconnaissable, indépendant des customizations.

import { hexWithAlpha } from "@/lib/sheet-appearance";
import { usePreferences } from "@/store/preferences";
import { MaterialIcons } from "@expo/vector-icons";
import { Text, View } from "react-native";

export function PremiumChip() {
  const themeInk = usePreferences((s) => s.colorSecondary);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: hexWithAlpha("#d4a017", 0.18),
        borderWidth: 1,
        borderColor: hexWithAlpha("#d4a017", 0.6),
      }}
    >
      <MaterialIcons name="star" size={12} color="#b8860b" />
      <Text
        style={{
          fontSize: 10,
          fontWeight: "600",
          color: hexWithAlpha(themeInk, 0.85),
        }}
      >
        Premium
      </Text>
    </View>
  );
}
