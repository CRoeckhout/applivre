import { ColorPickerModal } from '@/components/color-picker-modal';
import { FondLayer } from '@/components/fond-layer';
import { NineSliceFrame } from '@/components/nine-slice-frame';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { type BorderDef } from '@/lib/borders/catalog';
import { applyTokens } from '@/lib/decorations/tokens';
import { type FondDef } from '@/lib/fonds/catalog';
import { FONTS, type FontId } from '@/lib/theme/fonts';
import { THEMES, customThemeId, type CustomTheme } from '@/lib/theme/themes';
import { useAllBorders } from '@/store/border-catalog';
import { useAllFonds } from '@/store/fond-catalog';
import { usePersonalization } from '@/store/personalization';
import { usePreferences } from '@/store/preferences';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Tab = 'theme' | 'font' | 'color';

type ColorTarget = 'primary' | 'secondary' | 'bg' | null;

export function PersonalizationSheet() {
  const isOpen = usePersonalization((s) => s.isOpen);
  const close = usePersonalization((s) => s.close);
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('theme');
  const [colorTarget, setColorTarget] = useState<ColorTarget>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  const themeId = usePreferences((s) => s.themeId);
  const fontId = usePreferences((s) => s.fontId);
  const primary = usePreferences((s) => s.colorPrimary);
  const secondary = usePreferences((s) => s.colorSecondary);
  const bg = usePreferences((s) => s.colorBg);
  const customThemes = usePreferences((s) => s.customThemes);
  const borderId = usePreferences((s) => s.borderId);
  const setBorderId = usePreferences((s) => s.setBorderId);
  const fondId = usePreferences((s) => s.fondId);
  const setFondId = usePreferences((s) => s.setFondId);
  const applyTheme = usePreferences((s) => s.applyTheme);
  const setFontId = usePreferences((s) => s.setFontId);
  const setPrimary = usePreferences((s) => s.setColorPrimary);
  const setSecondary = usePreferences((s) => s.setColorSecondary);
  const setBg = usePreferences((s) => s.setColorBg);
  const saveCurrentAsCustomTheme = usePreferences((s) => s.saveCurrentAsCustomTheme);
  const deleteCustomTheme = usePreferences((s) => s.deleteCustomTheme);
  const resetToDefaults = usePreferences((s) => s.resetToDefaults);

  if (!isOpen) return null;

  const tabBarHeight = 49 + insets.bottom;

  const pickerInitial =
    colorTarget === 'primary' ? primary : colorTarget === 'secondary' ? secondary : bg;
  const pickerTitle =
    colorTarget === 'primary'
      ? 'Couleur primaire'
      : colorTarget === 'secondary'
        ? 'Couleur secondaire'
        : 'Couleur de fond';
  const pickerSetter =
    colorTarget === 'primary' ? setPrimary : colorTarget === 'secondary' ? setSecondary : setBg;

  const confirmDeleteCustom = (t: CustomTheme) => {
    Alert.alert(
      'Supprimer ce thème ?',
      `"${t.label}" sera retiré de tes thèmes.`,
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: () => deleteCustomTheme(t.id) },
      ],
    );
  };

  return (
    <>
      <Animated.View
        entering={FadeInDown.duration(220)}
        exiting={FadeOutDown.duration(180)}
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: tabBarHeight,
        }}>
        <View className="mx-3 overflow-hidden rounded-3xl bg-paper shadow-lg" style={{ elevation: 8 }}>
          <View className="flex-row items-center justify-between border-b border-paper-warm px-5 py-3">
            <Text className="font-display text-lg text-ink">Personnalisation</Text>
            <Pressable
              onPress={close}
              hitSlop={8}
              className="h-8 w-8 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
              <MaterialIcons name="close" size={18} color="rgb(107 98 89)" />
            </Pressable>
          </View>

          <View className="flex-row gap-1 px-5 pt-3">
            <TabButton label="Thème" active={tab === 'theme'} onPress={() => setTab('theme')} />
            <TabButton label="Police" active={tab === 'font'} onPress={() => setTab('font')} />
            <TabButton label="Couleurs" active={tab === 'color'} onPress={() => setTab('color')} />
          </View>

          <ScrollView
            horizontal={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={{ maxHeight: tab === 'theme' ? 360 : 260 }}
            contentContainerStyle={
              tab === 'theme'
                ? { paddingVertical: 16, gap: 14 }
                : { paddingHorizontal: 20, paddingVertical: 16, gap: 10 }
            }>
            {tab === 'theme' && (
              <>
                <SectionLabel>Thèmes</SectionLabel>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                  <SaveThemeCard onPress={() => setSaveOpen(true)} />
                  {customThemes.map((t) => (
                    <ThemeCard
                      key={`custom-${t.id}`}
                      label={t.label}
                      description="Thème personnel"
                      primary={t.primary}
                      secondary={t.secondary}
                      bg={t.bg}
                      active={customThemeId(t.id) === themeId}
                      isCustom
                      onPress={() => applyTheme(customThemeId(t.id))}
                      onLongPress={() => confirmDeleteCustom(t)}
                    />
                  ))}
                  {THEMES.map((t) => (
                    <ThemeCard
                      key={t.id}
                      label={t.label}
                      description={t.description}
                      primary={t.primary}
                      secondary={t.secondary}
                      bg={t.bg}
                      active={t.id === themeId}
                      onPress={() => applyTheme(t.id)}
                    />
                  ))}
                </ScrollView>

                <SectionLabel>Cadres</SectionLabel>
                <BordersRow borderId={borderId} setBorderId={setBorderId} />

                <SectionLabel>Fonds</SectionLabel>
                <FondsRow fondId={fondId} setFondId={setFondId} />
              </>
            )}

            {tab === 'font' &&
              FONTS.map((f) => (
                <FontRow
                  key={f.id}
                  id={f.id}
                  label={f.label}
                  hint={f.hint}
                  sample={f.sample}
                  family={f.variants.display}
                  active={f.id === fontId}
                  onPress={() => setFontId(f.id)}
                />
              ))}

            {tab === 'color' && (
              <>
                <ColorRow
                  label="Primaire"
                  hex={primary}
                  onPress={() => setColorTarget('primary')}
                />
                <ColorRow
                  label="Secondaire"
                  hex={secondary}
                  onPress={() => setColorTarget('secondary')}
                />
                <ColorRow label="Fond" hex={bg} onPress={() => setColorTarget('bg')} />
                <Pressable
                  onPress={() => setSaveOpen(true)}
                  className="mt-2 rounded-2xl bg-accent py-3 active:opacity-80">
                  <Text className="text-center font-sans-med text-paper">
                    Enregistrer comme thème
                  </Text>
                </Pressable>
              </>
            )}
          </ScrollView>

          <View className="flex-row border-t border-paper-warm px-5 py-3">
            <Pressable onPress={resetToDefaults} className="flex-1 py-1 active:opacity-60">
              <Text className="text-center text-xs text-ink-muted">Rétablir par défaut</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>

      <ColorPickerModal
        open={colorTarget !== null}
        initial={pickerInitial}
        title={pickerTitle}
        onClose={() => setColorTarget(null)}
        onChange={(hex) => pickerSetter(hex)}
      />

      <SaveThemeModal
        open={saveOpen}
        fontId={fontId}
        primary={primary}
        secondary={secondary}
        bg={bg}
        onClose={() => setSaveOpen(false)}
        onSave={(label) => {
          saveCurrentAsCustomTheme(label);
          setSaveOpen(false);
        }}
      />
    </>
  );
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 rounded-full px-3 py-2 ${active ? 'bg-accent' : 'bg-paper-warm'}`}>
      <Text
        className={`text-center text-sm ${
          active ? 'font-sans-med text-paper' : 'text-ink-soft'
        }`}>
        {label}
      </Text>
    </Pressable>
  );
}

function ThemeCard({
  label,
  description,
  primary,
  secondary,
  bg,
  active,
  isCustom,
  onPress,
  onLongPress,
}: {
  label: string;
  description: string;
  primary: string;
  secondary: string;
  bg: string;
  active: boolean;
  isCustom?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{
        width: 140,
        borderWidth: active ? 2 : 1,
        borderColor: active ? '#c27b52' : 'rgba(107,98,89,0.2)',
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: bg,
      }}>
      <View style={{ padding: 12 }}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: primary }} />
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: secondary }} />
          {isCustom && (
            <View style={{ marginLeft: 'auto' }}>
              <MaterialIcons name="person" size={14} color={secondary} />
            </View>
          )}
        </View>
        <Text
          numberOfLines={1}
          style={{ marginTop: 10, fontSize: 14, fontWeight: '600', color: secondary }}>
          {label}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 11, color: secondary, opacity: 0.7 }}>
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

function SaveThemeCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 140,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(107,98,89,0.5)',
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}>
      <MaterialIcons name="add-circle-outline" size={28} color="rgb(155 90 56)" />
      <Text
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: '600',
          color: 'rgb(58 50 43)',
          textAlign: 'center',
        }}>
        Enregistrer
      </Text>
      <Text
        style={{
          marginTop: 2,
          fontSize: 11,
          color: 'rgb(107 98 89)',
          textAlign: 'center',
        }}>
        Sélection actuelle
      </Text>
    </Pressable>
  );
}

function FontRow({
  label,
  hint,
  sample,
  family,
  active,
  onPress,
}: {
  id: FontId;
  label: string;
  hint: string;
  sample: string;
  family: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between rounded-2xl px-4 py-3 ${
        active ? 'bg-accent-pale' : 'bg-paper-warm'
      }`}>
      <View className="flex-1">
        <Text className="text-xs uppercase tracking-wider text-ink-muted">{label}</Text>
        <Text style={{ fontFamily: family, fontSize: 24, color: 'rgb(26 20 16)', marginTop: 2 }}>
          {sample}
        </Text>
        <Text className="text-xs text-ink-muted">{hint}</Text>
      </View>
      {active && <MaterialIcons name="check-circle" size={22} color="rgb(155 90 56)" />}
    </Pressable>
  );
}

