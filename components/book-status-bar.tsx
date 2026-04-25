import type { ReadingStatus, UserBook } from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

type Action =
  | {
      kind: 'status';
      value: ReadingStatus;
      label: string;
      icon: keyof typeof MaterialIcons.glyphMap;
      color: string;
    }
  | {
      kind: 'favorite';
      label: string;
      icon: keyof typeof MaterialIcons.glyphMap;
      color: string;
    };

const ACTIONS: Action[] = [
  { kind: 'status', value: 'wishlist', label: 'Wishlist', icon: 'bookmark-border', color: '#d4a017' },
  { kind: 'status', value: 'to_read', label: 'À lire', icon: 'schedule', color: '#4a90c2' },
  { kind: 'status', value: 'reading', label: 'En cours', icon: 'auto-stories', color: '#8e5dc8' },
  { kind: 'status', value: 'read', label: 'Lu', icon: 'check-circle', color: '#5fa84d' },
  { kind: 'status', value: 'abandoned', label: 'Abandonné', icon: 'cancel', color: '#1f1a16' },
  { kind: 'favorite', label: "J'aime", icon: 'favorite', color: '#d4493e' },
];

type Props = {
  existing: UserBook | undefined;
  onStatusPress: (status: ReadingStatus) => void;
  onToggleFavorite: () => void;
};

export function BookStatusBar({ existing, onStatusPress, onToggleFavorite }: Props) {
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}
      className="px-3 pb-6">
      <View className="flex-row items-stretch justify-between">
        {ACTIONS.map((a) => {
          let active: boolean;
          let onPress: () => void;
          let disabled = false;
          let activeIcon = a.icon;

          if (a.kind === 'status') {
            active = existing?.status === a.value;
            onPress = () => {
              if (active) return; // rule: no-op when already active
              onStatusPress(a.value);
            };
            // Coeur plein quand favori actif — n/a ici
          } else {
            active = !!existing?.favorite;
            disabled = !existing;
            activeIcon = active ? 'favorite' : 'favorite-border';
            onPress = onToggleFavorite;
          }

          return (
            <Pressable
              key={a.kind === 'status' ? a.value : 'favorite'}
              onPress={onPress}
              disabled={disabled}
              style={{
                flex: 1,
                opacity: disabled ? 0.35 : 1,
                backgroundColor: active ? a.color : '#ffffff',
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowOffset: { width: 0, height: 2 },
                shadowRadius: 6,
                elevation: 3,
              }}
              className="mx-1 items-center justify-center rounded-full px-2 py-4 active:opacity-80">
              <MaterialIcons
                name={activeIcon}
                size={22}
                color={active ? '#fbf8f4' : a.color}
              />
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={{ color: active ? '#fbf8f4' : a.color }}
                className={`mt-1 text-[11px] ${active ? 'font-sans-med' : ''}`}>
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
