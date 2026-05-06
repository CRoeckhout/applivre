import { isValidHex, normalizeHex } from '@/lib/theme/colors';
import { useEffect, useState } from 'react';
import {
  type GestureResponderEvent,
  KeyboardAvoidingView,
  type LayoutChangeEvent,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import WheelColorPicker from 'react-native-wheel-color-picker';

type Props = {
  open: boolean;
  initial: string;
  title: string;
  onClose: () => void;
  onChange: (hex: string) => void;
  // Active le contrôle d'opacité. Le hex retourné inclut l'alpha sur 8 chars
  // (#rrggbbaa) si l'opacité < 100%, sinon 6 chars (#rrggbb).
  withAlpha?: boolean;
};

// Sépare un hex 6 ou 8 chars en composantes rgb + alpha (0..1). Toute
// entrée invalide retombe sur un default neutre.
function parseColor(hex: string): { rgb: string; alpha: number } {
  const m = hex.replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(m)) return { rgb: m, alpha: 1 };
  if (/^[0-9a-fA-F]{8}$/.test(m)) {
    return {
      rgb: m.slice(0, 6),
      alpha: parseInt(m.slice(6, 8), 16) / 255,
    };
  }
  return { rgb: 'c27b52', alpha: 1 };
}

function alphaToHex(alpha: number): string {
  return Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
}

export function ColorPickerModal({
  open,
  initial,
  title,
  onClose,
  onChange,
  withAlpha,
}: Props) {
  const initialParsed = parseColor(initial);
  const [hexInput, setHexInput] = useState(initialParsed.rgb);
  const [wheelColor, setWheelColor] = useState('#' + initialParsed.rgb);
  const [alpha, setAlpha] = useState(initialParsed.alpha);

  useEffect(() => {
    if (open) {
      const p = parseColor(initial);
      setHexInput(p.rgb);
      setWheelColor('#' + p.rgb);
      setAlpha(p.alpha);
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
    if (!isValidHex(hexInput)) return;
    const rgb = normalizeHex(hexInput);
    if (withAlpha && alpha < 1) {
      onChange(rgb + alphaToHex(alpha));
    } else {
      onChange(rgb);
    }
    onClose();
  };

  const swatchColor =
    isValidHex(hexInput)
      ? withAlpha && alpha < 1
        ? normalizeHex(hexInput) + alphaToHex(alpha)
        : normalizeHex(hexInput)
      : wheelColor;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24 }}
        >
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
                  backgroundColor: swatchColor,
                  borderWidth: 1,
                  borderColor: 'rgba(107,98,89,0.3)',
                }}
              />
            </View>
          </View>

          {withAlpha ? (
            <View className="mt-4">
              <View className="mb-2 flex-row items-center justify-between">
                <Text className="text-xs uppercase tracking-wider text-ink-muted">
                  Opacité
                </Text>
                <Text className="font-sans-med text-ink">
                  {Math.round(alpha * 100)}%
                </Text>
              </View>
              <OpacitySlider
                value={alpha}
                onChange={setAlpha}
                trackColor={
                  isValidHex(hexInput) ? normalizeHex(hexInput) : '#c27b52'
                }
              />
            </View>
          ) : null}

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
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// Slider 0-100% horizontal réutilisable. Tap + drag : la position x du touch
// pilote la valeur. `trackColor` colorise la portion remplie (utile pour
// suggérer ce que la valeur affecte : couleur, fond image, etc.).
export function OpacitySlider({
  value,
  onChange,
  trackColor,
}: {
  value: number;
  onChange: (v: number) => void;
  trackColor: string;
}) {
  const [width, setWidth] = useState(0);

  const setFromTouch = (e: GestureResponderEvent) => {
    if (width <= 0) return;
    const x = e.nativeEvent.locationX;
    onChange(Math.max(0, Math.min(1, x / width)));
  };

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== width) setWidth(w);
  };

  return (
    <View
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderGrant={setFromTouch}
      onResponderMove={setFromTouch}
      style={{ height: 32, justifyContent: 'center' }}>
      <View
        style={{
          height: 10,
          borderRadius: 5,
          backgroundColor: 'rgba(107,98,89,0.2)',
          overflow: 'hidden',
        }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${value * 100}%`,
            backgroundColor: trackColor,
          }}
        />
      </View>
      {width > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: value * width - 10,
            top: 6,
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: '#fbf8f4',
            borderWidth: 2,
            borderColor: '#c27b52',
          }}
        />
      ) : null}
    </View>
  );
}