function ColorRow({
  label,
  hex,
  onPress,
}: {
  label: string;
  hex: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3 active:bg-paper-shade">
      <View>
        <Text className="text-xs uppercase tracking-wider text-ink-muted">{label}</Text>
        <Text className="mt-1 font-sans-med text-ink">{hex.toUpperCase()}</Text>
      </View>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: hex,
          borderWidth: 1,
          borderColor: 'rgba(107,98,89,0.3)',
        }}
      />
    </Pressable>
  );
}

function SaveThemeModal({
  open,
  fontId,
  primary,
  secondary,
  bg,
  onClose,
  onSave,
}: {
  open: boolean;
  fontId: FontId;
  primary: string;
  secondary: string;
  bg: string;
  onClose: () => void;
  onSave: (label: string) => void;
}) {
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (open) setLabel('');
  }, [open]);

  const canSave = label.trim().length > 0;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        className="flex-1 bg-ink/60 px-6"
        style={{ justifyContent: 'center' }}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          className="rounded-3xl bg-paper p-5">
          <Text className="font-display text-xl text-ink">Enregistrer le thème</Text>
          <Text className="mt-1 text-sm text-ink-muted">
            Donne-lui un nom. Il apparaîtra en tête de tes thèmes.
          </Text>

          <View
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 14,
              backgroundColor: bg,
              borderWidth: 1,
              borderColor: 'rgba(107,98,89,0.2)',
            }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: primary }} />
              <View
                style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: secondary }}
              />
            </View>
            <Text style={{ marginTop: 8, fontSize: 12, color: secondary, opacity: 0.8 }}>
              Police : {fontId}
            </Text>
          </View>

          <View className="mt-4 flex-row items-center gap-3 rounded-2xl bg-paper-warm px-4 py-3">
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Mon thème"
              placeholderTextColor="rgb(107 98 89)"
              autoFocus
              maxLength={30}
              className="flex-1 text-base text-ink"
            />
          </View>

          <View className="mt-5 flex-row gap-2">
            <Pressable
              onPress={onClose}
              className="flex-1 rounded-full border border-ink-muted/30 py-3 active:opacity-70">
              <Text className="text-center text-ink-muted">Annuler</Text>
            </Pressable>
            <Pressable
              onPress={() => canSave && onSave(label.trim())}
              disabled={!canSave}
              className={`flex-1 rounded-full py-3 ${
                canSave ? 'bg-accent active:opacity-80' : 'bg-paper-shade'
              }`}>
              <Text
                className={`text-center font-sans-med ${
                  canSave ? 'text-paper' : 'text-ink-muted'
                }`}>
                Enregistrer
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BordersRow({
  borderId,
  setBorderId,
}: {
  borderId: string;
  setBorderId: (id: string) => void;
}) {
  const all = useAllBorders();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
      {all.map((b) => (
        <BorderCard
          key={b.id}
          def={b}
          active={b.id === borderId}
          onPress={() => setBorderId(b.id)}
        />
      ))}
    </ScrollView>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="px-5 text-xs uppercase tracking-wider text-ink-muted"
      style={{ marginTop: -4 }}>
      {children}
    </Text>
  );
}

