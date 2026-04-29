import { ColorPickerModal } from '@/components/color-picker-modal';
import { IconPickerModal } from '@/components/icon-picker-modal';
import { NineSliceFrame } from '@/components/nine-slice-frame';
import { RatingIcon } from '@/components/rating-row';
import { SheetSurface } from '@/components/sheet-surface';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { PERSO_BORDER_ID, type BorderDef } from '@/lib/borders/catalog';
import { applyBorderTokens } from '@/lib/borders/tokens';
import { FONTS } from '@/lib/theme/fonts';
import {
  DEFAULT_APPEARANCE,
  DEFAULT_CATEGORIES,
  DEFAULT_RATING_ICONS,
  hexWithAlpha,
  shiftTowardsPaper,
} from '@/lib/sheet-appearance';
import { BUILTIN_PRESETS, type SheetPreset } from '@/lib/sheet-presets';
import { useAllBorders } from '@/store/border-catalog';
import { usePreferences } from '@/store/preferences';
import { useSheetTemplates } from '@/store/sheet-templates';
import { Alert } from 'react-native';
import {
  SHEET_BORDER_STYLES,
  type RatingIconKind,
  type SheetAppearance,
  type SheetBorderStyle,
  type SheetDefaultCategory,
  type SheetFrame,
  type SheetRatingIconConfig,
} from '@/types/book';
import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ColorTarget =
  | 'bg'
  | 'text'
  | 'muted'
  | 'accent'
  | 'frame'
  | null;

// Mapping nom de token SVG → label affiché à l'utilisateur. Les tokens
// référencent soit une userPreference (3 couleurs brutes) soit un slot
// dérivé du thème (paper / ink / accent). Le label décrit ce que l'utilisateur
// voit dans l'app, pas le nom interne du slot.
const TOKEN_LABELS: Record<string, string> = {
  colorPrimary: 'Couleur principale',
  colorSecondary: 'Couleur secondaire',
  colorBg: 'Fond',
  paper: 'Fond',
  paperWarm: 'Fond chaud',
  paperShade: 'Fond ombré',
  ink: 'Texte',
  inkSoft: 'Texte adouci',
  inkMuted: 'Texte discret',
  accent: 'Accent',
  accentDeep: 'Accent foncé',
  accentPale: 'Accent pâle',
};

function tokenLabel(name: string): string {
  return TOKEN_LABELS[name] ?? name;
}

type PublicToggle = { value: boolean; onChange: (v: boolean) => void };

type Props = {
  open: boolean;
  appearance: SheetAppearance;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onSave: (next: SheetAppearance) => void;
  onReset?: () => void;
  resetLabel?: string;
  publicToggle?: PublicToggle;
};

