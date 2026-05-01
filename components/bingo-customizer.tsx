import { ColorPickerModal } from '@/components/color-picker-modal';
import { SheetSurface } from '@/components/sheet-surface';
import {
  AppearanceColorsSection,
  BorderTile,
  Chip,
  ColorRow,
  FondOpacityRow,
  FondTile,
  Label,
  PresetCard,
  SavePresetCard,
  SavePresetModal,
  Section,
  Stepper,
  TokenOverridesEditor,
  borderLabel,
  tokenLabel,
  type AppearanceColorLabels,
} from '@/components/sheet-customizer';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { PERSO_BORDER_ID, type BorderDef } from '@/lib/borders/catalog';
import { type FondDef } from '@/lib/fonds/catalog';
import { DEFAULT_APPEARANCE, makeFondTokenOverrides } from '@/lib/sheet-appearance';
import { BUILTIN_PRESETS } from '@/lib/sheet-presets';
import { FONTS } from '@/lib/theme/fonts';
import { useAllBorders } from '@/store/border-catalog';
import { useAllFonds } from '@/store/fond-catalog';
import { usePreferences } from '@/store/preferences';
import { useSheetTemplates } from '@/store/sheet-templates';
import {
  SHEET_BORDER_STYLES,
  type SheetAppearance,
  type SheetFond,
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

type TokenOverrideTarget = { kind: 'frame' | 'fond'; tokenName: string } | null;

// Vocabulaire spécifique au bingo : `muted` = couleur des cases vides (avec
// opacité ajustable, alpha sur 8 chars), `accent` = couleur des cases
// validées. Le reste reprend la convention générale.
const BINGO_COLOR_LABELS: AppearanceColorLabels = {
  bg: { row: 'Fond', picker: 'Couleur de fond' },
  text: { row: 'Texte', picker: 'Couleur du texte' },
  muted: { row: 'Case', picker: 'Couleur des cases', withAlpha: true },
  accent: { row: 'Case validée', picker: 'Couleur des cases validées' },
};

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
  const [overrideTokenTarget, setOverrideTokenTarget] =
    useState<TokenOverrideTarget>(null);
  const [savePresetOpen, setSavePresetOpen] = useState(false);

  const userPresets = useSheetTemplates((s) => s.userPresets);
  const addUserPreset = useSheetTemplates((s) => s.addUserPreset);
  const deleteUserPreset = useSheetTemplates((s) => s.deleteUserPreset);
  const allBorders = useAllBorders();
  const allFonds = useAllFonds();
  const theme = useThemeColors();
  const colorPrimary = usePreferences((s) => s.colorPrimary);
  const colorSecondary = usePreferences((s) => s.colorSecondary);
  const colorBg = usePreferences((s) => s.colorBg);
  const themePaper = usePreferences((s) => s.colorBg);
  // Fond du thème user — sert au tile "Theme" (preview + snapshot au clic).
  const themeFondId = usePreferences((s) => s.fondId);
  const themeFondOpacity = usePreferences((s) => s.fondOpacity);
  const themeFondDef = useMemo(
    () => allFonds.find((f) => f.id === themeFondId),
    [allFonds, themeFondId],
  );
  // Fond image actif sur la grille : `draft.fond.fondId` explicite (≠ 'none')
  // ou hérité du thème. Sert à masquer le bg row dans Couleurs.
  const fondImageActive = useMemo(() => {
    const id = draft.fond?.fondId ?? themeFondId;
    return !!id && id !== 'none';
  }, [draft.fond?.fondId, themeFondId]);

  useEffect(() => {
    if (open) setDraft(appearance);
  }, [open, appearance]);

  const updateFrame = (partial: Partial<SheetFrame>) =>
    setDraft((d) => ({ ...d, frame: { ...d.frame, ...partial } }));

  const updateFond = (partial: Partial<SheetFond>) =>
    setDraft((d) => {
      const next: SheetFond = { ...(d.fond ?? {}), ...partial };
      // 'none' a une sémantique distincte de undefined (= explicitement aucun
      // fond, vs hérite du thème) — on le conserve. Cf. sheet-customizer.
      const isEmpty =
        !next.fondId &&
        (!next.colorOverrides || Object.keys(next.colorOverrides).length === 0) &&
        next.opacity === undefined;
      return { ...d, fond: isEmpty ? undefined : next };
    });

  const setFrameColorOverride = (tokenName: string, hex: string | null) =>
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

  const setFondColorOverride = (tokenName: string, hex: string | null) =>
    setDraft((d) => {
      const next = { ...(d.fond?.colorOverrides ?? {}) };
      if (hex === null) delete next[tokenName];
      else next[tokenName] = hex;
      const fond: SheetFond = {
        ...(d.fond ?? {}),
        colorOverrides: Object.keys(next).length > 0 ? next : undefined,
      };
      const isEmpty =
        !fond.fondId &&
        (!fond.colorOverrides || Object.keys(fond.colorOverrides).length === 0);
      return { ...d, fond: isEmpty ? undefined : fond };
    });

  const selectedBorder: BorderDef | undefined = useMemo(() => {
    const id = draft.frame.borderId;
    if (!id || id === PERSO_BORDER_ID) return undefined;
    return allBorders.find((b) => b.id === id);
  }, [draft.frame.borderId, allBorders]);

  const selectedFond: FondDef | undefined = useMemo(() => {
    const id = draft.fond?.fondId;
    if (!id || id === 'none') return undefined;
    return allFonds.find((f) => f.id === id);
  }, [draft.fond?.fondId, allFonds]);

  const isPerso = !draft.frame.borderId || draft.frame.borderId === PERSO_BORDER_ID;
  const isSvg = !!selectedBorder?.svgXml;
  const isPng = !!selectedBorder?.source;
  const fondIsSvg = !!selectedFond?.svgXml;

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
      ? BINGO_COLOR_LABELS.bg.picker
      : colorTarget === 'text'
        ? BINGO_COLOR_LABELS.text.picker
        : colorTarget === 'muted'
          ? BINGO_COLOR_LABELS.muted.picker
          : colorTarget === 'accent'
            ? BINGO_COLOR_LABELS.accent.picker
            : colorTarget === 'frame'
              ? 'Couleur du cadre'
              : '';
  const pickerWithAlpha =
    colorTarget && colorTarget !== 'frame'
      ? BINGO_COLOR_LABELS[colorTarget].withAlpha === true
      : false;

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
              <TokenOverridesEditor
                tokens={selectedBorder.tokens}
                overrides={draft.frame.colorOverrides}
                onOpenPicker={(name) => setOverrideTokenTarget({ kind: 'frame', tokenName: name })}
                onClear={(name) => setFrameColorOverride(name, null)}
                themeMap={theme as unknown as Record<string, string>}
                prefMap={{ colorPrimary, colorSecondary, colorBg }}
                title="Couleurs du cadre"
                helper="Par défaut le cadre utilise les couleurs du thème. Tu peux surcharger par grille."
              />
            )}
          </Section>

          <Section title="Fond">
            <Label>Type</Label>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 10, paddingVertical: 4 }}>
              {/* Theme : snapshot du fond du thème user. Le clic insère
                  l'id concret au moment T pour qu'un changement de thème
                  ultérieur n'affecte pas la grille. */}
              <FondTile
                label="Theme"
                def={themeFondDef}
                active={(draft.fond?.fondId ?? themeFondId) === themeFondId}
                onPress={() =>
                  updateFond({
                    fondId: themeFondId,
                    colorOverrides: undefined,
                    // Pas de snapshot d'opacité : lazy inherit du thème
                    // (cf. sheet-customizer).
                    opacity: undefined,
                  })
                }
              />
              <FondTile
                label="Aucun"
                active={
                  draft.fond?.fondId === 'none' && themeFondId !== 'none'
                }
                onPress={() =>
                  updateFond({
                    fondId: 'none',
                    colorOverrides: undefined,
                    opacity: undefined,
                  })
                }
              />
              {allFonds
                .filter((f) => f.source || f.svgXml)
                .map((f) => (
                  <FondTile
                    key={f.id}
                    def={f}
                    label={f.label}
                    active={draft.fond?.fondId === f.id}
                    onPress={() =>
                      updateFond({
                        fondId: f.id,
                        colorOverrides: undefined,
                        opacity: undefined,
                      })
                    }
                  />
                ))}
            </ScrollView>

            {fondImageActive && (
              <FondOpacityRow
                // Cf. sheet-customizer.
                value={
                  draft.fond?.opacity ??
                  ((draft.fond?.fondId ?? themeFondId) === themeFondId
                    ? themeFondOpacity
                    : 1)
                }
                onChange={(v) => updateFond({ opacity: v })}
              />
            )}

            {fondIsSvg && selectedFond?.tokens && (
              <TokenOverridesEditor
                tokens={selectedFond.tokens}
                overrides={draft.fond?.colorOverrides}
                onOpenPicker={(name) => setOverrideTokenTarget({ kind: 'fond', tokenName: name })}
                onClear={(name) => setFondColorOverride(name, null)}
                themeMap={theme as unknown as Record<string, string>}
                prefMap={{ colorPrimary, colorSecondary, colorBg }}
                title="Couleurs du fond"
                helper="Par défaut le fond utilise les couleurs du thème. Tu peux surcharger par grille."
              />
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

          <AppearanceColorsSection
            appearance={draft}
            onTargetColor={setColorTarget}
            labels={BINGO_COLOR_LABELS}
            hiddenTargets={fondImageActive ? ['bg'] : undefined}
          />

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
          withAlpha={pickerWithAlpha}
          onClose={() => setColorTarget(null)}
          onChange={onPickColor}
        />
        <ColorPickerModal
          open={overrideTokenTarget !== null}
          initial={
            (overrideTokenTarget &&
              (overrideTokenTarget.kind === 'frame'
                ? draft.frame.colorOverrides?.[overrideTokenTarget.tokenName]
                : draft.fond?.colorOverrides?.[overrideTokenTarget.tokenName])) ||
            '#000000'
          }
          title={
            overrideTokenTarget
              ? `Override "${tokenLabel(overrideTokenTarget.tokenName)}"`
              : ''
          }
          onClose={() => setOverrideTokenTarget(null)}
          onChange={(hex) => {
            if (!overrideTokenTarget) return;
            if (overrideTokenTarget.kind === 'frame') {
              setFrameColorOverride(overrideTokenTarget.tokenName, hex);
            } else {
              setFondColorOverride(overrideTokenTarget.tokenName, hex);
            }
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
// titre stylé + 3x3 cells de démonstration. Seule la case centrale est
// rendue comme validée (couleur accent + label "Défi complété") pour
// matérialiser l'état "case gagnée".
function BingoPreview({ appearance }: { appearance: SheetAppearance }) {
  const { textColor, accentColor, mutedColor, bgColor, fontId } = appearance;
  const fontDef = useMemo(
    () => FONTS.find((f) => f.id === fontId) ?? FONTS[0],
    [fontId],
  );
  // Le preview est rendu dans la modal customizer (bg = `themePaper`). On
  // remappe les tokens fond du cadre vers cette couleur d'environnement.
  const themePaper = usePreferences((s) => s.colorBg);
  const previewTokenOverrides = useMemo(
    () => makeFondTokenOverrides(themePaper),
    [themePaper],
  );

  return (
    <SheetSurface
      appearance={appearance}
      padding={10}
      tokenOverrides={previewTokenOverrides}>
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
              const isAccent = idx === 4;
              return (
                <View
                  key={c}
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 6,
                    backgroundColor: isAccent ? accentColor : mutedColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 2,
                  }}>
                  {isAccent ? (
                    <Text
                      numberOfLines={2}
                      adjustsFontSizeToFit
                      style={{
                        fontFamily: fontDef.variants.sans,
                        fontSize: 9,
                        color: bgColor,
                        textAlign: 'center',
                        fontWeight: '600',
                      }}>
                      Défi complété
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </SheetSurface>
  );
}
