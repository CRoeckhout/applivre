import { useCardFrame } from '@/components/card-frame-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

type Props = {
  title: string;
  subtitle: string;
  icon: React.ComponentProps<typeof MaterialIcons>['name'];
  onPress: () => void;
  onLongPress?: () => void;
  isDragging?: boolean;
};

export function ShortcutCard({
  title,
  subtitle,
  icon,
  onPress,
  onLongPress,
  isDragging = false,
}: Props) {
  const theme = useThemeColors();
  const { inFrame, padding: framedPadding } = useCardFrame();
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={280}
      className={`flex-row items-center gap-3 rounded-3xl ${inFrame ? '' : 'p-5'} ${
        isDragging
          ? 'bg-accent-pale'
          : inFrame
            ? 'active:opacity-80'
            : 'bg-paper-warm active:bg-paper-shade'
      }`}
      style={[
        inFrame ? { padding: framedPadding } : null,
        isDragging
          ? { shadowColor: '#1a1410', shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 }
          : null,
      ]}>
      <View className="h-12 w-12 items-center justify-center rounded-full bg-accent-pale">
        <MaterialIcons name={icon} size={24} color={theme.accentDeep} />
      </View>
      <View className="flex-1">
        <Text className="font-display text-lg text-ink">{title}</Text>
        <Text className="text-sm text-ink-soft">{subtitle}</Text>
      </View>
      <MaterialIcons
        name={isDragging ? 'drag-handle' : 'chevron-right'}
        size={24}
        color={theme.inkMuted}
      />
    </Pressable>
  );
}