export function SheetCustomizer({
  open,
  appearance,
  title,
  subtitle,
  onClose,
  onSave,
  onReset,
  resetLabel,
  publicToggle,
}: Props) {
  const [draft, setDraft] = useState<SheetAppearance>(appearance);
  const [colorTarget, setColorTarget] = useState<ColorTarget>(null);
  // Quand on édite un override de couleur d'un token SVG : nom du token
  // ouvert dans le picker. `null` = pas d'édition d'override en cours.
  const [overrideTokenTarget, setOverrideTokenTarget] = useState<string | null>(null);
  const [savePresetOpen, setSavePresetOpen] = useState(false);

  const userPresets = useSheetTemplates((s) => s.userPresets);
  const addUserPreset = useSheetTemplates((s) => s.addUserPreset);
  const deleteUserPreset = useSheetTemplates((s) => s.deleteUserPreset);
  const allBorders = useAllBorders();
  const theme = useThemeColors();
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);

  useEffect(() => {
    if (open) setDraft(appearance);
  }, [open, appearance]);

  const updateFrame = (partial: Partial<SheetFrame>) =>
    setDraft((d) => ({ ...d, frame: { ...d.frame, ...partial } }));

  const setColorOverride = (tokenName: string, hex: string | null) =>
    setDraft((d) => {
      const next = { ...(d.frame.colorOverrides ?? {}) };
      if (hex === null) {
        delete next[tokenName];
      } else {
        next[tokenName] = hex;
      }
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

  const fontDef = useMemo(
    () => FONTS.find((f) => f.id === draft.fontId) ?? FONTS[0],
    [draft.fontId],
  );

  const insets = useSafeAreaInsets();
  const themePaper = usePreferences((s) => s.colorBg);

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
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(107,98,89,0.15)',
          }}>
          <PreviewCard appearance={draft} fontFamily={fontDef.variants.display} />
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
                onPress={() => updateFrame({ borderId: PERSO_BORDER_ID, colorOverrides: undefined })}
              />
              {allBorders
                .filter((b) => (b.source || b.svgXml) && b.imageSize && b.slice)
                .map((b) => (
                  <BorderTile
                    key={b.id}
                    def={b}
                    label={b.label}
                    active={draft.frame.borderId === b.id}
                    onPress={() => updateFrame({ borderId: b.id, colorOverrides: undefined })}
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
                  par fiche.
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
                            <MaterialIcons name="restart-alt" size={18} color="rgb(107 98 89)" />
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

          <Section title="Catégories par défaut">
            <Text className="mb-2 text-xs text-ink-muted">
              Ces catégories sont proposées à la création d&apos;une fiche.
            </Text>
            <CategoriesEditor
              categories={draft.defaultCategories}
              onChange={(next) =>
                setDraft((d) => ({ ...d, defaultCategories: next }))
              }
            />
            <Pressable
              onPress={() =>
                setDraft((d) => ({ ...d, defaultCategories: DEFAULT_CATEGORIES }))
              }
              className="mt-3 self-start px-2 py-1 active:opacity-60">
              <Text className="text-xs text-ink-muted">Rétablir par défaut</Text>
            </Pressable>
          </Section>

          {publicToggle ? (
            <Section title="Partage">
              <View className="flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3">
                <View className="flex-1 pr-3">
                  <Text className="font-sans-med text-ink">Rendre public</Text>
                  <Text className="mt-1 text-xs text-ink-muted">
                    Permets aux autres de réutiliser ton template (bientôt).
                  </Text>
                </View>
                <Switch
                  value={publicToggle.value}
                  onValueChange={publicToggle.onChange}
                  trackColor={{ false: '#d6cdbf', true: '#c27b52' }}
                  thumbColor="#fbf8f4"
                />
              </View>
            </Section>
          ) : null}

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
          title={overrideTokenTarget ? `Override "${tokenLabel(overrideTokenTarget)}"` : ''}
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

function PresetCard({
  preset,
  isUser,
  onApply,
  onDelete,
}: {
  preset: SheetPreset;
  isUser?: boolean;
  onApply: () => void;
  onDelete?: () => void;
}) {
  const { appearance, label } = preset;
  const { frame, bgColor, textColor, mutedColor, accentColor } = appearance;
  const borderWidth = frame.style === 'none' ? 0 : Math.min(frame.width, 3);
  return (
    <Pressable
      onPress={onApply}
      onLongPress={isUser ? onDelete : undefined}
      delayLongPress={400}
      style={{
        width: 120,
        height: 96,
        borderRadius: 14,
        backgroundColor: bgColor,
        borderStyle: frame.style === 'none' ? undefined : (frame.style as 'solid'),
        borderWidth,
        borderColor: frame.color,
        padding: 10,
        justifyContent: 'space-between',
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: accentColor }} />
        {isUser ? (
          <View style={{ marginLeft: 'auto' }}>
            <MaterialIcons name="person" size={12} color={mutedColor} />
          </View>
        ) : null}
      </View>
      <View>
        <Text numberOfLines={1} style={{ color: textColor, fontSize: 13, fontWeight: '600' }}>
          {label}
        </Text>
        <Text numberOfLines={1} style={{ color: mutedColor, fontSize: 10 }}>
          {isUser ? 'Perso' : 'Livré'}
        </Text>
      </View>
    </Pressable>
  );
}

function SavePresetCard({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: 120,
        height: 96,
        borderRadius: 14,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: 'rgba(107,98,89,0.5)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
      }}>
      <MaterialIcons name="add-circle-outline" size={24} color="rgb(155 90 56)" />
      <Text style={{ fontSize: 12, color: 'rgb(58 50 43)', fontWeight: '600' }}>
        Enregistrer
      </Text>
      <Text style={{ fontSize: 10, color: 'rgb(107 98 89)' }}>Réglages actuels</Text>
    </Pressable>
  );
}

function SavePresetModal({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
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
          <Text className="font-display text-xl text-ink">Enregistrer le preset</Text>
          <Text className="mt-1 text-sm text-ink-muted">
            Donne-lui un nom. Il apparaîtra en tête de ta liste.
          </Text>

          <View className="mt-4 flex-row items-center gap-3 rounded-2xl bg-paper-warm px-4 py-3">
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder="Mon preset"
              placeholderTextColor="rgb(107 98 89)"
              autoFocus
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={() => canSave && onSave(label.trim())}
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

function borderLabel(s: SheetBorderStyle): string {
  switch (s) {
    case 'none':
      return 'Aucun';
    case 'solid':
      return 'Plein';
    case 'dashed':
      return 'Tirets';
    case 'dotted':
      return 'Points';
    case 'double':
      return 'Double';
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text className="mb-2 font-display text-base text-ink">{title}</Text>
      {children}
    </View>
  );
}

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text className={`text-xs uppercase tracking-wider text-ink-muted ${className ?? ''}`}>
      {children}
    </Text>
  );
}

function Chip({
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
      className={`rounded-full px-4 py-2 ${active ? 'bg-accent' : 'bg-paper-warm active:bg-paper-shade'}`}>
      <Text className={active ? 'font-sans-med text-paper' : 'text-ink'}>{label}</Text>
    </Pressable>
  );
}

// Tuile de sélection de cadre — même layout que la personnalisation app
// (96×96, NineSliceFrame en preview, fallback dashed pour "Perso").
function BorderTile({
  def,
  label,
  active,
  onPress,
}: {
  def?: BorderDef;
  label: string;
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
    if (!def?.svgXml) return undefined;
    return applyBorderTokens(
      def.svgXml,
      def.tokens,
      { colorPrimary, colorSecondary, colorBg },
      theme,
    );
  }, [def?.svgXml, def?.tokens, colorPrimary, colorSecondary, colorBg, theme]);

  const hasNineSlice = def && (def.source || def.svgXml) && def.imageSize && def.slice;

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
      {hasNineSlice ? (
        <NineSliceFrame
          source={def!.source}
          svgXml={themedSvgXml}
          imageSize={def!.imageSize!}
          slice={def!.slice!}
          padding={{ top: 0, right: 0, bottom: 0, left: 0 }}
          repeat={def!.repeat}
          fillCenter={false}
          style={{ flex: 1 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 10, color: 'rgb(107 98 89)' }}>{label}</Text>
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
          <MaterialIcons name="tune" size={20} color="rgb(107 98 89)" />
          <Text
            style={{ fontSize: 10, color: 'rgb(107 98 89)', marginTop: 4, textAlign: 'center' }}>
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function Stepper({
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
  disabled?: boolean;
}) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const opacity = disabled ? 0.4 : 1;
  return (
    <View
      className="mt-1 flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-2"
      style={{ opacity }}>
      <Pressable
        onPress={dec}
        disabled={disabled || value <= min}
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-full bg-paper active:bg-paper-shade">
        <MaterialIcons name="remove" size={18} color="rgb(58 50 43)" />
      </Pressable>
      <Text className="font-sans-med text-base text-ink">
        {value}
        {suffix ? ` ${suffix}` : ''}
      </Text>
      <Pressable
        onPress={inc}
        disabled={disabled || value >= max}
        hitSlop={8}
        className="h-8 w-8 items-center justify-center rounded-full bg-paper active:bg-paper-shade">
        <MaterialIcons name="add" size={18} color="rgb(58 50 43)" />
      </Pressable>
    </View>
  );
}

function ColorRow({
  hex,
  onPress,
  disabled,
}: {
  hex: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{ opacity: disabled ? 0.4 : 1 }}
      className="mt-1 flex-row items-center justify-between rounded-2xl bg-paper-warm px-4 py-3 active:bg-paper-shade">
      <Text className="font-sans-med text-ink">{hex.toUpperCase()}</Text>
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: 15,
          backgroundColor: hex,
          borderWidth: 1,
          borderColor: 'rgba(107,98,89,0.3)',
        }}
      />
    </Pressable>
  );
}

