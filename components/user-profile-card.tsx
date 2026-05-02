import { AvatarActionModal } from "@/components/avatar-action-modal";
import { AvatarFrame } from "@/components/avatar-frame";
import { AvatarFramePickerModal } from "@/components/avatar-frame-picker-modal";
import { useCardFrame } from "@/components/card-frame-context";
import { useAuth } from "@/hooks/use-auth";
import { pickAndUploadAvatar } from "@/lib/avatar";
import { usePreferences } from "@/store/preferences";
import { useProfile } from "@/store/profile";
import { MaterialIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { BadgeStrip } from "./badges/badge-strip";

const AVATAR_SIZE = 80;

export function UserProfileCard() {
  const { session } = useAuth();
  const avatarUrl = useProfile((s) => s.avatarUrl);
  const setAvatarUrl = useProfile((s) => s.setAvatarUrl);
  const username = useProfile((s) => s.username);
  const avatarFrameId = usePreferences((s) => s.avatarFrameId);
  const setAvatarFrameId = usePreferences((s) => s.setAvatarFrameId);
  const [uploading, setUploading] = useState(false);
  const [actionModalOpen, setActionModalOpen] = useState(false);
  const [framePickerOpen, setFramePickerOpen] = useState(false);
  const { inFrame, padding: framedPadding } = useCardFrame();
  // Cf. shortcut-card : padding natif quand pas de cadre.
  const useNaturalPadding = framedPadding === undefined;

  const email = session?.user.email ?? "";
  const displayName = username ? `@${username}` : email || "Anonyme";
  const initialSource = username || email;
  const initial = initialSource ? initialSource[0].toUpperCase() : "?";
  const userId = session?.user.id;

  const onPressAvatar = () => {
    if (!userId || uploading) return;
    setActionModalOpen(true);
  };

  const onPickPhoto = async () => {
    if (!userId || uploading) return;
    setUploading(true);
    try {
      const url = await pickAndUploadAvatar(userId);
      if (url) setAvatarUrl(url);
    } catch (err) {
      Alert.alert(
        "Upload impossible",
        err instanceof Error ? err.message : "Réessaye dans un instant.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <View
      className={`flex-row items-center gap-4 rounded-3xl ${useNaturalPadding ? "p-5" : ""} ${inFrame ? "" : "bg-paper-warm"}`}
      style={!useNaturalPadding ? { padding: framedPadding } : undefined}
    >
      <Pressable
        onPress={onPressAvatar}
        disabled={!userId || uploading}
        accessibilityLabel="Modifier ma photo de profil"
        className="relative"
      >
        <AvatarFrame size={AVATAR_SIZE} frameId={avatarFrameId}>
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={180}
            />
          ) : (
            <View className="h-full w-full items-center justify-center bg-accent">
              <Text className="font-display text-2xl text-paper">
                {initial}
              </Text>
            </View>
          )}
        </AvatarFrame>

        {uploading ? (
          <View
            className="absolute inset-0 items-center justify-center rounded-full bg-ink/50"
            pointerEvents="none"
          >
            <ActivityIndicator size="small" color="#fbf8f4" />
          </View>
        ) : (
          <View
            className="absolute -bottom-1 -right-1 h-6 w-6 items-center justify-center rounded-full bg-ink"
            pointerEvents="none"
          >
            <MaterialIcons name="edit" size={14} color="#fbf8f4" />
          </View>
        )}
      </Pressable>

      <View className="flex-1">
        <Text className="font-display text-lg text-ink" numberOfLines={1}>
          {displayName}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          <MaterialIcons name="verified" size={14} color="#c27b52" />
          <Text className="text-xs text-ink-muted" numberOfLines={1}>
            {email}
          </Text>
        </View>
        <BadgeStrip />
      </View>

      <AvatarActionModal
        open={actionModalOpen}
        onClose={() => setActionModalOpen(false)}
        onPickFrame={() => setFramePickerOpen(true)}
        onPickPhoto={onPickPhoto}
      />
      <AvatarFramePickerModal
        open={framePickerOpen}
        onClose={() => setFramePickerOpen(false)}
        onPick={(id) => setAvatarFrameId(id)}
        avatarUrl={avatarUrl}
        initial={initial}
        selectedFrameId={avatarFrameId}
      />
    </View>
  );
}
