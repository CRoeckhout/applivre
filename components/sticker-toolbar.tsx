import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, View } from 'react-native';

type Props = {
  onDelete: () => void;
  onLayerUp: () => void;
  onLayerDown: () => void;
  // Désactive les boutons reorder quand on est aux bornes — visuel décourage
  // une action no-op mais laisse le tap (le store no-op aussi en cas de tap).
  canLayerUp: boolean;
  canLayerDown: boolean;
};

// Barre flottante affichée sous le sticker sélectionné. Le positionnement
// est entièrement piloté par le parent (StickerLayer via `Animated.View` +
// shared values), qui suit la transformation du sticker en temps réel. Le
// composant ici ne fait que rendre les pills.
export function StickerToolbar({
  onDelete,
  onLayerUp,
  onLayerDown,
  canLayerUp,
  canLayerDown,
}: Props) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(26, 20, 16, 0.92)',
        paddingHorizontal: 8,
        paddingVertical: 6,
        borderRadius: 999,
      }}>
      <ToolbarButton
        icon="arrow-downward"
        label="Arrière"
        onPress={onLayerDown}
        disabled={!canLayerDown}
      />
      <ToolbarButton
        icon="arrow-upward"
        label="Avant"
        onPress={onLayerUp}
        disabled={!canLayerUp}
      />
      <View style={{ width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.2)' }} />
      <ToolbarButton
        icon="delete-outline"
        label="Supprimer"
        onPress={onDelete}
        tone="danger"
      />
    </View>
  );
}

function ToolbarButton({
  icon,
  label,
  onPress,
  disabled,
  tone,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  const color = disabled
    ? 'rgba(255,255,255,0.35)'
    : tone === 'danger'
      ? '#f4a17e'
      : '#fbf8f4';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityLabel={label}
      style={{
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 18,
      }}
      android_ripple={{ color: 'rgba(255,255,255,0.15)', borderless: true }}>
      <MaterialIcons name={icon} size={20} color={color} />
    </Pressable>
  );
}
