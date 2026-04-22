import type { RatingIconKind } from '@/types/book';
import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

const COLORS: Record<RatingIconKind, string> = {
  star: '#c27b52',
  heart: '#d64d6f',
  chili: '#c8322a',
};

const LABELS: Record<RatingIconKind, string> = {
  star: 'Étoile',
  heart: 'Cœur',
  chili: 'Piment',
};

const ICON_KINDS: RatingIconKind[] = ['star', 'heart', 'chili'];

export function RatingIcon({
  kind,
  filled,
  size = 24,
}: {
  kind: RatingIconKind;
  filled: boolean;
  size?: number;
}) {
  const color = COLORS[kind];
  const opacity = filled ? 1 : 0.18;
  if (kind === 'star') {
    return <MaterialIcons name="star" size={size} color={color} style={{ opacity }} />;
  }
  if (kind === 'heart') {
    return <MaterialIcons name="favorite" size={size} color={color} style={{ opacity }} />;
  }
  return (
    <MaterialCommunityIcons name="chili-hot" size={size} color={color} style={{ opacity }} />
  );
}

type RatingRowProps = {
  kind: RatingIconKind;
  value: number;
  onChange: (value: number) => void;
  onRemove: () => void;
  size?: number;
};

export function RatingRow({ kind, value, onChange, onRemove, size = 26 }: RatingRowProps) {
  return (
    <View className="flex-row items-center gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => onChange(value === i ? i - 1 : i)}
          hitSlop={6}>
          <RatingIcon kind={kind} filled={value >= i} size={size} />
        </Pressable>
      ))}
      <Pressable onPress={onRemove} hitSlop={6} className="ml-auto">
        <Text className="text-xs text-ink-muted">retirer</Text>
      </Pressable>
    </View>
  );
}

export function AddRatingButtons({ onAdd }: { onAdd: (icon: RatingIconKind) => void }) {
  return (
    <View className="flex-row items-center gap-2">
      <Text className="text-xs uppercase tracking-wider text-ink-muted">Noter :</Text>
      {ICON_KINDS.map((icon) => (
        <Pressable
          key={icon}
          onPress={() => onAdd(icon)}
          accessibilityLabel={`Ajouter une note ${LABELS[icon].toLowerCase()}`}
          hitSlop={6}
          className="opacity-70 active:opacity-100">
          <RatingIcon kind={icon} filled size={20} />
        </Pressable>
      ))}
    </View>
  );
}