function BorderCard({
  def,
  active,
  onPress,
}: {
  def: BorderDef;
  active: boolean;
  onPress: () => void;
}) {
  const W = 96;
  const H = 96;
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const theme = useThemeColors();
  const themedSvgXml = useMemo(() => {
    if (!def.svgXml) return undefined;
    return applyTokens(
      def.svgXml,
      def.tokens,
      { colorPrimary, colorSecondary, colorBg },
      theme,
    );
  }, [def.svgXml, def.tokens, colorPrimary, colorSecondary, colorBg, theme]);
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: W,
        height: H,
        borderWidth: active ? 2 : 1,
        borderColor: active ? '#c27b52' : 'rgba(107,98,89,0.2)',
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.4)',
      }}>
      {(def.source || def.svgXml) && def.imageSize && def.slice ? (
        <NineSliceFrame
          source={def.source}
          svgXml={themedSvgXml}
          imageSize={def.imageSize}
          slice={def.slice}
          padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
          repeat={def.repeat}
          fillCenter={false}
          style={{ flex: 1 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, color: 'rgb(107 98 89)' }}>{def.label}</Text>
          </View>
        </NineSliceFrame>
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            borderStyle: 'dashed',
            borderWidth: 1,
            borderColor: 'rgba(107,98,89,0.4)',
            margin: 6,
            borderRadius: 8,
          }}>
          <MaterialIcons name="block" size={20} color="rgb(107 98 89)" />
          <Text
            style={{ fontSize: 10, color: 'rgb(107 98 89)', marginTop: 4, textAlign: 'center' }}>
            {def.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function FondsRow({
  fondId,
  setFondId,
}: {
  fondId: string;
  setFondId: (id: string) => void;
}) {
  const all = useAllFonds();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
      {all.map((f) => (
        <FondCard
          key={f.id}
          def={f}
          active={f.id === fondId}
          onPress={() => setFondId(f.id)}
        />
      ))}
    </ScrollView>
  );
}