function ColorRowLabeled({
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
          width: 32,
          height: 32,
          borderRadius: 16,
          backgroundColor: hex,
          borderWidth: 1,
          borderColor: 'rgba(107,98,89,0.3)',
        }}
      />
    </Pressable>
  );
}

function CategoriesEditor({
  categories,
  onChange,
}: {
  categories: SheetDefaultCategory[];
  onChange: (next: SheetDefaultCategory[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [pickerForIdx, setPickerForIdx] = useState<number | null>(null);

  const addCategory = () => {
    const t = draft.trim();
    if (!t) return;
    const exists = categories.some(
      (c) => c.title.toLocaleLowerCase('fr') === t.toLocaleLowerCase('fr'),
    );
    if (exists) {
      setDraft('');
      return;
    }
    onChange([...categories, { title: t }]);
    setDraft('');
  };

  const removeAt = (idx: number) =>
    onChange(categories.filter((_, i) => i !== idx));

  const applyPick = (
    idx: number,
    name: string | undefined,
    color: string | undefined,
    emoji: string | undefined,
  ) =>
    onChange(
      categories.map((c, i) =>
        i === idx
          ? {
              ...c,
              materialIcon: emoji ? undefined : name,
              materialIconColor: emoji ? undefined : name ? color : undefined,
              emoji: emoji ?? undefined,
              icon: undefined,
            }
          : c,
      ),
    );

  const currentSelection =
    pickerForIdx != null ? categories[pickerForIdx]?.materialIcon : undefined;
  const currentColor =
    pickerForIdx != null
      ? categories[pickerForIdx]?.materialIconColor
      : undefined;
  const currentEmoji =
    pickerForIdx != null ? categories[pickerForIdx]?.emoji : undefined;

  return (
    <View className="gap-2">
      {categories.map((c, idx) => (
        <View
          key={`${c.title}-${idx}`}
          className="flex-row items-center gap-2 rounded-2xl bg-paper-warm px-3 py-2">
          <Pressable
            onPress={() => setPickerForIdx(idx)}
            hitSlop={6}
            className="h-9 w-9 items-center justify-center rounded-full bg-paper active:opacity-70">
            {c.emoji ? (
              <Text style={{ fontSize: 18 }}>{c.emoji}</Text>
            ) : c.materialIcon ? (
              <MaterialIcons
                name={c.materialIcon as keyof typeof MaterialIcons.glyphMap}
                size={20}
                color={c.materialIconColor ?? '#1f1a16'}
              />
            ) : c.icon ? (
              <RatingIcon kind={c.icon} filled size={18} />
            ) : (
              <MaterialIcons name="add" size={18} color="rgb(107 98 89)" />
            )}
          </Pressable>
          <Text className="flex-1 text-base text-ink">{c.title}</Text>
          <Pressable
            onPress={() => removeAt(idx)}
            hitSlop={6}
            className="h-8 w-8 items-center justify-center rounded-full active:bg-paper-shade">
            <MaterialIcons name="close" size={16} color="rgb(107 98 89)" />
          </Pressable>
        </View>
      ))}

      <IconPickerModal
        open={pickerForIdx != null}
        selected={currentSelection}
        selectedColor={currentColor}
        selectedEmoji={currentEmoji}
        onPick={(result) => {
          if (pickerForIdx != null)
            applyPick(pickerForIdx, result.name, result.color, result.emoji);
          setPickerForIdx(null);
        }}
        onClose={() => setPickerForIdx(null)}
      />
      <View className="mt-1 flex-row items-center gap-2 rounded-2xl bg-paper-warm px-4 py-2">
        <MaterialIcons name="add" size={18} color="rgb(107 98 89)" />
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ajouter une catégorie"
          placeholderTextColor="rgb(107 98 89)"
          returnKeyType="done"
          onSubmitEditing={addCategory}
          className="flex-1 text-base text-ink"
        />
        <Pressable
          onPress={addCategory}
          disabled={!draft.trim()}
          hitSlop={6}
          style={{ opacity: draft.trim() ? 1 : 0.3 }}>
          <MaterialIcons name="check" size={20} color="#9b5a38" />
        </Pressable>
      </View>
    </View>
  );
}


function PreviewCard({
  appearance,
  fontFamily,
}: {
  appearance: SheetAppearance;
  fontFamily: string;
}) {
  const { bgColor, textColor, mutedColor, accentColor } = appearance;
  const enabledRating = appearance.ratingIcons.find((r) => r.enabled);
  const exampleCats = appearance.defaultCategories.slice(0, 2);
  const divider = hexWithAlpha(mutedColor, 0.22);

  const themePaper = usePreferences((s) => s.colorBg);

  return (
    // Fond de page = thème app. Intérieur = la fiche avec son bg + frame.
    <View
      style={{
        backgroundColor: themePaper,
        borderRadius: 20,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(107,98,89,0.12)',
      }}>
      <SheetSurface appearance={appearance} padding={14}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 34,
              height: 50,
              borderRadius: 4,
              backgroundColor: shiftTowardsPaper(bgColor),
              borderWidth: 1,
              borderColor: 'rgba(107,98,89,0.2)',
            }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: mutedColor,
                fontSize: 10,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}>
              Fiche de lecture
            </Text>
            <Text
              numberOfLines={1}
              style={{ color: textColor, fontFamily, fontSize: 16, marginTop: 2 }}>
              Ma lecture
            </Text>
          </View>
        </View>

        <View style={{ paddingVertical: 12 }}>
          <Text
            style={{ color: textColor, fontFamily, fontSize: 15, marginBottom: 6 }}>
            Histoire
          </Text>
          {enabledRating ? (
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <RatingIcon
                  key={i}
                  kind={enabledRating.kind}
                  filled={i <= 4}
                  size={16}
                />
              ))}
            </View>
          ) : null}
          <Text
            style={{ color: textColor, fontSize: 12, lineHeight: 16 }}
            numberOfLines={2}>
            Tes impressions s&apos;afficheront avec ces réglages. Ajuste ce qui te va mieux.
          </Text>
        </View>

        <View
          style={{
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: divider,
          }}>
          <Text
            style={{ color: textColor, fontFamily, fontSize: 14, marginBottom: 6 }}>
            Personnages
          </Text>
          <Text style={{ color: textColor, fontSize: 12, lineHeight: 16 }}>
            Ajoute ici une autre catégorie.
          </Text>
        </View>

        {exampleCats.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: 1,
              borderTopColor: divider,
            }}>
            {exampleCats.map((c) => (
              <View
                key={c.title}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: mutedColor,
                }}>
                <Text style={{ color: textColor, fontSize: 11 }}>+ {c.title}</Text>
                {c.emoji ? (
                  <Text style={{ color: textColor, fontSize: 11 }}>{c.emoji}</Text>
                ) : c.materialIcon ? (
                  <MaterialIcons
                    name={c.materialIcon as keyof typeof MaterialIcons.glyphMap}
                    size={11}
                    color={c.materialIconColor ?? textColor}
                  />
                ) : c.icon ? (
                  <RatingIcon kind={c.icon} filled size={10} />
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </SheetSurface>

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: 8,
          paddingHorizontal: 4,
        }}>
        <Text style={{ color: mutedColor, fontSize: 10 }}>Aperçu en direct</Text>
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: accentColor,
          }}>
          <Text style={{ color: '#fbf8f4', fontSize: 10, fontWeight: '600' }}>Accent</Text>
        </View>
      </View>
    </View>
  );
}
