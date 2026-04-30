import { ColorPickerModal } from '@/components/color-picker-modal';
import { SheetSurface } from '@/components/sheet-surface';
import {
  BorderTile,
  Chip,
  ColorRow,
  ColorRowLabeled,
  Label,
  PresetCard,
  SavePresetCard,
  SavePresetModal,
  Section,
  Stepper,
  borderLabel,
  tokenLabel,
} from '@/components/sheet-customizer';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { PERSO_BORDER_ID, type BorderDef } from '@/lib/borders/catalog';
import { DEFAULT_APPEARANCE } from '@/lib/sheet-appearance';
import { BUILTIN_PRESETS } from '@/lib/sheet-presets';
import { FONTS } from '@/lib/theme/fonts';
import { useAllBorders } from '@/store/border-catalog';
import { usePreferences } from '@/store/preferences';
import { useSheetTemplates } from '@/store/sheet-templates';
import {
  SHEET_BORDER_STYLES,
  type SheetAppearance,
  type SheetFrame,
} from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ColorTarget = 'bg' | 'text' | 'muted' | 'accent' | 'frame' | null;

type Props = {
  open: boolean;
  appearance: SheetAppearance;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSave: (next: SheetAppearance) => void;
  onReset?: () => void;
  resetLabel?: string;
};

