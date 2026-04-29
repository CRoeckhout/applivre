import type { ReadingStatus, UserBook } from "@/types/book";
import { MaterialIcons } from "@expo/vector-icons";
import { Platform, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Action =
  | {
      kind: "status";
      value: ReadingStatus;
      label: string;
      icon: keyof typeof MaterialIcons.glyphMap;
      color: string;
    }
  | {
      kind: "favorite";
      label: string;
      icon: keyof typeof MaterialIcons.glyphMap;
      color: string;
    };

const ACTIONS: Action[] = [
  {
    kind: "status",
    value: "wishlist",
    label: "Wishlist",
    icon: "bookmark-border",
    color: "#d4a017",
  },
  {
    kind: "status",
    value: "to_read",
    label: "À lire",
    icon: "schedule",
    color: "#4a90c2",
  },
  {
    kind: "status",
    value: "reading",
    label: "En cours",
    icon: "auto-stories",
    color: "#8e5dc8",
  },
  {
    kind: "status",
    value: "read",
    label: "Lu",
    icon: "check-circle",
    color: "#5fa84d",
  },
  {
    kind: "status",
    value: "abandoned",
    label: "Abandonné",
    icon: "cancel",
    color: "#1f1a16",
  },
  { kind: "favorite", label: "J'aime", icon: "favorite", color: "#d4493e" },
];

type Props = {
  existing: UserBook | undefined;
  onStatusPress: (status: ReadingStatus) => void;
  onToggleFavorite: () => void;
};

export function BookStatusBar({
  existing,
  onStatusPress,
  onToggleFavorite,
}: Props) {
  const insets = useSafeAreaInsets();
  const safeBottom =
    Platform.OS === "ios" ? Math.max(insets.bottom - 16, 4) : insets.bottom;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom: safeBottom }}
      className="px-3"
    >
      <View className="flex-row items-end justify-between">
        {ACTIONS.map((a) => {
          let active: boolean;
          let onPress: () => void;
          let disabled = false;
          let activeIcon = a.icon;
          let label = a.label;
          let color = a.color;
          let topBadge: string | null = null;

          if (a.kind === "status") {
            // Slot "En cours" mute en Pause/Reprendre selon l'état du livre.
            // Active visuel quand reading OU paused (cycle ouvert). Couleur dorée
            // pour distinguer du violet "à lire / en cours par défaut" : la pause
            // est un état d'attente, pas une lecture passive.
            if (a.value === "reading") {
              const status = existing?.status;
              if (status === "reading") {
                label = "Pause";
                activeIcon = "pause-circle-filled";
                active = true;
                color = "#d4a017";
                topBadge = "En cours";
                onPress = () => onStatusPress("paused");
              } else if (status === "paused") {
                label = "Reprendre";
                activeIcon = "play-circle-filled";
                active = true;
                topBadge = "En pause";
                onPress = () => onStatusPress("reading");
              } else {
                active = false;
                onPress = () => onStatusPress("reading");
              }
            } else {
              active = existing?.status === a.value;
              onPress = () => {
                if (active) return; // rule: no-op when already active
                onStatusPress(a.value);
              };
            }
            // Coeur plein quand favori actif — n/a ici
          } else {
            active = !!existing?.favorite;
            disabled = !existing;
            activeIcon = active ? "favorite" : "favorite-border";
            onPress = onToggleFavorite;
          }

          return (
            <View
              key={a.kind === "status" ? a.value : "favorite"}
              style={{ flex: 1 }}
            >
              {topBadge && (
                <Animated.View
                  entering={FadeInDown.duration(260)}
                  pointerEvents="none"
                  style={{
                    backgroundColor: "#ffffff",
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    paddingTop: 3,
                    paddingBottom: 38,
                    marginHorizontal: 4,
                    marginBottom: -34,
                    alignItems: "center",
                    shadowColor: "#000",
                    shadowOpacity: 0.08,
                    shadowOffset: { width: 0, height: -2 },
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  <Text
                    numberOfLines={1}
                    style={{ color, fontSize: 9 }}
                    className="font-sans-med"
                  >
                    {topBadge}
                  </Text>
                </Animated.View>
              )}
              <Pressable
                onPress={onPress}
                disabled={disabled}
                style={{
                  opacity: disabled ? 0.35 : 1,
                  backgroundColor: active ? color : "#ffffff",
                  shadowColor: "#000",
                  shadowOpacity: 0.12,
                  shadowOffset: { width: 0, height: 2 },
                  shadowRadius: 6,
                  elevation: 3,
                }}
                className="mx-1 items-center justify-center rounded-full px-2 py-4 active:opacity-80"
              >
                <MaterialIcons
                  name={activeIcon}
                  size={22}
                  color={active ? "#fbf8f4" : color}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  style={{ color: active ? "#fbf8f4" : color }}
                  className={`mt-1 text-[11px] ${active ? "font-sans-med" : ""}`}
                >
                  {label}
                </Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    </View>
  );
}
