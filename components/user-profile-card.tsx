import { useAuth } from '@/hooks/use-auth';
import { pickAndUploadAvatar } from '@/lib/avatar';
import { usePreferences } from '@/store/preferences';
import { useProfile } from '@/store/profile';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

export function UserProfileCard() {
  const { session } = useAuth();
  const avatarUrl = usePreferences((s) => s.avatarUrl);
  const setAvatarUrl = usePreferences((s) => s.setAvatarUrl);
  const username = useProfile((s) => s.username);
  const [uploading, setUploading] = useState(false);

  const email = session?.user.email ?? '';
  const displayName = username ? `@${username}` : email || 'Anonyme';
  const initialSource = username || email;
  const initial = initialSource ? initialSource[0].toUpperCase() : '?';
  const userId = session?.user.id;

  const onPressAvatar = async () => {
    if (!userId || uploading) return;
    setUploading(true);
    try {
      const url = await pickAndUploadAvatar(userId);
      if (url) setAvatarUrl(url);
    } catch (err) {
      Alert.alert(
        'Upload impossible',
        err instanceof Error ? err.message : 'Réessaye dans un instant.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <View className="mt-4 flex-row items-center gap-4 rounded-3xl bg-paper-warm p-5">
      <Pressable
        onPress={onPressAvatar}
        disabled={!userId || uploading}
        accessibilityLabel="Changer ma photo de profil"
        className="relative">
        {avatarUrl ? (
          <Image
            source={{ uri: avatarUrl }}
            style={{ width: 56, height: 56, borderRadius: 28 }}
            contentFit="cover"
            transition={180}
          />
        ) : (
          <View className="h-14 w-14 items-center justify-center rounded-full bg-accent">
            <Text className="font-display text-2xl text-paper">{initial}</Text>
          </View>
        )}

        {uploading ? (
          <View
            className="absolute inset-0 items-center justify-center rounded-full bg-ink/50"
            pointerEvents="none">
            <ActivityIndicator size="small" color="#fbf8f4" />
          </View>
        ) : (
          <View
            className="absolute -bottom-1 -right-1 h-6 w-6 items-center justify-center rounded-full bg-ink"
            pointerEvents="none">
            <MaterialIcons name="photo-camera" size={14} color="#fbf8f4" />
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
      </View>
    </View>
  );
}
