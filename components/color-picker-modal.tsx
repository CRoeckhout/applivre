import { isValidHex, normalizeHex } from '@/lib/theme/colors';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import WheelColorPicker from 'react-native-wheel-color-picker';

type Props = {
  open: boolean;
  initial: string;
  title: string;
  onClose: () => void;
  onChange: (hex: string) => void;
};

export function ColorPickerModal({ open, initial, title, onClose, onChange }: Props) {
  const [hexInput, setHexInput] = useState(initial.replace('#', ''));
  const [wheelColor, setWheelColor] = useState(initial);

  useEffect(() => {
    if (open) {
      setHexInput(initial.replace('#', ''));
      setWheelColor(initial);
    }
  }, [open, initial]);

  const onWheelComplete = (color: string) => {
    const clean = color.length >= 7 ? color.slice(0, 7) : color;
    setWheelColor(clean);
    setHexInput(clean.replace('#', ''));
  };

  const onHexChange = (v: string) => {
    const clean = v.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
    setHexInput(clean);
    if (isValidHex(clean)) {
      setWheelColor(normalizeHex(clean));
    }
  };

  const onValidate = () => {
    if (isValidHex(hexInput)) {
      onChange(normalizeHex(hexInput));
      onClose();
    }
  };

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60 px-6"
        style={{ justifyContent: 'center' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-3xl bg-paper p-5">
          <Text className="font-display text-xl text-ink">{title}</Text>

          <View style={{ height: 280, marginTop: 16 }}>
            <WheelColorPicker
              color={wheelColor}
              onColorChangeComplete={onWheelComplete}
              thumbSize={28}
              sliderSize={24}
              swatches={false}
              noSnap
              row={false}
              useNativeDriver={false}
              useNativeLayout={false}
            />
          </View>

          <View className="mt-4">
            <Text className="mb-2 text-xs uppercase tracking-wider text-ink-muted">Hex</Text>
            <View className="flex-row items-center gap-3 rounded-2xl bg-paper-warm px-4 py-3">
              <Text className="text-ink-muted">#</Text>
              <TextInput
                value={hexInput}
                onChangeText={onHexChange}
                placeholder="c27b52"
                placeholderTextColor="rgb(107 98 89)"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 text-base text-ink"
              />
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isValidHex(hexInput) ? normalizeHex(hexInput) : wheelColor,
                  borderWidth: 1,
                  borderColor: 'rgba(107,98,89,0.3)',
                }}
              />
            </View>
          </View>

          <View className="mt-5 flex-row gap-2">
            <Pressable
              onPress={onClose}
              className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
            <Pressable
              onPress={onValidate}
              disabled={!isValidHex(hexInput)}
              className={`flex-1 rounded-full py-3 ${
                isValidHex(hexInput) ? 'bg-accent active:opacity-80' : 'bg-paper-shade'
              }`}>
              <Text
                className={`text-center font-sans-med ${
                  isValidHex(hexInput) ? 'text-paper' : 'text-ink-muted'
                }`}>
                Valider
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