export function BingoCustomizer({
  open,
  appearance,
  title,
  subtitle,
  onClose,
  onSave,
  onReset,
  resetLabel,
}: Props) {
  const [draft, setDraft] = useState<SheetAppearance>(appearance);
  const [colorTarget, setColorTarget] = useState<ColorTarget>(null);
  const [overrideTokenTarget, setOverrideTokenTarget] = useState<string | null>(
    null,
  );
  const [savePresetOpen, setSavePresetOpen] = useState(false);

  const userPresets = useSheetTemplates((s) => s.userPresets);
  const addUserPreset = useSheetTemplates((s) => s.addUserPreset);
  const deleteUserPreset = useSheetTemplates((s) => s.deleteUserPreset);
  const allBorders = useAllBorders();
  const theme = useThemeColors();
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const themePaper = usePreferences((s) => s.colorBg);

  useEffect(() => {
    if (open) setDraft(appearance);
  }, [open, appearance]);

  const updateFrame = (partial: Partial<SheetFrame>) =>
    setDraft((d) => ({ ...d, frame: { ...d.frame, ...partial } }));

  const setColorOverride = (tokenName: string, hex: string | null) =>
    setDraft((d) => {
      const next = { ...(d.frame.colorOverrides ?? {}) };
      if (hex === null) delete next[tokenName];
      else next[tokenName] = hex;
      return {
        ...d,
        frame: {
          ...d.frame,
          colorOverrides: Object.keys(next).length > 0 ? next : undefined,
        },
      };
    });

  const selectedBorder: BorderDef | undefined = useMemo(() => {
    const id = draft.frame.borderId;
    if (!id || id === PERSO_BORDER_ID) return undefined;
    return allBorders.find((b) => b.id === id);
  }, [draft.frame.borderId, allBorders]);

  const isPerso = !draft.frame.borderId || draft.frame.borderId === PERSO_BORDER_ID;
  const isSvg = !!selectedBorder?.svgXml;
  const isPng = !!selectedBorder?.source;

  const pickerInitial =
    colorTarget === 'bg'
      ? draft.bgColor
      : colorTarget === 'text'
        ? draft.textColor
        : colorTarget === 'muted'
          ? draft.mutedColor
          : colorTarget === 'accent'
            ? draft.accentColor
            : colorTarget === 'frame'
              ? draft.frame.color
              : '#000000';

  const pickerTitle =
    colorTarget === 'bg'
      ? 'Couleur de fond'
      : colorTarget === 'text'
        ? 'Couleur du texte'
        : colorTarget === 'muted'
          ? 'Couleur secondaire'
          : colorTarget === 'accent'
            ? 'Couleur accent'
            : colorTarget === 'frame'
              ? 'Couleur du cadre'
              : '';

  const onPickColor = (hex: string) => {
    if (colorTarget === 'bg') setDraft((d) => ({ ...d, bgColor: hex }));
    if (colorTarget === 'text') setDraft((d) => ({ ...d, textColor: hex }));
    if (colorTarget === 'muted') setDraft((d) => ({ ...d, mutedColor: hex }));
    if (colorTarget === 'accent') setDraft((d) => ({ ...d, accentColor: hex }));
    if (colorTarget === 'frame') updateFrame({ color: hex });
  };

  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: themePaper,
          paddingTop: insets.top,
        }}>
        <View className="flex-row items-center justify-between border-b border-paper-warm px-4 py-3">
          <Pressable
            onPress={onClose}
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full bg-paper-warm active:bg-paper-shade">
            <MaterialIcons name="close" size={20} color="rgb(58 50 43)" />
          </Pressable>
          <View className="flex-1 px-3">
            <Text numberOfLines={1} className="font-display text-lg text-ink">
              {title}
            </Text>
            {subtitle ? (
              <Text numberOfLines={1} className="text-xs text-ink-muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => onSave(draft)}
            className="rounded-full bg-accent px-4 py-2 active:opacity-80">
            <Text className="font-sans-med text-paper">Valider</Text>
          </Pressable>
        </View>

        <View
          style={{
            paddingHorizontal: 4,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(107,98,89,0.15)',
          }}>
          <BingoPreview appearance={draft} />
        </View>

        <ScrollView contentContainerClassName="p-5 gap-6 pb-16">
          <Section title="Préréglages">
            <Text className="mb-2 text-xs text-ink-muted">
              Appuie pour appliquer. Appui long pour supprimer un preset perso.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              <SavePresetCard onPress={() => setSavePresetOpen(true)} />
              {userPresets.map((p) => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  isUser
                  onApply={() => setDraft(p.appearance)}
                  onDelete={() =>
                    Alert.alert(
                      'Supprimer ce preset ?',
                      `"${p.label}" sera retiré de tes presets.`,
                      [
                        { text: 'Annuler', style: 'cancel' },
                        {
                          text: 'Supprimer',
                          style: 'destructive',
                          onPress: () => deleteUserPreset(p.id),
                        },
                      ],
                    )
                  }
                />
              ))}
              {BUILTIN_PRESETS.map((p) => (
                <PresetCard
                  key={p.id}
                  preset={p}
                  onApply={() => setDraft(p.appearance)}
                />
              ))}
            </ScrollView>
          </Section>

          <Section title="Cadre">
            <Label>Type</Label>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              <BorderTile
                label="Perso"
                active={isPerso}
                onPress={() =>
                  updateFrame({ borderId: PERSO_BORDER_ID, colorOverrides: undefined })
                }
              />
              {allBorders
                .filter((b) => (b.source || b.svgXml) && b.imageSize && b.slice)
                .map((b) => (
                  <BorderTile
                    key={b.id}
                    def={b}
                    label={b.label}
                    active={draft.frame.borderId === b.id}
                    onPress={() =>
                      updateFrame({ borderId: b.id, colorOverrides: undefined })
                    }
                  />
                ))}
            </ScrollView>

            {isPerso && (
              <>
                <Label className="mt-4">Style</Label>
                <View className="mt-1 flex-row flex-wrap gap-2">
                  {SHEET_BORDER_STYLES.map((s) => (
                    <Chip
                      key={s}
                      label={borderLabel(s)}
                      active={draft.frame.style === s}
                      onPress={() => updateFrame({ style: s })}
                    />
                  ))}
                </View>

                <Label className="mt-4">Épaisseur</Label>
                <Stepper
                  value={draft.frame.width}
                  min={0}
                  max={6}
                  step={1}
                  onChange={(v) => updateFrame({ width: v })}
                  suffix="px"
                  disabled={draft.frame.style === 'none'}
                />

                <Label className="mt-4">Arrondi</Label>
                <Stepper
                  value={draft.frame.radius}
                  min={0}
                  max={32}
                  step={2}
                  onChange={(v) => updateFrame({ radius: v })}
                  suffix="px"
                />

                <Label className="mt-4">Couleur</Label>
                <ColorRow
                  hex={draft.frame.color}
                  onPress={() => setColorTarget('frame')}
                  disabled={draft.frame.style === 'none'}
                />
              </>
            )}

            {isPng && (
              <Text className="mt-3 text-xs text-ink-muted">
                Cadre image — épaisseur, arrondi et couleur fixés par le visuel.
              </Text>
            )}

            {isSvg && selectedBorder?.tokens && (
              <>
                <Label className="mt-4">Couleurs du cadre</Label>
                <Text className="mb-2 text-xs text-ink-muted">
                  Par défaut le cadre utilise les couleurs du thème. Tu peux surcharger
                  par grille.
                </Text>
                <View className="gap-2">
                  {Object.keys(selectedBorder.tokens).map((tokenName) => {
                    const override = draft.frame.colorOverrides?.[tokenName];
                    const themed =
                      ({ colorPrimary, colorSecondary, colorBg } as Record<string, string>)[
                        tokenName
                      ] ??
                      (theme as unknown as Record<string, string>)[tokenName] ??
                      selectedBorder.tokens?.[tokenName] ??
                      '#000000';
                    const effective = override ?? themed;
                    return (
                      <View
                        key={tokenName}
                        className="flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3">
                        <Pressable
                          onPress={() => setOverrideTokenTarget(tokenName)}
                          className="flex-1 flex-row items-center gap-3 active:opacity-70">
                          <View
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 11,
                              backgroundColor: effective,
                              borderWidth: 1,
                              borderColor: 'rgba(107,98,89,0.3)',
                            }}
                          />
                          <View className="flex-1">
                            <Text className="font-sans-med text-sm text-ink">
                              {tokenLabel(tokenName)}
                            </Text>
                            <Text className="text-xs text-ink-muted">
                              {override ? 'Override' : 'Thème'}
                            </Text>
                          </View>
                        </Pressable>
                        {override ? (
                          <Pressable
                            onPress={() => setColorOverride(tokenName, null)}
                            hitSlop={6}
                            className="ml-2 px-2 py-1 active:opacity-60">
                            <MaterialIcons
                              name="restart-alt"
                              size={18}
                              color="rgb(107 98 89)"
                            />
                          </Pressable>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </Section>

          <Section title="Police">
            <View className="mt-1 gap-2">
              {FONTS.map((f) => (
                <Pressable
                  key={f.id}
                  onPress={() => setDraft((d) => ({ ...d, fontId: f.id }))}
                  className={`flex-row items-center justify-between rounded-2xl px-4 py-3 ${
                    f.id === draft.fontId ? 'bg-accent-pale' : 'bg-paper-warm'
                  }`}>
                  <View className="flex-1">
                    <Text className="text-xs uppercase tracking-wider text-ink-muted">
                      {f.label}
                    </Text>
                    <Text
                      style={{
                        fontFamily: f.variants.display,
                        fontSize: 22,
                        color: 'rgb(26 20 16)',
                        marginTop: 2,
                      }}>
                      {f.sample}
                    </Text>
                  </View>
                  {f.id === draft.fontId && (
                    <MaterialIcons name="check-circle" size={22} color="rgb(155 90 56)" />
                  )}
                </Pressable>
              ))}
            </View>
          </Section>

          <Section title="Couleurs">
            <View className="gap-2">
              <ColorRowLabeled
                label="Fond"
                hex={draft.bgColor}
                onPress={() => setColorTarget('bg')}
              />
              <ColorRowLabeled
                label="Texte"
                hex={draft.textColor}
                onPress={() => setColorTarget('text')}
              />
              <ColorRowLabeled
                label="Secondaire"
                hex={draft.mutedColor}
                onPress={() => setColorTarget('muted')}
              />
              <ColorRowLabeled
                label="Accent"
                hex={draft.accentColor}
                onPress={() => setColorTarget('accent')}
              />
            </View>
          </Section>

          <View className="flex-row items-center justify-between pt-2">
            {onReset ? (
              <Pressable onPress={onReset} className="px-2 py-2 active:opacity-60">
                <Text className="text-sm text-ink-muted">
                  {resetLabel ?? 'Rétablir les valeurs par défaut'}
                </Text>
              </Pressable>
            ) : (
              <View />
            )}
            <Pressable
              onPress={() => setDraft(DEFAULT_APPEARANCE)}
              className="px-2 py-2 active:opacity-60">
              <Text className="text-sm text-ink-muted">Tout réinitialiser</Text>
            </Pressable>
          </View>
        </ScrollView>

        <ColorPickerModal
          open={colorTarget !== null}
          initial={pickerInitial}
          title={pickerTitle}
          onClose={() => setColorTarget(null)}
          onChange={onPickColor}
        />
        <ColorPickerModal
          open={overrideTokenTarget !== null}
          initial={
            (overrideTokenTarget &&
              draft.frame.colorOverrides?.[overrideTokenTarget]) ||
            '#000000'
          }
          title={
            overrideTokenTarget ? `Override "${tokenLabel(overrideTokenTarget)}"` : ''
          }
          onClose={() => setOverrideTokenTarget(null)}
          onChange={(hex) => {
            if (overrideTokenTarget) setColorOverride(overrideTokenTarget, hex);
          }}
        />

        <SavePresetModal
          open={savePresetOpen}
          onClose={() => setSavePresetOpen(false)}
          onSave={(label) => {
            addUserPreset(label, draft);
            setSavePresetOpen(false);
          }}
        />
      </View>
    </Modal>
  );
}

// Mini-aperçu bingo : SheetSurface (gère perso CSS + cadre catalog) +
// titre stylé + 3x3 cells de démonstration.
function BingoPreview({ appearance }: { appearance: SheetAppearance }) {
  const { textColor, accentColor, mutedColor, fontId } = appearance;
  const fontDef = useMemo(
    () => FONTS.find((f) => f.id === fontId) ?? FONTS[0],
    [fontId],
  );

  return (
    <SheetSurface appearance={appearance} padding={10}>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: fontDef.variants.display,
          fontSize: 16,
          color: textColor,
          marginBottom: 8,
        }}>
        Bingo lecture
      </Text>
      <View style={{ gap: 4 }}>
        {Array.from({ length: 3 }).map((_, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 4 }}>
            {Array.from({ length: 3 }).map((_, c) => {
              const idx = r * 3 + c;
              const isAccent = idx === 0 || idx === 4 || idx === 8;
              return (
                <View
                  key={c}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 6,
                    backgroundColor: isAccent ? accentColor : mutedColor + '22',
                    borderWidth: 1,
                    borderColor: mutedColor + '33',
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
    </SheetSurface>
  );
}