function FondCard({
  def,
  active,
  onPress,
}: {
  def: FondDef;
  active: boolean;
  onPress: () => void;
}) {
  const W = 96;
  const H = 96;
  const colorBg = usePreferences((s) => s.colorBg);
  const hasArt = !!(def.source || def.svgXml);
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: W,
        height: H,
        borderWidth: active ? 2 : 1,
        borderColor: active ? '#c27b52' : 'rgba(107,98,89,0.2)',
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: 'rgba(255,255,255,0.4)',
      }}>
      {hasArt ? (
        <FondLayer bgColor={colorBg} fondId={def.id} />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            borderStyle: 'dashed',
            borderWidth: 1,
            borderColor: 'rgba(107,98,89,0.4)',
            margin: 6,
            borderRadius: 8,
          }}>
          <MaterialIcons name="block" size={20} color="rgb(107 98 89)" />
          <Text
            style={{ fontSize: 10, color: 'rgb(107 98 89)', marginTop: 4, textAlign: 'center' }}>
            {def.label}
          </Text>
        </View>
      )}
      {hasArt && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            paddingVertical: 4,
            paddingHorizontal: 6,
            backgroundColor: 'rgba(255,255,255,0.85)',
          }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: 10, color: 'rgb(58 50 43)', textAlign: 'center' }}>
            {def.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
